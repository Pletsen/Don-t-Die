import { UPGRADES, type Cost, type UpgradeId } from '../data/upgrades';
import { effective, FAMILIES, MAX_UPGRADE, TRACKS, trackLabel, upgradeCost, WEAPONS, type Effective, type Track, type WeaponDef } from '../data/weapons';
import { getLevel, LEVEL_COUNT } from '../data/levels';
import { SPECIES, type SpeciesId } from '../data/animals';
import { DIFFICULTY } from '../data/difficulty';
import type { Bank, Save } from '../game/save';
import { settings, type Difficulty, type Quality } from '../game/settings';

const CSS = `
.scr{position:fixed;inset:0;display:none;align-items:center;justify-content:center;font-family:Georgia,'Times New Roman',serif;color:#efe8d2;
  background:radial-gradient(ellipse at center,rgba(8,12,9,.45),rgba(4,6,5,.86));pointer-events:auto;overflow:auto}
.scr.on{display:flex}
.scr.clear{background:linear-gradient(90deg,rgba(4,6,5,.86) 0%,rgba(4,6,5,.55) 46%,rgba(4,6,5,0) 75%)}
.scr .card{max-width:820px;width:calc(100% - 32px);padding:26px 34px;background:rgba(14,18,14,.84);border:1px solid rgba(220,200,150,.28);
  box-shadow:0 10px 50px #000;border-radius:4px;margin:16px;box-sizing:border-box;max-height:calc(100vh - 32px);overflow:auto}
.scr .card.side{margin-right:auto;margin-left:5vw;max-width:520px;background:rgba(14,18,14,.7)}
.scr .logo{font-size:clamp(44px,9vw,96px);letter-spacing:.18em;margin:0 0 2px;color:#f1dfae;font-weight:normal;line-height:1;
  text-shadow:0 2px 18px rgba(0,0,0,.8),0 0 40px rgba(255,190,90,.12)}
.scr .logo small{display:block;font-size:13px;letter-spacing:.42em;color:#a8b58a;margin-top:10px;text-transform:uppercase}
.scr h2{margin:0 0 10px;font-size:28px;font-weight:normal;color:#f1dfae;letter-spacing:.06em}
.scr h3{margin:18px 0 6px;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#a8b58a;font-weight:normal}
.scr p{line-height:1.55;margin:6px 0}
.scr .sub{opacity:.78;font-style:italic;margin-bottom:12px}
.scr button{font:inherit;color:#1a140a;background:#e0c47a;border:0;padding:11px 24px;font-size:17px;letter-spacing:.08em;cursor:pointer;margin:12px 10px 0 0;border-radius:2px}
.scr button:hover{background:#f3d98f}
.scr button.ghost{background:transparent;color:#cdbf98;border:1px solid rgba(220,200,150,.4);font-size:14px;padding:8px 16px}
.scr button.ghost:hover{background:rgba(220,200,150,.12)}
.scr button:disabled{opacity:.35;cursor:default}
.scr .keys{display:grid;grid-template-columns:auto 1fr;gap:3px 16px;font-size:14px}
.scr .keys b{color:#f1dfae;font-weight:normal;text-align:right}
.scr .row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.scr .row small{opacity:.7;display:block}
.scr .pips{letter-spacing:3px;color:#e0c47a}
.scr .bank{display:flex;gap:26px;font-size:18px;margin:6px 0 8px;flex-wrap:wrap}
.scr .bank b{font-size:28px;color:#f1dfae}
.scr .row button{margin:0;padding:6px 14px;font-size:14px}
.scr .locked{opacity:.4}
.scr .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 4px}
.scr .tabs button{margin:0;padding:7px 12px;font-size:13px;background:transparent;color:#cdbf98;border:1px solid rgba(220,200,150,.3)}
.scr .tabs button.on{background:#e0c47a;color:#1a140a}
.scr .wcard{border:1px solid rgba(255,255,255,.12);padding:10px 14px;margin:10px 0;background:rgba(255,255,255,.03)}
.scr .wcard h4{margin:0;font-size:19px;font-weight:normal;color:#f1dfae}
.scr .wcard .stats{font-size:13px;opacity:.8;margin:2px 0 6px}
.scr .wcard .row{padding:5px 0;font-size:15px}
.scr .tip{border-left:3px solid #7fa3c4;padding-left:12px;margin-top:12px;opacity:.9;font-size:14px}
.scr .map{position:relative;width:100%;aspect-ratio:3.4/1;border-radius:4px;margin:8px 0;
  background:linear-gradient(90deg,#c9b98a 0%,#b9a676 45%,#5d6a7a 80%,#2a3346 100%);box-shadow:inset 0 0 40px rgba(0,0,0,.55)}
.scr .map svg{position:absolute;inset:0;width:100%;height:100%}
.scr .node{position:absolute;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;border:2px solid #3a2a18;
  background:#efe1b8;color:#2a1c0e;font-size:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;
  box-shadow:0 1px 4px rgba(0,0,0,.6);padding:0;margin:0}
.scr .node:hover{transform:translate(-50%,-50%) scale(1.15)}
.scr .node.boss{width:34px;height:34px;background:#d9a35a;font-weight:bold}
.scr .node.lock{background:#5b5b58;color:#999;cursor:default;border-color:#333}
.scr .node.sel{outline:3px solid #fff4c8;outline-offset:2px}
.scr .node.new{background:#ffd76a;animation:pulse 1.4s infinite}
@keyframes pulse{50%{box-shadow:0 0 0 6px rgba(255,215,106,.35)}}
.scr .marks{font-size:13px;letter-spacing:.06em;opacity:.9}
.scr .marks span{margin-right:12px}
.scr .marks .got{color:#ffd76a}
.scr .marks .no{opacity:.35}
.scr label.set{display:grid;grid-template-columns:180px 1fr 54px;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:15px}
.scr label.set input[type=range]{width:100%;accent-color:#e0c47a}
.scr input[type=checkbox]{accent-color:#e0c47a;width:16px;height:16px}
.scr label.set output{text-align:right;opacity:.8}
.scr .seg{display:flex;gap:6px;flex-wrap:wrap}
.scr .seg button{margin:0;padding:6px 12px;font-size:14px;background:transparent;color:#cdbf98;border:1px solid rgba(220,200,150,.35)}
.scr .seg button.on{background:#e0c47a;color:#1a140a}
.scr .stats td{padding:3px 14px 3px 0}
.scr .load{font-size:22px;letter-spacing:.2em;opacity:.85}
`;

const BOSS_NAMES: Record<number, string> = { 10: 'Alfaulven', 20: 'Kæmpe-elgen', 30: 'Kæmpebjørnen' };

function costText(c: Cost): string {
  const parts: string[] = [];
  if (c.meat) parts.push(`${c.meat} kød`);
  if (c.shards) parts.push(`${c.shards} skærv`);
  if (c.trophies) parts.push(`${c.trophies} trofæ${c.trophies > 1 ? 'er' : ''}`);
  return parts.join(' + ');
}

export function canAfford(bank: Bank, c: Cost): boolean {
  return bank.meat >= (c.meat ?? 0) && bank.shards >= (c.shards ?? 0) && bank.trophies >= (c.trophies ?? 0);
}

export interface RunSummary {
  level: number;
  meat: number;
  shards: number;
  trophies: number;
  firstClear: boolean;
  replayMul: number;
  marks: string[];
}

function todName(tod: number): string {
  return tod < 0.2 ? 'eftermiddag' : tod < 0.42 ? 'sen eftermiddag' : tod < 0.6 ? 'skumring' : tod < 0.8 ? 'aften' : 'nat';
}

function windName(angle: number): string {
  const ahead = -Math.cos(angle);
  return ahead > 0.5 ? 'medvind (din fært driver fremad)' : ahead < -0.5 ? 'modvind' : 'sidevind';
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export class Screens {
  private el: HTMLDivElement;
  private tab = 'map';

  constructor(parent: HTMLElement, private click: () => void = () => {}) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'scr';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.click();
    });
  }

  hide() {
    this.el.classList.remove('on', 'clear');
    this.el.innerHTML = '';
  }

  private show(html: string, cls = '', cardCls = '') {
    this.el.className = `scr on ${cls}`;
    this.el.innerHTML = `<div class="card ${cardCls}">${html}</div>`;
  }

  private on(sel: string, fn: () => void) {
    this.el.querySelector(sel)?.addEventListener('click', fn);
  }

  /** A plain "loading" card, painted before a heavy level build. */
  loading(text: string) {
    this.show(`<div class="load">${text}</div>`);
  }

  menu(save: Save, cb: { play: () => void; settings: () => void; reset: () => void }) {
    const fresh = save.level === 1 && !save.levels[1]?.cleared;
    this.show(
      `
      <div class="logo">Færten<small>Kom hjem, før natten tager dig</small></div>
      <p class="sub" style="margin-top:18px">${LEVEL_COUNT} strækninger skov ligger mellem dig og hulen. Dyrene får færten af dig, og de bliver vildere, jo mørkere det bliver.</p>
      <details ${fresh ? "open" : ""}><summary style="cursor:pointer;letter-spacing:.2em;text-transform:uppercase;color:#a8b58a;font-size:13px;margin:14px 0 6px">Styring</summary>
      <div class="keys">
        <b>WASD · mus</b><span>gå og se dig om</span>
        <b>Venstre museknap</b><span>hold for at spænde / tage tilløb, slip for at skyde. Nærkamp slår ved klik</span>
        <b>Højre museknap</b><span>sigt (zoom og ro på hånden)</span>
        <b>Shift</b><span>løb (koster pust og larmer)</span>
        <b>Mellemrum</b><span>hop</span>
        <b>Ctrl eller C</b><span>undvigerulle</span>
        <b>E</b><span>saml op, spis kød, tag fælder op</span>
        <b>1-4 · hjul</b><span>skift våben</span>
        <b>Esc eller P</b><span>pause og indstillinger</span>
        <b>M</b><span>slå lyden til/fra</span>
      </div></details>
      <div class="tip"><b>Vinden afgør alt.</b> Kompasset viser, hvor din fært driver hen. Driver den mod dyrene, lugter de dig langt væk. Gå på tværs af vinden eller imod den.</div>
      <button id="play">${fresh ? 'Begynd turen' : 'Fortsæt'}</button>
      <button id="settings" class="ghost">Indstillinger</button>
      ${fresh ? '' : '<button id="reset" class="ghost">Start forfra</button>'}
    `,
      'clear',
      'side',
    );
    this.on('#play', cb.play);
    this.on('#settings', cb.settings);
    this.on('#reset', () => {
      if (confirm('Slet dit fremskridt og start forfra?')) cb.reset();
    });
  }

  hub(
    save: Save,
    last: RunSummary | null,
    cb: {
      go: () => void;
      select: (n: number) => void;
      buy: (id: UpgradeId) => void;
      buyWeapon: (id: string) => void;
      upgradeWeapon: (id: string, track: Track) => void;
      settings: () => void;
      menu: () => void;
    },
  ) {
    const b = save.bank;
    const tabs: [string, string][] = [
      ['map', 'Banekort'],
      ['hunter', 'Jægeren'],
      ...FAMILIES.map((f, i) => [`f${i + 1}`, `${f.key} · ${f.name}`] as [string, string]),
    ];
    const tabHtml = tabs.map(([id, t]) => `<button data-tab="${id}" class="${id === this.tab ? 'on' : ''}">${t}</button>`).join('');
    let body = '';
    if (this.tab === 'map') body = this.mapHtml(save);
    else if (this.tab === 'hunter') {
      body = UPGRADES.map((u) => {
        const lvl = save.upgrades[u.id];
        const maxed = lvl >= u.costs.length;
        const cost = maxed ? null : u.costs[lvl];
        const ok = cost ? canAfford(b, cost) : false;
        return `<div class="row"><div>${u.name} <span class="pips">${'●'.repeat(lvl)}${'○'.repeat(u.costs.length - lvl)}</span><small>${u.desc}</small></div>
        <div>${maxed ? '<small>fuldt opgraderet</small>' : `<small style="display:inline;margin-right:10px">${costText(cost!)}</small><button data-up="${u.id}" ${ok ? '' : 'disabled'}>Køb</button>`}</div></div>`;
      }).join('');
    } else {
      const fam = Number(this.tab.slice(1));
      body = WEAPONS.filter((w) => w.family === fam).map((w) => this.weaponCard(w, save, b)).join('');
    }
    let lastHtml = '';
    if (last) {
      const parts = [plural(last.meat, 'stykke kød', 'stykker kød'), `${last.shards} skærv`, plural(last.trophies, 'trofæ', 'trofæer')];
      lastHtml = `<p>Hjem fra bane ${last.level}: ${parts.join(', ')}.${last.firstClear ? ' Første gang: bonusskærv med.' : last.replayMul < 1 ? ` (genspillet bane: ${Math.round(last.replayMul * 100)} % skærv)` : ''}${
        last.marks.length ? ` Nye mærker: <b>${last.marks.join(', ')}</b>.` : ''
      }</p>`;
    }
    const sel = save.selected;
    this.show(`
      <h2>Hulen</h2>
      <div class="sub">${last ? 'Ilden brænder. Du er hjemme for i nat.' : 'Ilden brænder. Her er du i sikkerhed.'} · Sværhedsgrad: ${DIFFICULTY[settings.difficulty].name}</div>
      ${lastHtml}
      <div class="bank"><span>Kød <b>${b.meat}</b></span><span>Skærv <b>${b.shards}</b></span><span>Trofæer <b>${b.trophies}</b></span></div>
      <div class="tabs">${tabHtml}</div>
      ${body}
      <button id="go">Gå ud i skoven – bane ${sel}${BOSS_NAMES[sel] ? ` (${BOSS_NAMES[sel]})` : ''}</button>
      <button id="settings" class="ghost">Indstillinger</button>
      <button id="menu" class="ghost">Hovedmenu</button>
    `);
    this.on('#go', cb.go);
    this.on('#settings', cb.settings);
    this.on('#menu', cb.menu);
    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab!;
        this.hub(save, last, cb);
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>('[data-lvl]').forEach((btn) => btn.addEventListener('click', () => cb.select(Number(btn.dataset.lvl))));
    this.el.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((btn) => btn.addEventListener('click', () => cb.buy(btn.dataset.up as UpgradeId)));
    this.el.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((btn) => btn.addEventListener('click', () => cb.buyWeapon(btn.dataset.buy!)));
    this.el.querySelectorAll<HTMLButtonElement>('[data-wup]').forEach((btn) => {
      const [id, track] = btn.dataset.wup!.split(':');
      btn.addEventListener('click', () => cb.upgradeWeapon(id, track as Track));
    });
  }

  /** Parchment map of the 30 stretches: afternoon on the left, night on the right. */
  private mapHtml(save: Save): string {
    const pts: [number, number][] = [];
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const t = i / (LEVEL_COUNT - 1);
      pts.push([4 + t * 92, 50 + Math.sin(t * Math.PI * 3.2) * 30 + Math.sin(t * 17) * 4]);
    }
    const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
    const nodes = pts
      .map(([x, y], i) => {
        const n = i + 1;
        const st = save.levels[n];
        const unlocked = n <= save.level;
        const cls = ['node', n % 10 === 0 ? 'boss' : '', !unlocked ? 'lock' : '', n === save.selected ? 'sel' : '', unlocked && !st?.cleared ? 'new' : ''].join(' ');
        return `<button class="${cls}" style="left:${x}%;top:${y}%" ${unlocked ? `data-lvl="${n}"` : 'disabled'} title="Bane ${n}">${n}</button>`;
      })
      .join('');
    const n = save.selected;
    const lvl = getLevel(n);
    const st = save.levels[n];
    const animals = (Object.keys(lvl.animals) as SpeciesId[]).map((id) => `${lvl.animals[id]} ${SPECIES[id].name}`).join(', ');
    const mark = (got: boolean | undefined, label: string) => `<span class="${got ? 'got' : 'no'}">${got ? '✓' : '○'} ${label}</span>`;
    return `
      <div class="map"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="rgba(60,40,20,.55)" stroke-width=".6" stroke-dasharray="1.4 1"/></svg>${nodes}</div>
      <div class="row" style="border:0"><div>
        <b>Bane ${n}${BOSS_NAMES[n] ? ` · ${BOSS_NAMES[n]} venter` : ''}</b>
        <small>${Math.round(lvl.length)} m · ${todName(lvl.tod)} · ${windName(lvl.windAngle)}${lvl.whiteDeer ? ' · hvid hjort set' : ''}</small>
        <small>Dyr: ${animals}</small>
      </div></div>
      <div class="marks">Mærker: ${mark(st?.marks.home, 'Hjemme')} ${mark(st?.marks.unseen, 'Uset (ingen jagede dig)')} ${lvl.whiteDeer ? mark(st?.marks.whiteDeer, 'Hvid hjort') : ''}</div>
      ${st?.cleared ? `<p class="sub" style="font-size:13px">Du har klaret banen ${plural(st.plays, 'gang', 'gange')}. Skærv fra genspil falder hver gang (mindst 25 %).</p>` : ''}
    `;
  }

  private weaponCard(w: WeaponDef, save: Save, bank: Bank): string {
    const owned = save.owned[w.id];
    const lv = save.weaponLv[w.id];
    const stats = statLine(w, effective(w, lv));
    let rows = '';
    if (owned) {
      rows = TRACKS.map((t) => {
        const l = lv[t];
        const maxed = l >= MAX_UPGRADE;
        const cost = maxed ? null : upgradeCost(w, t, l);
        const ok = cost ? canAfford(bank, cost) : false;
        return `<div class="row"><div>${trackLabel(w, t)} <span class="pips">${'●'.repeat(l)}${'○'.repeat(MAX_UPGRADE - l)}</span></div>
          <div>${maxed ? '<small>maks</small>' : `<small style="display:inline;margin-right:10px">${costText(cost!)}</small><button data-wup="${w.id}:${t}" ${ok ? '' : 'disabled'}>Opgradér</button>`}</div></div>`;
      }).join('');
    }
    const buy = owned
      ? '<small>i dit eje</small>'
      : `<small style="display:inline;margin-right:10px">${costText(w.price)}</small><button data-buy="${w.id}" ${canAfford(bank, w.price) ? '' : 'disabled'}>Køb</button>`;
    return `<div class="wcard"><div class="row" style="border:0;padding:0"><div><h4>${w.name}</h4><div class="stats">${w.desc}</div></div><div>${buy}</div></div>
      <div class="stats">${stats}</div>${rows}</div>`;
  }

  /** Settings bound live to the shared `settings` object. */
  settings(onBack: () => void, onSounds?: () => void) {
    const slider = (key: 'sensitivity' | 'fov' | 'master' | 'sfx' | 'music' | 'ambience', label: string, min: number, max: number, step: number, fmt: (v: number) => string) =>
      `<label class="set"><span>${label}</span><input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><output data-out="${key}">${fmt(settings[key])}</output></label>`;
    const seg = <T extends string>(key: 'quality' | 'difficulty', label: string, opts: [T, string][]) =>
      `<label class="set" style="grid-template-columns:180px 1fr"><span>${label}</span><span class="seg">${opts
        .map(([v, t]) => `<button type="button" data-seg="${key}" data-val="${v}" class="${settings[key] === v ? 'on' : ''}">${t}</button>`)
        .join('')}</span></label>`;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    this.show(`
      <h2>Indstillinger</h2>
      <h3>Styring</h3>
      ${slider('sensitivity', 'Musefølsomhed', 0.3, 3, 0.05, (v) => v.toFixed(2))}
      <label class="set" style="grid-template-columns:180px 1fr"><span>Vend mus op/ned</span><span><input type="checkbox" data-check="invertY" ${settings.invertY ? 'checked' : ''}></span></label>
      ${slider('fov', 'Synsfelt', 55, 90, 1, (v) => `${Math.round(v)}°`)}
      <h3>Lyd</h3>
      ${slider('master', 'Samlet lyd', 0, 1, 0.05, pct)}
      ${slider('sfx', 'Effekter', 0, 1, 0.05, pct)}
      ${slider('ambience', 'Natur', 0, 1, 0.05, pct)}
      ${slider('music', 'Musik', 0, 1, 0.05, pct)}
      <label class="set" style="grid-template-columns:180px 1fr"><span>Slå lyden fra (M)</span><span><input type="checkbox" data-check="muted" ${settings.muted ? 'checked' : ''}> ${onSounds ? '<button type="button" id="sounds" class="ghost" style="margin:0 0 0 16px">Lyt til alle lyde</button>' : ''}</span></label>
      <h3>Spil</h3>
      ${seg<Difficulty>('difficulty', 'Sværhedsgrad', [['let', 'Let'], ['normal', 'Normal'], ['svaer', 'Svær']])}
      <label class="set" style="grid-template-columns:180px 1fr"><span>Blod</span><span><input type="checkbox" data-check="blood" ${settings.blood ? 'checked' : ''}> <small style="opacity:.7">(fra: støv i stedet for blod)</small></span></label>
      <h3>Grafik</h3>
      ${seg<Quality>('quality', 'Kvalitet', [['low', 'Lav'], ['medium', 'Mellem'], ['high', 'Høj'], ['ultra', 'Ultra']])}
      <label class="set" style="grid-template-columns:180px 1fr"><span>Automatisk</span><span><input type="checkbox" data-check="autoQuality" ${settings.autoQuality ? 'checked' : ''}> <small style="opacity:.7">sænk kvaliteten selv, hvis spillet hakker</small></span></label>
      <label class="set" style="grid-template-columns:180px 1fr"><span>Vis FPS</span><span><input type="checkbox" data-check="showFps" ${settings.showFps ? 'checked' : ''}></span></label>
      <p class="sub" style="font-size:13px">Lav kvalitet hjælper på ældre bærbare. Mængden af planter skifter fra næste bane.</p>
      <button id="back">Tilbage</button>
    `);
    this.el.querySelectorAll<HTMLInputElement>('[data-set]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const key = inp.dataset.set as 'sensitivity';
        settings[key] = Number(inp.value);
        const out = this.el.querySelector(`[data-out="${key}"]`);
        if (out) out.textContent = key === 'sensitivity' ? Number(inp.value).toFixed(2) : key === 'fov' ? `${inp.value}°` : `${Math.round(Number(inp.value) * 100)}%`;
      }),
    );
    this.el.querySelectorAll<HTMLInputElement>('[data-check]').forEach((inp) =>
      inp.addEventListener('change', () => {
        settings[inp.dataset.check as 'invertY' | 'blood' | 'muted' | 'autoQuality' | 'showFps'] = inp.checked;
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>('[data-seg]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const key = btn.dataset.seg as 'quality' | 'difficulty';
        (settings as unknown as Record<string, string>)[key] = btn.dataset.val!;
        this.el.querySelectorAll<HTMLButtonElement>(`[data-seg="${key}"]`).forEach((b) => b.classList.toggle('on', b === btn));
      }),
    );
    this.on('#back', onBack);
    if (onSounds) this.on('#sounds', onSounds);
  }

  pause(cb: { resume: () => void; settings: () => void; hub: () => void; menu: () => void }) {
    this.show(`<h2>Pause</h2><p class="sub">Skoven venter.</p>
      <button id="resume">Fortsæt</button><button id="settings" class="ghost">Indstillinger</button>
      <button id="hub" class="ghost">Opgiv banen (til hulen)</button><button id="menu" class="ghost">Hovedmenu</button>`);
    this.on('#resume', cb.resume);
    this.on('#settings', cb.settings);
    this.on('#hub', cb.hub);
    this.on('#menu', cb.menu);
  }

  death(cause: string, keepsSome: boolean, cb: { retry: () => void; hub: () => void }) {
    this.show(`<h2 style="color:#d86a5a">Du faldt i skoven</h2><p class="sub">${cause}</p>
      <p>Banen starter forfra. Det du har bragt hjem, og dine opgraderinger, beholder du. ${keepsSome ? 'På let beholder du halvdelen af det, du bar på.' : 'Det du bar på, er tabt.'}</p>
      <button id="retry">Prøv igen</button><button id="hub" class="ghost">Til hulen</button>`);
    this.on('#retry', cb.retry);
    this.on('#hub', cb.hub);
  }

  ending(save: Save, cb: { hub: () => void }) {
    const kills = Object.entries(save.stats.kills)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `<tr><td>${SPECIES[id as SpeciesId]?.name ?? id}</td><td>${n}</td></tr>`)
      .join('');
    const mins = Math.round(save.stats.playSeconds / 60);
    const marks = Object.values(save.levels).reduce((s, l) => s + (l.marks.home ? 1 : 0) + (l.marks.unseen ? 1 : 0) + (l.marks.whiteDeer ? 1 : 0), 0);
    this.show(`
      <div class="logo" style="font-size:64px">Hjemme</div>
      <p class="sub">Alle ${LEVEL_COUNT} strækninger er gået. Du satte dig ved ilden, og for en gangs skyld var skoven stille.</p>
      <h3>Din tur</h3>
      <table class="stats"><tr><td>Tid i skoven</td><td>${mins} min</td></tr><tr><td>Gange du faldt</td><td>${save.stats.deaths}</td></tr>
      <tr><td>Mærker</td><td>${marks} af ${LEVEL_COUNT * 2 + 10}</td></tr></table>
      <h3>Nedlagt</h3><table class="stats">${kills || '<tr><td>Ingen. En sand fredens mand.</td></tr>'}</table>
      <p class="sub" style="margin-top:14px">Færten · lavet med Three.js. Lyde: Kenney, OpenGameArt-kunstnere og US National Park Service (fri licens, se CREDITS).</p>
      <button id="hub">Tilbage til hulen</button>
    `);
    this.on('#hub', cb.hub);
  }
}

function statLine(w: WeaponDef, e: Effective): string {
  const f = (n: number, d = 0) => n.toFixed(d).replace('.', ',');
  const p: string[] = [];
  if (w.kind === 'bait') p.push(`Holder ${f(e.damage)} s`, `lokker op til ${f(e.lure)} m`);
  else p.push(`Skade ${f(e.damage)}`);
  if (w.kind === 'melee') p.push(`rækkevidde ${f(e.reach, 1)} m`);
  if (w.kind === 'trap') p.push(`holder fast ${f(e.root, 1)} s`);
  if (w.kind === 'proj') p.push(`fuld kraft efter ${f(e.draw, 2)} s`, `genladning ${f(e.cooldown, 2)} s`);
  else p.push(`${w.kind === 'melee' ? 'slagtid' : 'udlægning'} ${f(e.cooldown, 2)} s`);
  if (w.ammo > 0) p.push(`${f(e.ammo)} ${w.ammoName ?? 'stk.'}`);
  if (e.poisonDps > 0) p.push(`gift ${f(e.poisonDps * e.poisonTime)} skade over ${f(e.poisonTime)} s`);
  p.push(`støj ${f(e.noise)} m`);
  return p.join(' · ');
}
