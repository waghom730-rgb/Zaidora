// Server integration tests against a real MongoDB. They run only when TEST_MONGODB_URI is set
// (e.g. a local `mongod`), use a throwaway database, and drop it afterwards:
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
import type { AddressInfo } from 'node:net';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';

const URI = process.env.TEST_MONGODB_URI;
const DB = `zaikora_test_${process.pid}`;

describe.skipIf(!URI)('game server (MongoDB)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let base = '';
  let client: MongoClient;

  beforeAll(async () => {
    app = await createApp({ mongoUri: URI, dbName: DB, log: {} as Console });
    await new Promise<void>((r) => app.server.listen(0, () => r()));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    client = await new MongoClient(URI as string).connect();
  });

  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
    await app?.close();
  });

  async function call(method: string, path: string, body?: unknown, token?: string) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  const win = (p: Record<string, unknown> = {}) => ({
    report: {
      mode: 'versus', fighter: 'kaen', opponent: 'yoru', difficulty: 'hard', outcome: 'win', rounds: [2, 0],
      durationSec: 70, damageDealt: 200, damageTaken: 60, maxCombo: 4, specials: 1, parries: 2, blocks: 5,
      perfectRounds: 0, moves: { jab: 8, flameStrike: 2 }, ...p,
    },
  });

  let token = '';

  it('reports database health', async () => {
    expect((await call('GET', '/api/health')).body).toMatchObject({ ok: true, db: true });
  });

  it('validates registration input', async () => {
    expect((await call('POST', '/api/register', { username: 'a', password: 'secret1' })).status).toBe(400);
    expect((await call('POST', '/api/register', { username: 'ryu_fan', password: '123' })).status).toBe(400);
  });

  it('registers, rejects duplicates (case-insensitive) and never stores the password', async () => {
    const r = await call('POST', '/api/register', { username: 'Tester_1', password: 'hunter22' });
    expect(r.status).toBe(201);
    expect(r.body.save.level).toBe(1);
    token = r.body.token;
    expect((await call('POST', '/api/register', { username: 'tester_1', password: 'other123' })).status).toBe(409);
    const doc = await client.db(DB).collection('players').findOne({ usernameLower: 'tester_1' });
    expect(doc?.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(doc)).not.toContain('hunter22');
  });

  it('logs in with the right password only', async () => {
    expect((await call('POST', '/api/login', { username: 'tester_1', password: 'wrong!!' })).status).toBe(401);
    const r = await call('POST', '/api/login', { username: 'TESTER_1', password: 'hunter22' });
    expect(r.status).toBe(200);
    expect(r.body.player.username).toBe('Tester_1');
  });

  it('requires a valid token', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, 'forged-token')).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, token)).body.player.username).toBe('Tester_1');
  });

  it('applies match reports server-side and stores the match history', async () => {
    const r = await call('POST', '/api/matches', win(), token);
    expect(r.status).toBe(200);
    expect(r.body.rewards.coins).toBe(55);
    expect(r.body.save.stats.moves.flameStrike).toBe(2);
    const list = await call('GET', '/api/matches', undefined, token);
    expect(list.body.matches).toHaveLength(1);
    expect(list.body.matches[0]).toMatchObject({ outcome: 'win', fighter: 'kaen', parries: 2 });
  });

  it('rejects tampered reports', async () => {
    expect((await call('POST', '/api/matches', win({ damageDealt: 99999 }), token)).status).toBe(400);
    expect((await call('POST', '/api/matches', win({ mode: 'ladder', stage: 7 }), token)).status).toBe(400); // not the current stage
  });

  it('advances the ladder and saves checkpoints', async () => {
    let save;
    for (let stage = 0; stage < 3; stage++) {
      save = (await call('POST', '/api/matches', win({ mode: 'ladder', stage, difficulty: stage < 2 ? 'easy' : 'normal' }), token)).body.save;
    }
    expect(save.ladder).toMatchObject({ stage: 3, checkpoint: 3 });
    save = (await call('POST', '/api/matches', win({ mode: 'ladder', stage: 3, outcome: 'lose', rounds: [0, 2] }), token)).body.save;
    expect(save.ladder.stage).toBe(3);
  });

  it('spends coins on upgrades and rejects what you cannot afford', async () => {
    const r = await call('POST', '/api/upgrades/buy', { id: 'vitality' }, token);
    expect(r.status).toBe(200);
    expect(r.body.save.upgrades.vitality).toBe(1);
    const broke = await call('POST', '/api/items/buy', { id: 'kaenMidnight' }, token);
    expect(broke.status).toBe(400);
    expect(broke.body.error).toMatch(/coins/);
  });

  it('uses consumables and equips only owned outfits', async () => {
    const r = await call('POST', '/api/items/use', { id: 'energyTonic' }, token);
    expect(r.body.save.queued).toEqual(['energyTonic']);
    expect((await call('POST', '/api/outfits/equip', { fighter: 'kaen', id: 'kaenMidnight' }, token)).status).toBe(400);
  });

  it('two simultaneous saves both land (no lost updates)', async () => {
    const before = (await call('GET', '/api/me', undefined, token)).body.save.stats.matches;
    await Promise.all([call('POST', '/api/matches', win(), token), call('POST', '/api/matches', win(), token)]);
    expect((await call('GET', '/api/me', undefined, token)).body.save.stats.matches).toBe(before + 2);
  });

  it('records play sessions (habits) with server-measured duration', async () => {
    const s = await call('POST', '/api/sessions/start', {}, token);
    expect(s.body.save.stats.sessions).toBeGreaterThan(0);
    const end = await call('POST', '/api/sessions/end', { token, sessionId: s.body.sessionId });
    expect(end.status).toBe(200);
    const doc = await client.db(DB).collection('playSessions').findOne({});
    expect(doc?.endedAt).toBeInstanceOf(Date);
  });

  it('logout invalidates the token', async () => {
    expect((await call('POST', '/api/logout', {}, token)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, token)).status).toBe(401);
  });
});
