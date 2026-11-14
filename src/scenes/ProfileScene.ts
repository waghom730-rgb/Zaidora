import Phaser from 'phaser';
import { ITEMS, LADDER, SKILLS, UPGRADES, summarizeHabits, xpToNext, type UpgradeId } from '../../shared/progression.js';
import { Arena } from '../arena/Arena';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { FIGHTERS, type FighterId } from '../entities/fighterDefs';
import { MOVES, type MoveId } from '../combat/moves';
import { profile } from '../services/profile';
import { audio } from '../systems/AudioManager';
import { onKeyPress } from '../systems/InputManager';
import { textStyle } from '../ui/textStyles';

const CX = GAME_WIDTH / 2;
const COL = [70, 470, 870];

const mins = (sec: number) => (sec < 3600 ? `${Math.round(sec / 60)} min` : `${(sec / 3600).toFixed(1)} h`);
const fighterName = (id: string | null) => (id ? FIGHTERS[id as FighterId]?.name ?? id : '—');
const moveName = (id: string | null) => (id ? MOVES[id as MoveId]?.name ?? id : '—');

/** Progress, records and fighting habits, plus the most recent matches. */
export class ProfileScene extends Phaser.Scene {
  constructor() {
    super('ProfileScene');
  }

  create(): void {
    const s = profile.save;
    const st = s.stats;
    const h = summarizeHabits(st);
    new Arena(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f, 0.78).setOrigin(0).setDepth(DEPTH.dim);
    this.add.text(CX, 46, 'PROFILE', textStyle(56, '#ffd23f')).setOrigin(0.5).setDepth(DEPTH.hud);
    const since = new Date(s.createdAt).toLocaleDateString();
    this.add
      .text(CX, 96, `${profile.online ? profile.username : 'Guest (this device only)'}   ·   playing since ${since}`, textStyle(16, '#ffffff', { italic: false, strokeRatio: 0.3 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    const learned = s.skills.map((k) => SKILLS[k].name).join(', ') || 'none yet';
    const upgrades = (Object.keys(UPGRADES) as UpgradeId[]).map((k) => `${UPGRADES[k].name} ${s.upgrades[k]}`).join(' · ');
    const outfits = s.outfits.owned.map((k) => ITEMS[k].name).join(', ') || 'none yet';
    this.column(0, 'PROGRESS', [
      `Level ${s.level}  (XP ${s.xp}/${xpToNext(s.level)})`,
      `Coins ${s.coins}   ·   Skill points ${s.skillPoints}`,
      `Ladder: stage ${s.ladder.stage + 1}/${LADDER.length}`,
      `Checkpoint: stage ${s.ladder.checkpoint + 1}   ·   Best ${s.ladder.best + 1}`,
      `Ladder clears: ${s.ladder.clears}`,
      '',
      `Upgrades: ${upgrades}`,
      `Skills: ${learned}`,
      `Items: Energy Tonic ×${s.inventory.energyTonic}, Lucky Charm ×${s.inventory.luckyCharm}`,
      `Outfits: ${outfits}`,
    ]);

    this.column(1, 'HABITS', [
      `Matches ${st.matches}   (W ${st.wins} · L ${st.losses} · D ${st.draws})`,
      `Win rate ${h.winRate}%   ·   Perfect rounds ${st.perfectRounds}`,
      `Favourite fighter: ${fighterName(h.favoriteFighter)}`,
      `Favourite move: ${moveName(h.favoriteMove)}`,
      `Usual difficulty: ${h.favoriteDifficulty ?? '—'}`,
      `Best combo ${st.maxCombo}   ·   Damage dealt ${st.damageDealt}`,
      `Parries ${st.parries}   ·   Blocks ${st.blocks}   ·   Specials ${st.specials}`,
      `Fight time ${mins(st.playTimeSec)}   ·   Avg match ${h.avgMatchSec}s`,
      `Sessions ${st.sessions}   ·   Time in game ${mins(st.sessionTimeSec)}`,
      `Streak ${st.streakDays} day${st.streakDays === 1 ? '' : 's'}   ·   Best ${st.bestStreak}`,
    ]);

    const recent = this.column(2, 'RECENT MATCHES', ['Loading…']);
    void profile.recentMatches(9).then((list) => {
      if (!this.scene.isActive()) return;
      recent.setText(
        list.length
          ? list
              .map((m) => {
                const res = m.outcome === 'win' ? 'WIN ' : m.outcome === 'lose' ? 'LOSS' : 'DRAW';
                const where = m.mode === 'ladder' ? `stage ${(m.stage ?? 0) + 1}` : m.difficulty;
                return `${res}  ${fighterName(m.fighter)} · ${where} · ${m.rounds[0]}–${m.rounds[1]}${m.rewards ? `  +${m.rewards.coins}c` : ''}`;
              })
              .join('\n')
          : 'No matches yet — go fight!',
      );
    });

    this.add.text(CX, 690, 'ESC  back', textStyle(16, '#ffffff', { italic: false })).setOrigin(0.5, 1).setAlpha(0.8).setDepth(DEPTH.hud);
    onKeyPress(this, (e) => {
      audio.unlock();
      if (e.code === 'Escape' || e.code === 'Enter') {
        audio.play('back');
        this.scene.start('MenuScene');
      }
    });
    this.cameras.main.fadeIn(300);
  }

  private column(i: number, title: string, lines: string[]): Phaser.GameObjects.Text {
    this.add.text(COL[i], 150, title, textStyle(22, '#ffcf9a')).setDepth(DEPTH.hud);
    return this.add
      .text(COL[i], 192, lines.join('\n'), textStyle(15, '#ffffff', { italic: false, strokeRatio: 0.25 }))
      .setLineSpacing(9)
      .setWordWrapWidth(370)
      .setDepth(DEPTH.hud);
  }
}
