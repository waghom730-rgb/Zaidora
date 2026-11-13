// The player's profile, whichever way they play:
//   online — logged-in account; every change goes through the server (authoritative, MongoDB)
//   guest  — no account; the same shared rules run locally and the save lives in localStorage
import * as P from '../../shared/progression.js';
import { ApiError, api, tokenStore, type MatchRecord } from './api';

type Kind = 'none' | 'guest' | 'online';
export type ActionResult = { ok: true } | { ok: false; error: string };
export type ReportResult = { ok: true; rewards: P.Rewards } | { ok: false; error: string; rewards: P.Rewards | null };

const GUEST_FLAG = 'zaikora.guest';
const GUEST_SAVE = 'zaikora.guestSave';
const GUEST_MATCHES = 'zaikora.guestMatches';

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Storage unavailable (private mode): progress lasts until the page closes.
    }
  },
  json<T>(key: string): T | null {
    try {
      return JSON.parse(store.get(key) ?? 'null') as T | null;
    } catch {
      return null;
    }
  },
};

const message = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');

class Profile {
  kind: Kind = 'none';
  username = '';
  save: P.SaveData = P.newSave();
  private sessionId: string | null = null;
  private sessionStart = Date.now();
  private closeHooked = false;

  get online(): boolean {
    return this.kind === 'online';
  }

  /** Resumes a previous login (saved token) or guest profile. Returns false if neither exists. */
  async restore(): Promise<{ ok: boolean; error?: string }> {
    if (tokenStore.get()) {
      try {
        const { player, save } = await api.me();
        this.becomeOnline(player.username, save);
        return { ok: true };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) tokenStore.set(null);
        else return { ok: false, error: `${message(e)} — log in again later, or play as a guest` };
      }
    }
    if (store.get(GUEST_FLAG)) {
      this.startGuest();
      return { ok: true };
    }
    return { ok: false };
  }

  async login(username: string, password: string): Promise<ActionResult> {
    try {
      const r = await api.login(username, password);
      tokenStore.set(r.token);
      this.becomeOnline(r.player.username, r.save);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: message(e) };
    }
  }

  async register(username: string, password: string): Promise<ActionResult> {
    try {
      const r = await api.register(username, password);
      tokenStore.set(r.token);
      this.becomeOnline(r.player.username, r.save);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: message(e) };
    }
  }

  startGuest(): void {
    this.kind = 'guest';
    this.username = 'Guest';
    store.set(GUEST_FLAG, '1');
    this.save = P.recordSessionStart(P.sanitizeSave(store.json(GUEST_SAVE)));
    this.persistGuest();
    this.trackSession();
  }

  async logout(): Promise<void> {
    this.endSession();
    if (this.online) await api.logout().catch(() => undefined);
    tokenStore.set(null);
    store.set(GUEST_FLAG, null);
    this.kind = 'none';
    this.username = '';
    this.save = P.newSave();
  }

  private becomeOnline(username: string, save: P.SaveData): void {
    this.kind = 'online';
    this.username = username;
    this.save = P.sanitizeSave(save);
    store.set(GUEST_FLAG, null);
    this.trackSession();
    api
      .startSession()
      .then((r) => {
        this.sessionId = r.sessionId;
        this.save = P.sanitizeSave(r.save);
      })
      .catch(() => undefined);
  }

  /** Records session length (a habit) when the page is closed or hidden for good. */
  private trackSession(): void {
    this.sessionStart = Date.now();
    if (this.closeHooked) return;
    this.closeHooked = true;
    window.addEventListener('pagehide', () => this.endSession());
  }

  private endSession(): void {
    if (this.online && this.sessionId) {
      api.endSession(this.sessionId);
      this.sessionId = null;
    } else if (this.kind === 'guest') {
      this.save = P.recordSessionEnd(this.save, (Date.now() - this.sessionStart) / 1000);
      this.persistGuest();
      this.sessionStart = Date.now();
    }
  }

  private persistGuest(): void {
    store.set(GUEST_SAVE, JSON.stringify(this.save));
  }

  /** Runs a change on the server (online) or with the shared rules locally (guest). */
  private async mutate(
    remote: () => Promise<{ save: P.SaveData }>,
    local: (s: P.SaveData) => P.Result<{ save: P.SaveData }>,
  ): Promise<ActionResult> {
    if (this.online) {
      try {
        this.save = P.sanitizeSave((await remote()).save);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: message(e) };
      }
    }
    const r = local(this.save);
    if (!r.ok) return r;
    this.save = r.save;
    this.persistGuest();
    return { ok: true };
  }

  buyUpgrade = (id: P.UpgradeId) => this.mutate(() => api.buyUpgrade(id), (s) => P.buyUpgrade(s, id));
  unlockSkill = (id: P.SkillId) => this.mutate(() => api.unlockSkill(id), (s) => P.unlockSkill(s, id));
  buyItem = (id: P.ItemId) => this.mutate(() => api.buyItem(id), (s) => P.buyItem(s, id));
  useItem = (id: P.ConsumableId) => this.mutate(() => api.useItem(id), (s) => P.queueConsumable(s, id));
  equipOutfit = (fighter: P.FighterId, id: P.OutfitId | 'default') =>
    this.mutate(() => api.equipOutfit(fighter, id), (s) => P.equipOutfit(s, fighter, id));
  saveSettings = (settings: Partial<P.SaveData['settings']>) =>
    this.mutate(() => api.saveSettings(settings), (s) => P.updateSettings(s, settings));

  /** Saves a finished match and returns the rewards it earned. */
  async reportMatch(report: P.MatchReport): Promise<ReportResult> {
    if (this.online) {
      try {
        const r = await api.reportMatch(report);
        this.save = P.sanitizeSave(r.save);
        return { ok: true, rewards: r.rewards };
      } catch (e) {
        // Show what the match would have earned, but be honest that it wasn't saved.
        const preview = P.applyMatchReport(this.save, report);
        return { ok: false, error: `Not saved: ${message(e)}`, rewards: preview.ok ? preview.rewards : null };
      }
    }
    const r = P.applyMatchReport(this.save, report);
    if (!r.ok) return { ok: false, error: r.error, rewards: null };
    this.save = r.save;
    this.persistGuest();
    if (this.kind === 'guest') {
      const list = store.json<MatchRecord[]>(GUEST_MATCHES) ?? [];
      list.unshift({ ...report, at: Date.now(), rewards: r.rewards });
      store.set(GUEST_MATCHES, JSON.stringify(list.slice(0, 20)));
    }
    return { ok: true, rewards: r.rewards };
  }

  async recentMatches(limit = 8): Promise<MatchRecord[]> {
    if (this.online) {
      try {
        return (await api.matches(limit)).matches;
      } catch {
        return [];
      }
    }
    return (store.json<MatchRecord[]>(GUEST_MATCHES) ?? []).slice(0, limit);
  }

  /** Combat modifiers for the player's fighter (upgrades, skills, queued items). */
  mods(): P.FighterMods {
    return this.kind === 'none' ? { ...P.BASE_MODS } : P.fighterMods(this.save);
  }

  outfit(fighter: P.FighterId): P.OutfitId | 'default' {
    return this.save.outfits.equipped[fighter] ?? 'default';
  }
}

export const profile = new Profile();
