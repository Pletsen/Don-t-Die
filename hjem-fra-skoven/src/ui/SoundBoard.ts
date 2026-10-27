import type { Audio } from '../audio/Audio';

const NAMES: Record<string, string> = { sfx: 'Effekter', ui: 'Menu', ambience: 'Natur', music: 'Musik' };

/**
 * A listening page for every sound in the game (settings → "Lyt til alle lyde", or `?lyd` in the address).
 * Each variant can be played on its own, and "Afspil alle" plays everything in a row with the name shown,
 * so it is quick to point at the ones that should be replaced.
 */
export class SoundBoard {
  private el: HTMLDivElement;
  private stop = false;

  constructor(private audio: Audio) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;inset:0;z-index:50;overflow:auto;background:rgba(6,8,6,.94);color:#efe8d2;font-family:Georgia,serif;padding:24px 32px;pointer-events:auto;display:none';
    document.body.appendChild(this.el);
  }

  async open(onClose: () => void) {
    this.audio.init();
    this.el.style.display = 'block';
    this.el.innerHTML = '<h2 style="font-weight:normal">Lydene indlæses…</h2>';
    await this.audio.whenReady();
    const gain = new Map(this.audio.stats.map((s) => [s.file, s]));
    const groups = new Map<string, { id: string; files: string[] }[]>();
    for (const e of this.audio.events()) {
      if (!groups.has(e.category)) groups.set(e.category, []);
      groups.get(e.category)!.push(e);
    }
    let html = `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <h2 style="font-weight:normal;margin:0 16px 0 0">Alle lyde</h2>
      <button data-all style="font:inherit;padding:8px 18px;background:#e0c47a;border:0;cursor:pointer">▶ Afspil alle</button>
      <button data-stop style="font:inherit;padding:8px 18px;background:transparent;color:#cdbf98;border:1px solid #776;cursor:pointer">■ Stop</button>
      <button data-close style="font:inherit;padding:8px 18px;background:transparent;color:#cdbf98;border:1px solid #776;cursor:pointer">Luk</button>
      <span data-now style="margin-left:12px;color:#ffd98a"></span></div>
      <p style="opacity:.75;font-size:14px">Tal efter hver variant: justering i dB, så alle lyde er lige høje (-20 dBFS RMS, top under -1 dBFS). Skift en lyd i <code>public/sfx/manifest.json</code>.</p>`;
    for (const [cat, list] of groups) {
      html += `<h3 style="letter-spacing:.2em;text-transform:uppercase;font-weight:normal;color:#a8b58a;font-size:13px;margin:18px 0 6px">${NAMES[cat] ?? cat}</h3>`;
      for (const e of list) {
        const btns = e.files
          .map((f, i) => {
            const s = gain.get(f);
            return `<button data-play="${e.id}" data-v="${i}" title="${f}" style="font:inherit;font-size:13px;margin:2px 4px;padding:3px 9px;background:rgba(255,255,255,.08);color:#efe8d2;border:1px solid #554;cursor:pointer">▶ ${i + 1}${s ? ` <small style="opacity:.6">${s.gainDb >= 0 ? '+' : ''}${s.gainDb.toFixed(0)}</small>` : ''}</button>`;
          })
          .join('');
        html += `<div style="display:flex;align-items:center;border-bottom:1px solid rgba(255,255,255,.06);padding:3px 0"><code style="width:190px;font-size:13px">${e.id}</code>${btns}</div>`;
      }
    }
    this.el.innerHTML = html;
    const now = this.el.querySelector<HTMLElement>('[data-now]')!;
    this.el.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) =>
      b.addEventListener('click', () => {
        this.audio.stopAllLoops();
        this.audio.preview(b.dataset.play!, Number(b.dataset.v));
        now.textContent = `${b.dataset.play} #${Number(b.dataset.v) + 1}`;
      }),
    );
    this.el.querySelector('[data-stop]')!.addEventListener('click', () => {
      this.stop = true;
      this.audio.stopAllLoops();
      now.textContent = '';
    });
    this.el.querySelector('[data-close]')!.addEventListener('click', () => {
      this.stop = true;
      this.audio.stopAllLoops();
      this.el.style.display = 'none';
      onClose();
    });
    this.el.querySelector('[data-all]')!.addEventListener('click', async () => {
      this.stop = false;
      for (const [, list] of groups)
        for (const e of list)
          for (let i = 0; i < e.files.length; i++) {
            if (this.stop) return;
            now.textContent = `${e.id} #${i + 1}`;
            const len = this.audio.preview(e.id, i);
            await new Promise((r) => setTimeout(r, Math.min(6, len) * 1000 + 400));
            this.audio.stopAllLoops();
          }
      now.textContent = 'Færdig';
    });
  }
}
