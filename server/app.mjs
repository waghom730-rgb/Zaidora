// ZAIKORA game server: a small JSON API over MongoDB, plus static hosting of the built game.
// The database credentials stay here (from environment variables) and never reach the browser.
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import * as P from '../shared/progression.js';
import { PASSWORD_MAX, PASSWORD_MIN, TOKEN_TTL_MS, USERNAME_RE, hashPassword, hashToken, newToken, verifyPassword } from './auth.mjs';
import { Store } from './store.mjs';

const MAX_BODY = 64 * 1024;
const RETRY_MS = 20000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Creates the server. It starts even if MongoDB is unreachable: the API answers 503 and keeps
 * retrying the connection, and the game still runs (guest mode) from the static files.
 */
export async function createApp({ mongoUri, dbName = 'zaikora', staticDir = null, log = console } = {}) {
  let store = null;
  let lastDbError = mongoUri ? 'connecting' : 'MONGODB_URI is not set';
  let retryTimer = null;
  let closed = false;

  async function connect() {
    if (!mongoUri || closed) return;
    try {
      store = await Store.connect(mongoUri, dbName);
      lastDbError = null;
      log.info?.(`[db] connected to database "${dbName}"`);
    } catch (err) {
      lastDbError = err.message.split('\n')[0];
      log.warn?.(`[db] cannot connect (${lastDbError}); retrying in ${RETRY_MS / 1000}s`);
      retryTimer = setTimeout(connect, RETRY_MS);
    }
  }
  await connect();

  const attempts = new Map(); // ip -> timestamps, for login/register rate limiting

  function db() {
    if (!store) throw new HttpError(503, 'Save server is offline');
    return store;
  }

  function rateLimit(req) {
    const ip = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60000);
    if (recent.length >= 10) throw new HttpError(429, 'Too many attempts, wait a minute');
    recent.push(now);
    attempts.set(ip, recent);
  }

  async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
      chunks.push(chunk);
    }
    if (!size) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
  }

  async function issueToken(playerId) {
    const token = newToken();
    const now = new Date();
    await db().authTokens.insertOne({ _id: hashToken(token), playerId, createdAt: now, expiresAt: new Date(now.getTime() + TOKEN_TTL_MS) });
    return token;
  }

  async function authenticate(req, body) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : typeof body?.token === 'string' ? body.token : null;
    if (!token) throw new HttpError(401, 'Not logged in');
    const t = await db().authTokens.findOne({ _id: hashToken(token) });
    if (!t || t.expiresAt < new Date()) throw new HttpError(401, 'Session expired, please log in again');
    const player = await db().players.findOne({ _id: t.playerId });
    if (!player) throw new HttpError(401, 'Account not found');
    return { player, tokenHash: t._id };
  }

  async function loadSave(player) {
    const doc = await db().saves.findOne({ _id: player._id });
    return { save: P.sanitizeSave(doc ?? undefined), rev: doc?.rev ?? 0, exists: !!doc };
  }

  /**
   * Read-modify-write of a player's save with optimistic concurrency: the write only lands if
   * nobody else changed the save in between (e.g. two open tabs); otherwise it retries.
   */
  async function mutateSave(player, fn) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { save, rev, exists } = await loadSave(player);
      const result = await fn(save);
      if (!result.ok) throw new HttpError(400, result.error);
      const doc = { ...result.save, username: player.username, rev: rev + 1 };
      if (!exists) {
        try {
          await db().saves.insertOne({ _id: player._id, ...doc });
          return result;
        } catch (err) {
          if (err.code === 11000) continue;
          throw err;
        }
      }
      const res = await db().saves.replaceOne({ _id: player._id, rev }, doc);
      if (res.matchedCount === 1) return result;
    }
    throw new HttpError(409, 'Your save changed elsewhere, try again');
  }

  const publicPlayer = (p) => ({ username: p.username, createdAt: p.createdAt.getTime() });

  // ---------------------------------------------------------------- routes

  const routes = {
    'GET /api/health': async () => ({ ok: true, db: !!store, dbError: store ? null : lastDbError }),

    'POST /api/register': async (req) => {
      rateLimit(req);
      const { username, password } = await readJson(req);
      if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
        throw new HttpError(400, 'Username: 3–20 letters, numbers or _');
      }
      if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        throw new HttpError(400, `Password: at least ${PASSWORD_MIN} characters`);
      }
      const now = new Date();
      const player = { _id: new ObjectId(), username, usernameLower: username.toLowerCase(), passwordHash: await hashPassword(password), createdAt: now, lastLoginAt: now };
      try {
        await db().players.insertOne(player);
      } catch (err) {
        if (err.code === 11000) throw new HttpError(409, 'That username is taken');
        throw err;
      }
      const save = P.newSave(now.getTime());
      await db().saves.insertOne({ _id: player._id, ...save, username, rev: 1 });
      return { status: 201, body: { token: await issueToken(player._id), player: publicPlayer(player), save } };
    },

    'POST /api/login': async (req) => {
      rateLimit(req);
      const { username, password } = await readJson(req);
      if (typeof username !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Enter a username and password');
      const player = await db().players.findOne({ usernameLower: username.toLowerCase() });
      if (!player || !(await verifyPassword(password, player.passwordHash))) throw new HttpError(401, 'Wrong username or password');
      await db().players.updateOne({ _id: player._id }, { $set: { lastLoginAt: new Date() } });
      const { save } = await loadSave(player);
      return { token: await issueToken(player._id), player: publicPlayer(player), save };
    },

    'POST /api/logout': async (req) => {
      const { tokenHash } = await authenticate(req);
      await db().authTokens.deleteOne({ _id: tokenHash });
      return { ok: true };
    },

    'GET /api/me': async (req) => {
      const { player } = await authenticate(req);
      const { save } = await loadSave(player);
      return { player: publicPlayer(player), save };
    },

    'POST /api/matches': async (req) => {
      const body = await readJson(req);
      const { player } = await authenticate(req, body);
      const v = P.validateReport(body.report);
      if (!v.ok) throw new HttpError(400, `Rejected match report: ${v.error}`);
      let rewards = null;
      const result = await mutateSave(player, (save) => {
        const r = P.applyMatchReport(save, v.report, Date.now());
        if (r.ok) rewards = r.rewards;
        return r;
      });
      await db().matches.insertOne({ playerId: player._id, username: player.username, at: new Date(), ...v.report, rewards });
      return { save: result.save, rewards };
    },

    'GET /api/matches': async (req, url) => {
      const { player } = await authenticate(req);
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
      const list = await db().matches.find({ playerId: player._id }, { projection: { _id: 0, playerId: 0, username: 0 } }).sort({ at: -1 }).limit(limit).toArray();
      return { matches: list.map((m) => ({ ...m, at: m.at.getTime() })) };
    },

    'POST /api/upgrades/buy': async (req) => {
      const { id } = await readJson(req);
      const { player } = await authenticate(req);
      return { save: (await mutateSave(player, (s) => P.buyUpgrade(s, id))).save };
    },

    'POST /api/skills/unlock': async (req) => {
      const { id } = await readJson(req);
      const { player } = await authenticate(req);
      return { save: (await mutateSave(player, (s) => P.unlockSkill(s, id))).save };
    },

    'POST /api/items/buy': async (req) => {
      const { id } = await readJson(req);
      const { player } = await authenticate(req);
      return { save: (await mutateSave(player, (s) => P.buyItem(s, id))).save };
    },

    'POST /api/items/use': async (req) => {
      const { id } = await readJson(req);
      const { player } = await authenticate(req);
      return { save: (await mutateSave(player, (s) => P.queueConsumable(s, id))).save };
    },

    'POST /api/outfits/equip': async (req) => {
      const { fighter, id } = await readJson(req);
      const { player } = await authenticate(req);
      return { save: (await mutateSave(player, (s) => P.equipOutfit(s, fighter, id))).save };
    },

    'PUT /api/settings': async (req) => {
      const settings = await readJson(req);
      const { player } = await authenticate(req);
      return { save: (await mutateSave(player, (s) => P.updateSettings(s, settings))).save };
    },

    'POST /api/sessions/start': async (req) => {
      const { player } = await authenticate(req);
      const startedAt = new Date();
      const { insertedId } = await db().playSessions.insertOne({ playerId: player._id, startedAt, endedAt: null, durationSec: 0 });
      const result = await mutateSave(player, (s) => ({ ok: true, save: P.recordSessionStart(s, startedAt.getTime()) }));
      return { sessionId: insertedId.toHexString(), save: result.save };
    },

    // Called with navigator.sendBeacon when the page closes, so the token comes in the body.
    'POST /api/sessions/end': async (req) => {
      const body = await readJson(req);
      const { player } = await authenticate(req, body);
      if (typeof body.sessionId !== 'string' || !ObjectId.isValid(body.sessionId)) throw new HttpError(400, 'Bad session id');
      const session = await db().playSessions.findOne({ _id: new ObjectId(body.sessionId), playerId: player._id, endedAt: null });
      if (!session) return { ok: true };
      const endedAt = new Date();
      const durationSec = Math.min(6 * 3600, Math.round((endedAt - session.startedAt) / 1000));
      await db().playSessions.updateOne({ _id: session._id }, { $set: { endedAt, durationSec } });
      await mutateSave(player, (s) => ({ ok: true, save: P.recordSessionEnd(s, durationSec, endedAt.getTime()) }));
      return { ok: true };
    },
  };

  // ---------------------------------------------------------------- static files

  async function serveStatic(req, res, url) {
    if (!staticDir || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
    const root = path.resolve(staticDir);
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) return false;
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    } catch {
      file = path.join(root, 'index.html');
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : data);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- dispatch

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      if (url.pathname.startsWith('/api/')) {
        const handler = routes[`${req.method} ${url.pathname}`];
        if (!handler) return send(404, { error: 'Not found' });
        const out = await handler(req, url);
        return out?.status ? send(out.status, out.body) : send(200, out);
      }
      if (await serveStatic(req, res, url)) return;
      send(404, { error: 'Not found' });
    } catch (err) {
      if (err instanceof HttpError) return send(err.status, { error: err.message });
      log.error?.('[api]', req.method, url.pathname, err);
      send(500, { error: 'Server error' });
    }
  });

  return {
    server,
    get dbReady() {
      return !!store;
    },
    async close() {
      closed = true;
      clearTimeout(retryTimer);
      await new Promise((r) => server.close(() => r()));
      await store?.close();
    },
  };
}
