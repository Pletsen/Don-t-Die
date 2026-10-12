import { UPGRADES, WEAPON_FAMILIES, type Cost, type UpgradeId } from '../data/upgrades';
import { LEVEL_COUNT } from '../data/levels';
import type { Bank, Save } from '../game/save';

const CSS = `
.scr{position:fixed;inset:0;display:none;align-items:center;justify-content:center;font-family:Georgia,serif;color:#efe8d2;
  background:radial-gradient(ellipse at center,rgba(8,12,9,.55),rgba(4,6,5,.88));pointer-events:auto;overflow:auto}
.scr.on{display:flex}
.scr .card{max-width:760px;width:calc(100% - 40px);padding:28px 36px;background:rgba(14,18,14,.82);border:1px solid rgba(220,200,150,.28);box-shadow:0 10px 50px #000;border-radius:4px;margin:20px}
.scr h1{margin:0 0 4px;font-size:46px;letter-spacing:.14em;text-transform:uppercase;font-weight:normal;color:#f1dfae}
.scr h2{margin:0 0 10px;font-size:28px;font-weight:normal;color:#f1dfae;letter-spacing:.06em}
.scr h3{margin:18px 0 6px;font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:#a8b58a;font-weight:normal}
.scr p{line-height:1.55;margin:6px 0}
.scr .sub{opacity:.75;font-style:italic;margin-bottom:14px}
.scr button{font:inherit;color:#1a140a;background:#e0c47a;border:0;padding:11px 26px;font-size:18px;letter-spacing:.08em;cursor:pointer;margin:12px 10px 0 0;border-radius:2px}
.scr button:hover{background:#f3d98f}
.scr button.ghost{background:transparent;color:#cdbf98;border:1px solid rgba(220,200,150,.4);font-size:14px;padding:8px 16px}
.scr button:disabled{opacity:.35;cursor:default}
.scr .keys{display:grid;grid-template-columns:auto 1fr;gap:4px 18px;font-size:15px}
.scr .keys b{color:#f1dfae;font-weight:normal;text-align:right}
.scr .row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.scr .row small{opacity:.7;display:block}
.scr .pips{letter-spacing:3px;color:#e0c47a}
.scr .bank{display:flex;gap:28px;font-size:20px;margin:6px 0 10px}
.scr .bank b{font-size:30px;color:#f1dfae}
.scr .row button{margin:0;padding:6px 14px;font-size:15px}
.scr .locked{opacity:.4}
.scr .tip{border-left:3px solid #7fa3c4;padding-left:12px;margin-top:14px;opacity:.9}
`;

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
}

export class Screens {
  private el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'scr';
    parent.appendChild(this.el);
  }

  hide() {
    this.el.classList.remove('on');
    this.el.innerHTML = '';
  }

  private show(html: string) {
    this.el.innerHTML = `<div class="card">${html}</div>`;
    this.el.classList.add('on');
  }

  private on(sel: string, fn: () => void) {
    this.el.querySelector(sel)?.addEventListener('click', fn);
  }

  menu(save: Save, cb: { play: () => void; reset: () => void }) {
    const fresh = save.level === 1 && save.bank.meat + save.bank.shards + save.bank.trophies === 0;
    this.show(`
      <h1>Hjem fra skoven</h1>
      <div class="sub">Det er ved at blive mørkt. Du har ${LEVEL_COUNT} strækninger skov mellem dig og hulen.</div>
      <p>Dyrene får færten af dig og bliver vildere for hver strækning. Kom hjem med kødet, før natten tager dig.</p>
      <h3>Styring</h3>
      <div class="keys">
        <b>WASD</b><span>gå</span>
        <b>Mus</b><span>drej figur og kamera</span>
        <b>Venstre museknap</b><span>skyd med buen</span>
        <b>Højre museknap</b><span>sigt (langsommere, men præcist)</span>
        <b>Shift</b><span>sprint (koster udholdenhed, og støjer)</span>
        <b>Mellemrum</b><span>undvigerulle (du er uskadt et øjeblik)</span>
        <b>E</b><span>saml kød, skærv og pile op – eller spis kød for at hele</span>
      </div>
      <div class="tip"><b>Vinden afgør alt.</b> Kompasset oppe til højre viser, hvor vinden blæser hen. Blæser den fra dig mod et dyr, lugter det dig langt væk. Gå på tværs af vinden eller ind imod den, og snig dig. Sprint og skud kan høres langt væk.</div>
      <button id="play">${fresh ? 'Begynd turen' : `Fortsæt – bane ${Math.min(save.level, LEVEL_COUNT)}`}</button>
      ${fresh ? '' : '<button id="reset" class="ghost">Start forfra</button>'}
    `);
    this.on('#play', cb.play);
    this.on('#reset', () => {
      if (confirm('Slet dit fremskridt og start forfra?')) cb.reset();
    });
  }

  hub(save: Save, last: RunSummary | null, cb: { go: () => void; buy: (id: UpgradeId) => void }) {
    const b = save.bank;
    const ups = UPGRADES.map((u) => {
      const lvl = save.upgrades[u.id];
      const maxed = lvl >= u.costs.length;
      const cost = maxed ? null : u.costs[lvl];
      const ok = cost ? canAfford(b, cost) : false;
      return `<div class="row"><div>${u.name} <span class="pips">${'●'.repeat(lvl)}${'○'.repeat(u.costs.length - lvl)}</span><small>${u.desc}</small></div>
        <div>${maxed ? '<small>fuldt opgraderet</small>' : `<small style="display:inline;margin-right:10px">${costText(cost!)}</small><button data-up="${u.id}" ${ok ? '' : 'disabled'}>Køb</button>`}</div></div>`;
    }).join('');
    const weapons = WEAPON_FAMILIES.map((w) => `<div class="row ${w.ready ? '' : 'locked'}"><div>[${w.key}] ${w.name}</div><small>${w.ready ? 'i brug' : 'kommer senere'}</small></div>`).join('');
    this.show(`
      <h2>Hulen</h2>
      <div class="sub">${last ? `Du nåede hjem fra bane ${last.level}. Ilden brænder.` : 'Ilden brænder. Her er du i sikkerhed.'}</div>
      ${last ? `<p>Hjembragt: <b>${last.meat}</b> kød, <b>${last.shards}</b> skærv, <b>${last.trophies}</b> trofæer.</p>` : ''}
      <div class="bank"><span>Kød <b>${b.meat}</b></span><span>Skærv <b>${b.shards}</b></span><span>Trofæer <b>${b.trophies}</b></span></div>
      <h3>Opgraderinger</h3>${ups}
      <h3>Våben</h3>${weapons}
      <button id="go">Gå ud i skoven – bane ${save.level} af ${LEVEL_COUNT}</button>
    `);
    this.on('#go', cb.go);
    this.el.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((btn) => btn.addEventListener('click', () => cb.buy(btn.dataset.up as UpgradeId)));
  }

  pause(cb: { resume: () => void; menu: () => void }) {
    this.show(`<h2>Pause</h2><p class="sub">Spillet står stille.</p><button id="resume">Fortsæt</button><button id="menu" class="ghost">Hovedmenu</button>`);
    this.on('#resume', cb.resume);
    this.on('#menu', cb.menu);
  }

  death(cause: string, cb: { retry: () => void; menu: () => void }) {
    this.show(`<h2 style="color:#d86a5a">Du faldt i skoven</h2><p class="sub">${cause}</p><p>Banen starter forfra. Det du har bragt hjem før, og dine opgraderinger, beholder du. Det du bar på, er tabt.</p><button id="retry">Prøv igen</button><button id="menu" class="ghost">Hovedmenu</button>`);
    this.on('#retry', cb.retry);
    this.on('#menu', cb.menu);
  }

  ending(cb: { menu: () => void }) {
    this.show(`<h1>Hjemme</h1><div class="sub">Alle ${LEVEL_COUNT} strækninger er gået.</div><p>Du satte dig ved ilden. Skoven var stille for en gangs skyld.</p><button id="menu">Tilbage til hulen</button>`);
    this.on('#menu', cb.menu);
  }
}
