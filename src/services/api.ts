// HTTP client for the ZAIKORA game server. The browser only ever holds a login token —
// database credentials live on the server.
import type { MatchReport, Rewards, SaveData } from '../../shared/progression.js';

export interface PlayerInfo {
  username: string;
  createdAt: number;
}

export interface MatchRecord extends MatchReport {
  at: number;
  rewards: Rewards | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'zaikora.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null): void {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage unavailable: the login lasts until the page closes.
    }
  },
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the save server');
  }
  let data: { error?: string } | null = null;
  try {
    data = (await res.json()) as { error?: string };
  } catch {
    // Not JSON — e.g. the dev server is running without the API server.
  }
  if (!res.ok) {
    const fallback = res.status >= 500 || res.status === 404 ? 'Save server is not running' : `Request failed (${res.status})`;
    throw new ApiError(res.status, data?.error ?? fallback);
  }
  return data as T;
}

type SaveResponse = { save: SaveData };

export const api = {
  health: () => request<{ ok: boolean; db: boolean; dbError: string | null }>('GET', '/api/health'),
  register: (username: string, password: string) =>
    request<{ token: string; player: PlayerInfo; save: SaveData }>('POST', '/api/register', { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; player: PlayerInfo; save: SaveData }>('POST', '/api/login', { username, password }),
  logout: () => request<{ ok: boolean }>('POST', '/api/logout', {}),
  me: () => request<{ player: PlayerInfo; save: SaveData }>('GET', '/api/me'),
  reportMatch: (report: MatchReport) => request<{ save: SaveData; rewards: Rewards }>('POST', '/api/matches', { report }),
  matches: (limit = 10) => request<{ matches: MatchRecord[] }>('GET', `/api/matches?limit=${limit}`),
  buyUpgrade: (id: string) => request<SaveResponse>('POST', '/api/upgrades/buy', { id }),
  unlockSkill: (id: string) => request<SaveResponse>('POST', '/api/skills/unlock', { id }),
  buyItem: (id: string) => request<SaveResponse>('POST', '/api/items/buy', { id }),
  useItem: (id: string) => request<SaveResponse>('POST', '/api/items/use', { id }),
  equipOutfit: (fighter: string, id: string) => request<SaveResponse>('POST', '/api/outfits/equip', { fighter, id }),
  saveSettings: (settings: Partial<SaveData['settings']>) => request<SaveResponse>('PUT', '/api/settings', settings),
  startSession: () => request<{ sessionId: string; save: SaveData }>('POST', '/api/sessions/start', {}),
  /** Fire-and-forget when the page closes (sendBeacon can't set headers, so the token goes in the body). */
  endSession(sessionId: string): void {
    const token = tokenStore.get();
    if (!token || typeof navigator.sendBeacon !== 'function') return;
    navigator.sendBeacon('/api/sessions/end', new Blob([JSON.stringify({ token, sessionId })], { type: 'application/json' }));
  },
};
