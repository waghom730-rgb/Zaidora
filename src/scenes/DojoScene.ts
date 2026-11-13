import Phaser from 'phaser';
import {
  FIGHTER_IDS,
  ITEMS,
  SKILLS,
  UPGRADES,
  upgradeCost,
  xpToNext,
  type ConsumableId,
  type OutfitId,
  type SkillId,
  type UpgradeId,
} from '../../shared/progression.js';
import { Arena } from '../arena/Arena';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { FIGHTERS } from '../entities/fighterDefs';
import { profile, type ActionResult } from '../services/profile';
import { audio } from '../systems/AudioManager';
import { onKeyPress } from '../systems/InputManager';
import { textStyle } from '../ui/textStyles';

const CX = GAME_WIDTH / 2;
const TABS = ['UPGRADES', 'SKILLS', 'ITEMS', 'OUTFITS'] as const;
const LIST_Y = 210;
const ROW_H = 44;

interface Entry {
  label: string;
  right: string;
  desc: string;
  dim?: boolean;
  /** ENTER: buy / unlock / equip. */
  run?: () => Promise<ActionResult>;
  done?: string;
  /** U: use a consumable for the next match. */
  use?: () => Promise<ActionResult>;
}

/** Spend progress: coins on upgrades and items, skill points on skills; change outfits. */
export class DojoScene extends Phaser.Scene {
  private tab = 0;
  private selected = 0;
  private busy = false;
  private back = 'MenuScene';
  private resources!: Phaser.GameObjects.Text;
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private rows: Array<{ left: Phaser.GameObjects.Text; right: Phaser.GameObjects.Text }> = [];
  private highlight!: Phaser.GameObjects.Graphics;
  private desc!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super('DojoScene');
  }

  init(data: { back?: string }): void {
    this.back = data.back ?? 'MenuScene';
    this.selected = 0;
    this.busy = false;
  }

  create(): void {
    new Arena(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f, 0.72).setOrigin(0).setDepth(DEPTH.dim);
    this.add.text(CX, 48, 'DOJO', textStyle(64, '#ffd23f')).setOrigin(0.5).setDepth(DEPTH.hud);
    this.resources = this.add.text(CX, 104, '', textStyle(17, '#ffffff', { italic: false, strokeRatio: 0.3 })).setOrigin(0.5).setDepth(DEPTH.hud);

    this.tabTexts = TABS.map((t, i) => this.add.text(CX - 330 + i * 220, 156, t, textStyle(22)).setOrigin(0.5).setDepth(DEPTH.hud));
    this.highlight = this.add.graphics().setDepth(DEPTH.hud - 1);
    this.rows = Array.from({ length: 7 }, (_, i) => ({
      left: this.add.text(CX - 380, LIST_Y + i * ROW_H, '', textStyle(20, '#ffffff', { italic: false })).setOrigin(0, 0.5).setDepth(DEPTH.hud),
      right: this.add.text(CX + 380, LIST_Y + i * ROW_H, '', textStyle(18, '#ffcf9a', { italic: false })).setOrigin(1, 0.5).setDepth(DEPTH.hud),
    }));
    this.desc = this.add.text(CX, 540, '', textStyle(16, '#d9d2ea', { italic: false, strokeRatio: 0.3 })).setOrigin(0.5).setDepth(DEPTH.hud);
    this.status = this.add.text(CX, 584, '', textStyle(18, '#7dffb0', { italic: false })).setOrigin(0.5).setDepth(DEPTH.hud);
    this.add
      .text(CX, 690, 'W / S choose     A / D tab     ENTER buy · learn · wear     U use item     ESC back', textStyle(15, '#ffffff', { italic: false, strokeRatio: 0.3 }))
      .setOrigin(0.5, 1)
      .setAlpha(0.8)
      .setDepth(DEPTH.hud);
    if (!profile.online) {
      this.add
        .text(CX, 630, 'Guest progress is saved on this device only — create an account to keep it everywhere.', textStyle(13, '#ffb27a', { italic: false, strokeRatio: 0.3 }))
        .setOrigin(0.5)
        .setDepth(DEPTH.hud);
    }

    onKeyPress(this, (e) => this.onKey(e));
    this.render();
    this.cameras.main.fadeIn(300);
  }

  private entries(): Entry[] {
    const s = profile.save;
    switch (TABS[this.tab]) {
      case 'UPGRADES':
        return (Object.keys(UPGRADES) as UpgradeId[]).map((id) => {
          const def = UPGRADES[id];
          const lv = s.upgrades[id];
          const maxed = lv >= def.maxLevel;
          return {
            label: `${def.name}   ${'◆'.repeat(lv)}${'◇'.repeat(def.maxLevel - lv)}`,
            right: maxed ? 'MAX' : `${upgradeCost(id, lv)} coins`,
            desc: def.desc,
            dim: maxed,
            run: () => profile.buyUpgrade(id),
            done: `${def.name} upgraded to level ${lv + 1}`,
          };
        });
      case 'SKILLS':
        return (Object.keys(SKILLS) as SkillId[]).map((id) => {
          const def = SKILLS[id];
          const learned = s.skills.includes(id);
          const locked = s.level < def.level;
          return {
            label: `${learned ? '✓ ' : ''}${def.name}`,
            right: learned ? 'LEARNED' : locked ? `needs level ${def.level}` : `${def.cost} skill pt`,
            desc: def.desc,
            dim: learned || locked,
            run: () => profile.unlockSkill(id),
            done: `Learned ${def.name}!`,
          };
        });
      case 'ITEMS':
        return (['energyTonic', 'luckyCharm'] as ConsumableId[]).map((id) => {
          const def = ITEMS[id];
          const active = s.queued.includes(id);
          return {
            label: `${def.name}   ×${s.inventory[id]}${active ? '   (active next match)' : ''}`,
            right: `${def.price} coins`,
            desc: `${def.desc}.  ENTER buys one, U uses one for your next match.`,
            run: () => profile.buyItem(id),
            done: `Bought ${def.name}`,
            use: () => profile.useItem(id),
          };
        });
      case 'OUTFITS':
        return FIGHTER_IDS.flatMap((fighter) => {
          const options: Array<OutfitId | 'default'> = [
            'default',
            ...(Object.keys(ITEMS) as Array<keyof typeof ITEMS>).filter((k) => ITEMS[k].kind === 'outfit' && ITEMS[k].fighter === fighter) as OutfitId[],
          ];
          return options.map((id): Entry => {
            const name = id === 'default' ? 'Original' : ITEMS[id].name;
            const owned = id === 'default' || s.outfits.owned.includes(id);
            const worn = s.outfits.equipped[fighter] === id;
            return {
              label: `${FIGHTERS[fighter].name} · ${name}`,
              right: worn ? 'WEARING' : owned ? 'owned — ENTER to wear' : `${ITEMS[id as OutfitId].price} coins`,
              desc: id === 'default' ? `${FIGHTERS[fighter].name}'s original look` : `${ITEMS[id].desc}. Also unlocked by clearing the Arcade Ladder as ${FIGHTERS[fighter].name}.`,
              dim: worn,
              run: () => (owned ? profile.equipOutfit(fighter, id) : profile.buyItem(id as OutfitId)),
              done: owned ? `${FIGHTERS[fighter].name} now wears ${name}` : `Bought ${name} — press ENTER again to wear it`,
            };
          });
        });
    }
  }

  private render(): void {
    const s = profile.save;
    this.resources.setText(
      `Level ${s.level}   ·   XP ${s.xp}/${xpToNext(s.level)}   ·   ${s.coins} coins   ·   ${s.skillPoints} skill point${s.skillPoints === 1 ? '' : 's'}`,
    );
    this.tabTexts.forEach((t, i) => t.setColor(i === this.tab ? '#ffd23f' : '#8f86a8').setScale(i === this.tab ? 1.08 : 1));
    const entries = this.entries();
    this.selected = Math.min(this.selected, entries.length - 1);
    this.rows.forEach((row, i) => {
      const e = entries[i];
      row.left.setText(e?.label ?? '').setColor(e?.dim ? '#8f86a8' : '#ffffff');
      row.right.setText(e?.right ?? '').setColor(e?.dim ? '#8f86a8' : '#ffcf9a');
    });
    const g = this.highlight;
    g.clear();
    g.fillStyle(0xffd23f, 0.14);
    g.fillRoundedRect(CX - 400, LIST_Y + this.selected * ROW_H - 20, 800, 40, 10);
    g.lineStyle(2, 0xffd23f, 0.6);
    g.strokeRoundedRect(CX - 400, LIST_Y + this.selected * ROW_H - 20, 800, 40, 10);
    this.desc.setText(entries[this.selected]?.desc ?? '');
  }

  private async act(fn: (() => Promise<ActionResult>) | undefined, done: string): Promise<void> {
    if (!fn || this.busy) return;
    this.busy = true;
    this.status.setColor('#cfc6e0').setText('…');
    const r = await fn();
    this.busy = false;
    if (!this.scene.isActive()) return;
    if (r.ok) {
      audio.play('confirm');
      this.status.setColor('#7dffb0').setText(done);
    } else {
      audio.play('denied');
      this.status.setColor('#ffb0b0').setText(r.error);
    }
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    audio.unlock();
    const entries = this.entries();
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.selected = (this.selected + entries.length - 1) % entries.length;
        audio.play('select');
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.selected = (this.selected + 1) % entries.length;
        audio.play('select');
        break;
      case 'KeyA':
      case 'ArrowLeft':
      case 'KeyQ':
        this.tab = (this.tab + TABS.length - 1) % TABS.length;
        this.selected = 0;
        this.status.setText('');
        audio.play('select');
        break;
      case 'KeyD':
      case 'ArrowRight':
      case 'KeyE':
        this.tab = (this.tab + 1) % TABS.length;
        this.selected = 0;
        this.status.setText('');
        audio.play('select');
        break;
      case 'Enter':
      case 'Space':
      case 'KeyJ': {
        const entry = entries[this.selected];
        void this.act(entry?.run, entry?.done ?? '');
        return;
      }
      case 'KeyU': {
        const entry = entries[this.selected];
        if (entry?.use) void this.act(entry.use, 'Ready — it will be used in your next match');
        return;
      }
      case 'Escape':
        if (this.busy) return;
        this.cameras.main.fadeOut(250, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(this.back));
        return;
      default:
        return;
    }
    this.render();
  }
}
