import Phaser from 'phaser';
import { Arena } from '../arena/Arena';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { api } from '../services/api';
import { profile } from '../services/profile';
import { audio } from '../systems/AudioManager';
import { textStyle } from '../ui/textStyles';

const CX = GAME_WIDTH / 2;

const FORM_HTML = `
<form id="acct" autocomplete="on" style="width:420px;padding:26px 30px 22px;border-radius:16px;
  background:rgba(12,10,18,.88);border:2px solid rgba(255,210,63,.55);box-shadow:0 12px 40px rgba(0,0,0,.6);
  font-family:'Segoe UI',system-ui,sans-serif;color:#fff;box-sizing:border-box">
  <style>
    #acct input{width:100%;box-sizing:border-box;margin:0 0 12px;padding:12px 14px;border-radius:10px;
      border:1px solid #4a4060;background:#1c1828;color:#fff;font-size:17px;outline:none}
    #acct input:focus{border-color:#ffd23f}
    #acct button{cursor:pointer;border-radius:10px;font-weight:700;font-size:16px;padding:11px 0;border:0}
    #acct .row{display:flex;gap:10px;margin-top:4px}
    #acct .row button{flex:1}
    #acct .primary{background:linear-gradient(#ffd23f,#ff9a2e);color:#1a1020}
    #acct .secondary{background:#2c2540;color:#fff;border:1px solid #5a4f78}
    #acct .guest{width:100%;margin-top:14px;background:transparent;color:#cfc6e0;border:1px dashed #5a4f78}
    #acct button:disabled{opacity:.5;cursor:default}
    #acct-msg{min-height:22px;margin:12px 0 0;font-size:14px;color:#ffb0b0;text-align:center}
    #acct-srv{margin-top:12px;font-size:12px;color:#9a90b0;text-align:center}
  </style>
  <div style="font-size:20px;font-weight:800;margin-bottom:14px;letter-spacing:.5px">Sign in to save your progress</div>
  <input id="acct-user" name="username" placeholder="Username" maxlength="20" autocomplete="username" required>
  <input id="acct-pass" name="password" type="password" placeholder="Password (6+ characters)" maxlength="100" autocomplete="current-password" required>
  <div class="row">
    <button class="primary" type="submit" id="acct-login">Log in</button>
    <button class="secondary" type="button" id="acct-register">Create account</button>
  </div>
  <div id="acct-msg"></div>
  <button class="guest" type="button" id="acct-guest">Play as guest — progress saved on this device only</button>
  <div id="acct-srv">Checking save server…</div>
</form>`;

/** Login / sign-up / guest choice. Shown when there is no saved login to resume. */
export class AccountScene extends Phaser.Scene {
  private busy = false;
  private message = '';

  constructor() {
    super('AccountScene');
  }

  init(data: { message?: string }): void {
    this.message = data.message ?? '';
    this.busy = false;
  }

  create(): void {
    // Fight controls capture keys like A/S/Space globally; release them so typing works here.
    this.input.keyboard?.clearCaptures();

    new Arena(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f, 0.6).setOrigin(0).setDepth(DEPTH.dim);
    const logo = this.add.text(CX, 92, 'ZAIKORA', textStyle(110, '#ffd23f')).setOrigin(0.5).setDepth(DEPTH.hud);
    const grad = logo.context.createLinearGradient(0, 0, 0, logo.height);
    grad.addColorStop(0.15, '#fff3b0');
    grad.addColorStop(0.55, '#ffb02e');
    grad.addColorStop(0.95, '#ff5a1f');
    logo.setFill(grad);

    const dom = this.add.dom(CX, 420).createFromHTML(FORM_HTML).setDepth(DEPTH.hud);
    const el = <T extends HTMLElement>(id: string) => dom.getChildByID(id) as T;
    const form = el<HTMLFormElement>('acct');
    const user = el<HTMLInputElement>('acct-user');
    const pass = el<HTMLInputElement>('acct-pass');
    const msg = el<HTMLDivElement>('acct-msg');
    const srv = el<HTMLDivElement>('acct-srv');
    const buttons = ['acct-login', 'acct-register', 'acct-guest'].map((id) => el<HTMLButtonElement>(id));

    // Keep typing inside the form: the game's key handlers listen on the window.
    form.addEventListener('keydown', (e) => e.stopPropagation());
    msg.textContent = this.message;
    setTimeout(() => user.focus(), 50);

    const setBusy = (b: boolean) => {
      this.busy = b;
      buttons.forEach((btn) => (btn.disabled = b));
    };
    const enter = () => {
      audio.unlock();
      audio.setMuted(profile.save.settings.muted);
      audio.play('confirm');
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MenuScene'));
    };
    const submit = async (kind: 'login' | 'register') => {
      if (this.busy) return;
      const u = user.value.trim();
      if (!u || !pass.value) {
        msg.textContent = 'Enter a username and password';
        return;
      }
      setBusy(true);
      msg.style.color = '#cfc6e0';
      msg.textContent = kind === 'login' ? 'Logging in…' : 'Creating your account…';
      const r = kind === 'login' ? await profile.login(u, pass.value) : await profile.register(u, pass.value);
      if (r.ok) return enter();
      setBusy(false);
      msg.style.color = '#ffb0b0';
      msg.textContent = r.error;
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void submit('login');
    });
    el<HTMLButtonElement>('acct-register').addEventListener('click', () => void submit('register'));
    el<HTMLButtonElement>('acct-guest').addEventListener('click', () => {
      if (this.busy) return;
      profile.startGuest();
      enter();
    });

    api
      .health()
      .then((h) => {
        srv.textContent = h.db ? '● Save server online' : `● Database unreachable — play as a guest for now (${h.dbError ?? 'offline'})`;
        srv.style.color = h.db ? '#7dffb0' : '#ffb27a';
      })
      .catch(() => {
        srv.textContent = '● Save server not running — play as a guest, or start it with `npm run server`';
        srv.style.color = '#ffb27a';
      });

    this.cameras.main.fadeIn(350);
  }
}
