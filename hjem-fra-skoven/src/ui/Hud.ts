export interface HudState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  exhausted: boolean;
  weaponName: string;
  ammoText: string;
  slots: { key: string; name: string; active: boolean; locked: boolean; count: number }[];
  meat: number;
  shards: number;
  trophies: number;
  windDeg: number;
  windLabel: string;
  progress: number;
  distLeft: number;
  level: number;
  hint: string;
  aiming: boolean;
  hurt: number;
}

const CSS = `
.hud{position:fixed;inset:0;pointer-events:none;font-family:Georgia,serif;color:#efe8d2;text-shadow:0 1px 3px #000;display:none}
.hud.on{display:block}
.hud .bars{position:absolute;left:24px;bottom:24px;width:260px}
.hud .bar{height:14px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.25);margin-top:6px;position:relative;border-radius:2px;overflow:hidden}
.hud .bar i{display:block;height:100%;width:100%;transition:width .08s}
.hud .hp i{background:linear-gradient(#d24a3a,#8f2a20)}
.hud .st i{background:linear-gradient(#d8c25a,#8e7e2a)}
.hud .st.low i{background:linear-gradient(#777,#444)}
.hud .lbl{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
.hud .inv{position:absolute;right:24px;bottom:24px;text-align:right;font-size:18px;line-height:1.55}
.hud .inv b{font-size:26px}
.hud .weap{margin-top:8px;font-size:13px;opacity:.8;letter-spacing:.05em}
.hud .wind{position:absolute;right:24px;top:20px;text-align:center;width:96px}
.hud .wind .dial{width:64px;height:64px;margin:0 auto;border:2px solid rgba(255,255,255,.45);border-radius:50%;background:rgba(0,0,0,.4);position:relative}
.hud .wind .arrow{position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0}
.hud .wind .arrow:before{content:'';position:absolute;left:-5px;top:-26px;border:5px solid transparent;border-bottom:16px solid #9fd8ff;border-top:0}
.hud .wind .arrow:after{content:'';position:absolute;left:-1.5px;top:-12px;width:3px;height:26px;background:#9fd8ff}
.hud .wind small{display:block;font-size:11px;margin-top:4px;opacity:.85;letter-spacing:.05em}
.hud .prog{position:absolute;left:50%;top:18px;transform:translateX(-50%);width:340px;text-align:center;font-size:13px}
.hud .prog .track{height:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.25);margin-top:6px;position:relative;border-radius:3px}
.hud .prog .track i{position:absolute;left:0;top:-4px;width:12px;height:12px;border-radius:50%;background:#ffb04a;margin-left:-6px;box-shadow:0 0 8px #ff9a2a}
.hud .cross{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:rgba(255,255,255,.8);box-shadow:0 0 0 1px rgba(0,0,0,.6);transition:all .12s}
.hud .cross.aim{width:22px;height:22px;margin:-11px;background:transparent;border:2px solid rgba(255,255,255,.85)}
.hud .cross.hit{border-color:#ff6a4a;background:#ff6a4a}
.hud .hint{position:absolute;left:50%;bottom:130px;transform:translateX(-50%);font-size:20px;background:rgba(0,0,0,.45);padding:6px 16px;border-radius:4px;display:none}
.hud .toast{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-size:24px;opacity:0;transition:opacity .4s;text-align:center}
.hud .toast.on{opacity:1}
.hud .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(160,10,10,.75));opacity:0}
.hud .low{position:absolute;inset:0;box-shadow:inset 0 0 120px rgba(140,0,0,.0)}
`;

export class Hud {
  private root: HTMLDivElement;
  private q: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  private hitTimer = 0;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="vig"></div>
      <div class="prog"><span data-k="prog"></span><div class="track"><i data-k="progdot" style="left:0%"></i></div></div>
      <div class="wind"><div class="dial"><div class="arrow" data-k="wind"></div></div><small data-k="windlabel"></small></div>
      <div class="cross" data-k="cross"></div>
      <div class="toast" data-k="toast"></div>
      <div class="hint" data-k="hint"></div>
      <div class="bars">
        <div class="lbl">Liv</div><div class="bar hp"><i data-k="hp"></i></div>
        <div class="bar st" data-k="stbar"><i data-k="st"></i></div><div class="lbl" style="margin-top:2px">Udholdenhed</div>
      </div>
      <div class="inv">
        <div><span data-k="wname"></span> <b data-k="arrows"></b></div>
        <div>Kød <b data-k="meat"></b> &nbsp; Skærv <b data-k="shards"></b> &nbsp; Trofæer <b data-k="trophies"></b></div>
        <div class="weap" data-k="slots"></div>
      </div>`;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.q[e.dataset.k!] = e));
  }

  show(on: boolean) {
    this.root.classList.toggle('on', on);
  }

  toast(text: string, ms = 2200) {
    this.q.toast.textContent = text;
    this.q.toast.classList.add('on');
    this.toastTimer = ms / 1000;
  }

  hitMarker() {
    this.hitTimer = 0.18;
  }

  update(s: HudState, dt: number) {
    this.q.hp.style.width = `${(100 * s.hp) / s.maxHp}%`;
    this.q.st.style.width = `${(100 * s.stamina) / s.maxStamina}%`;
    this.q.stbar.classList.toggle('low', s.exhausted);
    this.q.arrows.textContent = s.ammoText;
    this.q.wname.textContent = s.weaponName;
    this.q.slots.innerHTML = s.slots
      .map((x) => `<span style="margin-left:12px;${x.active ? 'color:#ffd98a;opacity:1' : x.locked ? 'opacity:.3' : ''}">[${x.key}] ${x.locked ? 'låst' : x.name}${x.count > 1 ? ' ▾' : ''}</span>`)
      .join('');
    this.q.meat.textContent = String(s.meat);
    this.q.shards.textContent = String(s.shards);
    this.q.trophies.textContent = String(s.trophies);
    this.q.wind.style.transform = `rotate(${s.windDeg}deg)`;
    this.q.windlabel.textContent = s.windLabel;
    this.q.prog.textContent = `Bane ${s.level} · ${Math.max(0, Math.round(s.distLeft))} m til hulen`;
    this.q.progdot.style.left = `${Math.min(100, Math.max(0, s.progress * 100))}%`;
    this.q.hint.style.display = s.hint ? 'block' : 'none';
    if (s.hint) this.q.hint.textContent = s.hint;
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.q.cross.className = `cross${s.aiming ? ' aim' : ''}${this.hitTimer > 0 ? ' hit' : ''}`;
    const vig = this.root.querySelector<HTMLElement>('.vig')!;
    const low = s.hp / s.maxHp < 0.3 ? 0.25 + 0.15 * Math.sin(performance.now() / 180) : 0;
    vig.style.opacity = String(Math.min(1, s.hurt * 1.6 + low));
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.q.toast.classList.remove('on');
    }
  }
}
