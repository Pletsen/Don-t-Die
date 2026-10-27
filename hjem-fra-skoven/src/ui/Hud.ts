export interface HudState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  exhausted: boolean;
  crossSize: number;
  drawP: number;
  weaponName: string;
  ammoText: string;
  slots: { key: string; name: string; active: boolean; locked: boolean; count: number }[];
  meat: number;
  shards: number;
  trophies: number;
  windDeg: number;
  windLabel: string;
  /** 0 = scent blows back (safe), 1 = across, 2 = ahead towards the animals (danger) */
  windDanger: number;
  /** metres animals can hear the hunter */
  noise: number;
  progress: number;
  distLeft: number;
  level: number;
  hint: string;
  aiming: boolean;
  hurt: number;
  /** screen angles (deg) of hunting animals that are off screen */
  threats: number[];
}

const CSS = `
.hud{position:fixed;inset:0;pointer-events:none;font-family:Georgia,'Times New Roman',serif;color:#efe8d2;text-shadow:0 1px 3px #000;display:none}
.hud.on{display:block}
.hud .bars{position:absolute;left:24px;bottom:24px;width:260px}
.hud .bar{height:12px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.22);margin-top:5px;position:relative;border-radius:2px;overflow:hidden}
.hud .bar i{display:block;height:100%;width:100%;transform-origin:left;transition:transform .08s}
.hud .hp i{background:linear-gradient(#d24a3a,#8f2a20)}
.hud .st i{background:linear-gradient(#d8c25a,#8e7e2a)}
.hud .st.low i{background:linear-gradient(#777,#444)}
.hud .lbl{font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
.hud .noise{display:flex;gap:3px;margin-top:8px;align-items:flex-end;height:16px}
.hud .noise i{display:block;width:8px;background:rgba(255,255,255,.18);border-radius:1px}
.hud .noise i.on{background:#e8d38a}
.hud .noise i.loud{background:#e8744a}
.hud .noise span{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin-left:6px}
.hud .inv{position:absolute;right:24px;bottom:24px;text-align:right;font-size:16px;line-height:1.5}
.hud .inv .wname{font-size:22px;color:#f1dfae}
.hud .inv .ammo{font-size:16px;opacity:.9}
.hud .weap{margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.04em}
.hud .weap span{margin-left:10px}
.hud .weap .on{color:#ffd98a}
.hud .weap .off{opacity:.3}
.hud .wind{position:absolute;right:24px;top:20px;text-align:center;width:128px}
.hud .wind .dial{width:64px;height:64px;margin:0 auto;border:2px solid rgba(255,255,255,.45);border-radius:50%;background:rgba(0,0,0,.4);position:relative;transition:border-color .4s,box-shadow .4s}
.hud .wind.d0 .dial{border-color:#7fc88a}
.hud .wind.d2 .dial{border-color:#e8744a;box-shadow:0 0 12px rgba(232,116,74,.5)}
.hud .wind .arrow{position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0}
.hud .wind .arrow:before{content:'';position:absolute;left:-5px;top:-26px;border:5px solid transparent;border-bottom:16px solid #cfe8ff;border-top:0}
.hud .wind .arrow:after{content:'';position:absolute;left:-1.5px;top:-12px;width:3px;height:26px;background:#cfe8ff}
.hud .wind small{display:block;font-size:11px;margin-top:4px;opacity:.9;letter-spacing:.03em}
.hud .prog{position:absolute;left:50%;top:18px;transform:translateX(-50%);width:340px;text-align:center;font-size:13px}
.hud .prog .track{height:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.25);margin-top:6px;position:relative;border-radius:3px}
.hud .prog .track i{position:absolute;left:0;top:-4px;width:12px;height:12px;border-radius:50%;background:#ffb04a;margin-left:-6px;box-shadow:0 0 8px #ff9a2a}
.hud .boss{position:absolute;left:50%;top:58px;transform:translateX(-50%);width:420px;text-align:center;font-size:15px;letter-spacing:.14em;text-transform:uppercase;display:none}
.hud .boss .bar{height:10px;border-color:rgba(255,200,150,.4)}
.hud .boss .bar i{background:linear-gradient(#c8462e,#701e12)}
.hud .cross{position:absolute;left:50%;top:50%;overflow:visible;transform:translate(-50%,-50%);filter:drop-shadow(0 0 2px #000)}
.hud .cross.hit *{stroke:#ff6a4a}
.hud .hint{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);font-size:18px;background:rgba(0,0,0,.5);padding:6px 16px;border-radius:4px;display:none}
.hud .toast{position:absolute;left:50%;top:30%;transform:translateX(-50%);font-size:20px;opacity:0;transition:opacity .35s;text-align:center;max-width:70vw;background:rgba(10,12,10,.45);padding:6px 18px;border-radius:20px}
.hud .toast.on{opacity:1}
.hud .tipbox{position:absolute;left:24px;top:110px;max-width:360px;padding:12px 18px;font-size:16px;line-height:1.45;
  background:rgba(14,18,14,.85);border:1px solid rgba(220,200,150,.35);border-left:4px solid #e0c47a;border-radius:3px;opacity:0;transition:opacity .4s}
.hud .tipbox.on{opacity:1}
.hud .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(160,10,10,.75));opacity:0}
.hud .dmg{position:absolute;left:50%;top:50%;width:0;height:0}
.hud .dmg i{position:absolute;left:-90px;top:-250px;width:180px;height:60px;border-radius:50%;border-top:8px solid rgba(220,30,20,.85);filter:blur(2px);opacity:0;transition:opacity .5s}
.hud .threat{position:absolute;left:50%;top:50%;width:0;height:0;display:none}
.hud .threat i{position:absolute;left:-12px;top:-230px;width:0;height:0;border:12px solid transparent;border-bottom:20px solid rgba(255,90,60,.9);border-top:0;filter:drop-shadow(0 0 4px #000)}
.fps{position:fixed;left:8px;top:6px;font:12px monospace;color:#cfe;text-shadow:0 1px 2px #000;pointer-events:none;z-index:40}
.hud .fade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none}
.hud .unlock{position:fixed;inset:0;display:none;align-items:center;justify-content:center;font-size:26px;letter-spacing:.12em;background:rgba(0,0,0,.45)}
.hud .unlock.on{display:flex}
`;

/** In-game HUD. Every DOM write is skipped when the value did not change (no layout churn per frame). */
export class Hud {
  private root: HTMLDivElement;
  private q: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  private tipTimer = 0;
  private hitTimer = 0;
  private cache = new Map<string, string>();
  private dmgArcs: HTMLElement[] = [];
  private dmgT: number[] = [0, 0, 0, 0];
  private dmgNext = 0;
  private threatEls: HTMLElement[] = [];
  private fpsEl: HTMLDivElement;
  private pendingTip: { text: string; seconds: number } | null = null;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="vig" data-k="vig"></div>
      <div class="prog"><span data-k="prog"></span><div class="track"><i data-k="progdot" style="left:0%"></i></div></div>
      <div class="boss" data-k="boss"><span data-k="bossname"></span><div class="bar"><i data-k="bossbar"></i></div></div>
      <div class="wind" data-k="windbox"><div class="dial"><div class="arrow" data-k="wind"></div></div><small data-k="windlabel"></small></div>
      <svg class="cross" data-k="cross" viewBox="-50 -50 100 100" width="40" height="40">
        <circle r="40" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="5"></circle>
        <circle r="40" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="4" stroke-dasharray="0 252" transform="rotate(-90)" data-k="ring"></circle>
        <circle r="2.6" fill="#fff" stroke="rgba(0,0,0,.6)" stroke-width="1"></circle>
        <g stroke="rgba(255,255,255,.9)" stroke-width="3" data-k="ticks">
          <line x1="0" y1="-50" x2="0" y2="-32"></line><line x1="0" y1="50" x2="0" y2="32"></line>
          <line x1="-50" y1="0" x2="-32" y2="0"></line><line x1="50" y1="0" x2="32" y2="0"></line>
        </g>
      </svg>
      <div class="dmg" data-k="dmg"></div>
      <div data-k="threats"></div>
      <div class="toast" data-k="toast"></div>
      <div class="tipbox" data-k="tip"></div>
      <div class="hint" data-k="hint"></div>
      <div class="bars">
        <div class="lbl">Liv</div><div class="bar hp"><i data-k="hp"></i></div>
        <div class="bar st" data-k="stbar"><i data-k="st"></i></div><div class="lbl" style="margin-top:2px">Pust</div>
        <div class="noise" data-k="noise"><i style="height:5px"></i><i style="height:8px"></i><i style="height:11px"></i><i style="height:14px"></i><i style="height:16px"></i><span data-k="noiselbl">Stille</span></div>
      </div>
      <div class="inv">
        <div class="wname" data-k="wname"></div>
        <div class="ammo" data-k="ammo"></div>
        <div>Kød <b data-k="meat"></b> · Skærv <b data-k="shards"></b> · Trofæer <b data-k="trophies"></b></div>
        <div class="weap" data-k="slots"></div>
      </div>
      <div class="fade" data-k="fade"></div>
      <div class="unlock" data-k="unlock">Klik for at fortsætte</div>`;
    parent.appendChild(this.root);
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps';
    parent.appendChild(this.fpsEl);
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.q[e.dataset.k!] = e));
    for (let i = 0; i < 4; i++) {
      const arc = document.createElement('i');
      this.q.dmg.appendChild(arc);
      this.dmgArcs.push(arc);
      const t = document.createElement('div');
      t.className = 'threat';
      t.innerHTML = '<i></i>';
      this.q.threats.appendChild(t);
      this.threatEls.push(t);
    }
  }

  /** Writes only when the value changed. */
  private set(key: string, el: HTMLElement, prop: 'text' | 'html' | 'transform' | 'width' | 'class' | 'display' | 'opacity', value: string) {
    const k = `${key}:${prop}`;
    if (this.cache.get(k) === value) return;
    this.cache.set(k, value);
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'class') el.setAttribute('class', value);
    else if (prop === 'display') el.style.display = value;
    else if (prop === 'opacity') el.style.opacity = value;
    else if (prop === 'width') el.style.width = value;
    else el.style.transform = value;
  }

  /** Small FPS / frame-time readout (settings → Vis FPS). Pass null to hide. */
  fps(text: string | null) {
    this.fpsEl.style.display = text ? 'block' : 'none';
    if (text) this.fpsEl.textContent = text;
  }

  show(on: boolean) {
    this.root.classList.toggle('on', on);
  }

  /** "Click to continue" when the browser took the mouse back. */
  setUnlocked(on: boolean) {
    this.q.unlock.classList.toggle('on', on);
    if (on) this.root.classList.add('on');
  }

  toast(text: string, ms = 2200) {
    this.q.toast.textContent = text;
    this.q.toast.classList.add('on');
    this.toastTimer = ms / 1000;
  }

  /** A help panel for the first time something happens. */
  tip(text: string, seconds = 8) {
    // never on top of a toast: wait until it has faded
    if (this.toastTimer > 0) {
      this.pendingTip = { text, seconds };
      return;
    }
    this.q.tip.textContent = text;
    this.q.tip.classList.add('on');
    this.tipTimer = seconds;
  }

  hitMarker() {
    this.hitTimer = 0.18;
  }

  /** Red arc at the screen edge towards whatever hurt you. */
  hurtFrom(screenDeg: number) {
    const arc = this.dmgArcs[this.dmgNext];
    this.dmgT[this.dmgNext] = 1.2;
    arc.style.transform = `rotate(${screenDeg}deg)`;
    arc.style.transformOrigin = '90px 250px';
    arc.style.opacity = '1';
    this.dmgNext = (this.dmgNext + 1) % this.dmgArcs.length;
  }

  /** Boss health bar; pass null to hide. */
  setBoss(name: string | null, ratio = 1) {
    this.set('boss', this.q.boss, 'display', name ? 'block' : 'none');
    if (name) {
      this.set('bossname', this.q.bossname, 'text', name);
      this.set('bossbar', this.q.bossbar, 'transform', `scaleX(${Math.max(0, ratio).toFixed(3)})`);
    }
  }

  /** Black fade over everything (arrival at the cave). */
  fade(v: number) {
    this.q.fade.style.opacity = String(v);
    if (v > 0) this.root.classList.add('on');
  }

  update(s: HudState, dt: number) {
    const q = this.q;
    this.set('hp', q.hp, 'transform', `scaleX(${Math.max(0, s.hp / s.maxHp).toFixed(3)})`);
    this.set('st', q.st, 'transform', `scaleX(${Math.max(0, s.stamina / s.maxStamina).toFixed(3)})`);
    this.set('stbar', q.stbar, 'class', `bar st${s.exhausted ? ' low' : ''}`);
    this.set('wname', q.wname, 'text', s.weaponName);
    this.set('ammo', q.ammo, 'text', s.ammoText);
    this.set('meat', q.meat, 'text', String(s.meat));
    this.set('shards', q.shards, 'text', String(s.shards));
    this.set('trophies', q.trophies, 'text', String(s.trophies));
    this.set(
      'slots',
      q.slots,
      'html',
      s.slots.map((x) => `<span class="${x.active ? 'on' : x.locked ? 'off' : ''}">[${x.key}] ${x.locked ? '–' : x.name}${x.count > 1 ? ' ▾' : ''}</span>`).join(''),
    );
    this.set('wind', q.wind, 'transform', `rotate(${Math.round(s.windDeg)}deg)`);
    this.set('windlabel', q.windlabel, 'text', s.windLabel);
    this.set('windbox', q.windbox, 'class', `wind d${s.windDanger}`);
    this.set('prog', q.prog, 'text', `Bane ${s.level} · ${Math.max(0, Math.round(s.distLeft))} m til hulen`);
    this.set('progdot', q.progdot, 'width', '12px');
    q.progdot.style.left = `${Math.min(100, Math.max(0, s.progress * 100)).toFixed(1)}%`;
    this.set('hint', q.hint, 'display', s.hint ? 'block' : 'none');
    if (s.hint) this.set('hinttext', q.hint, 'text', s.hint);

    // noise meter: 5 bars up to 30 m
    const lvl = Math.min(5, Math.ceil(s.noise / 6));
    const noiseKey = `${lvl}`;
    if (this.cache.get('noise') !== noiseKey) {
      this.cache.set('noise', noiseKey);
      q.noise.querySelectorAll('i').forEach((el, i) => el.setAttribute('class', i < lvl ? (lvl >= 4 ? 'loud' : 'on') : ''));
      q.noiselbl.textContent = lvl === 0 ? 'Stille' : lvl <= 1 ? 'Lavmælt' : lvl <= 3 ? 'Hørbar' : 'Larm';
    }

    // crosshair: size from spread, ring fills with the draw
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.set('cross', q.cross, 'class', `cross${this.hitTimer > 0 ? ' hit' : ''}`);
    const size = String(s.crossSize);
    if (this.cache.get('csize') !== size) {
      this.cache.set('csize', size);
      q.cross.setAttribute('width', size);
      q.cross.setAttribute('height', size);
    }
    const ring = `${(251 * s.drawP).toFixed(0)} 252|${s.drawP >= 1 ? 1 : 0}`;
    if (this.cache.get('ring') !== ring) {
      this.cache.set('ring', ring);
      q.ring.setAttribute('stroke-dasharray', `${(251 * s.drawP).toFixed(0)} 252`);
      q.ring.setAttribute('stroke', s.drawP >= 1 ? '#ffd45a' : 'rgba(255,255,255,.95)');
    }
    this.set('ticks', q.ticks, 'opacity', s.aiming ? '1' : '0.75');

    const low = s.hp / s.maxHp < 0.3 ? 0.25 + 0.15 * Math.sin(performance.now() / 180) : 0;
    q.vig.style.opacity = String(Math.min(1, s.hurt * 1.6 + low).toFixed(2));

    // damage arcs fade, off-screen threats point the way
    for (let i = 0; i < this.dmgArcs.length; i++) {
      if (this.dmgT[i] <= 0) continue;
      this.dmgT[i] -= dt;
      if (this.dmgT[i] <= 0) this.dmgArcs[i].style.opacity = '0';
    }
    for (let i = 0; i < this.threatEls.length; i++) {
      const a = s.threats[i];
      const el = this.threatEls[i];
      this.set(`th${i}d`, el, 'display', a === undefined ? 'none' : 'block');
      if (a !== undefined) this.set(`th${i}t`, el, 'transform', `rotate(${Math.round(a)}deg)`);
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.q.toast.classList.remove('on');
    } else if (this.pendingTip) {
      const t = this.pendingTip;
      this.pendingTip = null;
      this.tip(t.text, t.seconds);
    }
    if (this.tipTimer > 0) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) this.q.tip.classList.remove('on');
    }
  }
}
