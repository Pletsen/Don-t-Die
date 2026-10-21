#!/usr/bin/env node
// App Store screenshots from the real game: the built game runs in headless
// Chromium, is stepped frame by frame to the moment we want (so every run
// gives the same pictures), and each frame gets a caption band on top.
//
//   npm run build
//   npx vite preview --port 4173 &         (or any static server on dist/)
//   NODE_PATH=$(npm root -g) node store/screenshots.cjs
//
// Options:
//   --port 4173          where the built game is served (or --url http://...)
//   --only 1,3           just these shots (numbers or ids)
//   --lang en|da|all     caption language (default: all)
//   --sizes 6.9,6.5,6.3  device classes (default: all three)
//   --reuse              keep the captured frames in store/screenshots/raw and
//                        only redo the captions (after editing a caption)
//
// Writes store/screenshots/<lang>/<size>/NN-<id>.png (opaque RGB, the exact
// App Store sizes) and store/screenshots/<lang>/overview.png. The folder is
// git-ignored: re-run this after the game changes.
//
// The game is captured once per shot at 430 x 732 CSS px, 3x (1290 x 2196),
// the part of a 6.9" screenshot under the caption band; the smaller sizes
// are scaled down from it. During the approach to a moment, saws and bombs
// are made harmless (GameScene's `safeUntil`, the same grace it gives after a
// DUCK FRENZY) so the bot always gets there; walls still count, and the bot
// turns in the PERFECT square like a good player. The pictured frame itself
// is never one where the orb overlaps a hazard.
//
// It relies on these game hooks (keep them, or update this script):
//   window.game, window.progress, UIScene: play(level|null), playDaily(),
//   showSelect(), showDaily(), select.setHard(), shop.tiles, banner,
//   GameScene: debugState(), track, current, player, safeUntil, frenzy,
//   warp(), playerRadius(), watchPerformance(), and the 'dd-tap' event.

const fs = require('fs');
const path = require('path');
const { launch, ROOT, fontDataUrl, readCanvas } = require('./lib/browser.cjs');
const { encodeRGB } = require('./lib/png.cjs');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const URL = opt('url', `http://localhost:${opt('port', '4173')}/`);
const OUT = path.join(ROOT, 'store', 'screenshots');
const RAW = path.join(OUT, 'raw');
const REUSE = args.includes('--reuse');

/** App Store device classes: [width, height] in pixels, portrait. */
const SIZES = {
  '6.9': [1290, 2796], // iPhone with Dynamic Island, large (also accepted as 6.7")
  '6.5': [1242, 2688], // iPhone with Face ID, large
  '6.3': [1206, 2622], // iPhone with Dynamic Island, medium (the one App Store Connect requires)
};
const GAME_CSS = { w: 430, h: 732 };
const DPR = 3;

const CYAN = '#2be8ff';
const CRIMSON = '#ff2d55';
const GOLD = '#ffd21f';
const PINK = '#ff5cb8';
const ORANGE = '#ff9a2e';
const VIOLET = '#b36bff';

// --- What the shots show --------------------------------------------------------
//
// Captions: `title` lines are big and bold, `sub` is one small line. {SKINS}
// is replaced with the number of skins the game really has.

const SHOTS = [
  {
    id: 'one-tap',
    accent: CYAN,
    en: { title: ['ONE TAP.', 'ONE RULE.'], sub: "TAP TO TURN. DON'T TOUCH ANYTHING." },
    da: { title: ['ÉT TRYK.', 'ÉN REGEL.'], sub: 'TRYK FOR AT DREJE. RØR INGENTING.' },
    seed: { stars: range(1, 2, 3) },
    run: async () => {
      S.hideBanners();
      UI.play(3);
      // A PERFECT combo in world 1, a few frames after the turn so the
      // "PERFECT xN" pops are on screen.
      const r = S.play(60 * 60, (s) => s.combo >= 6 && S.framesSinceTap === 9);
      if (!r.hit) throw new Error('no x6 combo: ' + JSON.stringify(r.state));
    },
  },
  {
    id: 'dont-die',
    accent: CRIMSON,
    en: { title: ["DON'T DIE."], sub: 'SAWS, BOMBS AND ZERO MERCY' },
    da: { title: ["DON'T DIE."], sub: 'SAVKLINGER, BOMBER OG NUL NÅDE' },
    seed: { stars: range(1, 17, 3) },
    run: async () => {
      S.hideBanners();
      UI.play(18);
      S.harmless();
      // World 4: a saw or bomb just ahead, a whisker away, with company on screen.
      const r = S.play(60 * 120, (s) => {
        if (s.meters < 150) return false;
        const h = S.nearestHazard();
        return h && h.ahead && h.gap > 16 && h.gap < 44 && S.hazardsOnScreen() >= 4;
      });
      if (!r.hit) throw new Error('no close call found');
      SC.safeUntil = 0;
    },
  },
  {
    id: 'super-powers',
    accent: GOLD,
    en: { title: ['{SKINS} SKINS WITH', 'SUPER POWERS'], sub: 'TAP 4 TIMES FAST TO UNLEASH THEM' },
    da: { title: ['{SKINS} SKINS MED', 'SUPERKRÆFTER'], sub: 'TRYK 4 GANGE HURTIGT FOR AT SLIPPE DEM LØS' },
    seed: { stars: range(1, 10, 3), skin: 'duckking' },
    run: async () => {
      S.hideBanners();
      UI.play(11);
      S.harmless();
      // On a long straight, the 4-tap spin fires the skin's power: the
      // super-move band sweeps in.
      const r = S.play(60 * 60, (s) => s.meters > 80 && S.straightAhead() > 200 && S.framesSinceTap > 3);
      if (!r.hit) throw new Error('no straight for the spin');
      for (let i = 0; i < 4; i++) {
        S.tap();
        S.step(5);
      }
      S.step(14);
      if (!SC.ability) throw new Error('the power did not fire');
    },
  },
  {
    id: 'worlds',
    accent: VIOLET,
    en: { title: ['4 WORLDS', '+ HARD MODE'], sub: '40 LEVELS. 3 STARS EACH.' },
    da: { title: ['4 VERDENER', '+ HARD MODE'], sub: '40 LEVELS. 3 STJERNER I HVER.' },
    seed: {
      stars: { ...range(1, 20, 3), 4: 2, 9: 2, 14: 2, 17: 2, 19: 2, ...range(101, 104, 3), 105: 2 },
      warps: [3, 7, 12],
    },
    run: async () => {
      S.hideBanners();
      UI.showSelect();
      UI.select.setHard(false);
      S.step(50);
    },
  },
  {
    id: 'daily',
    accent: PINK,
    en: { title: ['A NEW DAILY RUN', 'EVERY DAY'], sub: 'SAME TRACK FOR EVERYONE. KEEP YOUR STREAK.' },
    da: { title: ['EN NY DAILY RUN', 'HVER DAG'], sub: 'SAMME BANE FOR ALLE. HOLD DIN STREAK.' },
    seed: { stars: range(1, 8, 3) },
    run: async () => {
      S.hideBanners();
      // Five days into a streak, today's run played a few times, one mission done.
      const p = window.progress;
      const today = Math.floor(Date.now() / 86_400_000);
      const key = new Date(today * 86_400_000).toISOString().slice(0, 10);
      p.data.daily.streak = { count: 4, lastDay: today - 1, shield: 1, best: 6, claims: 11 };
      p.data.daily.days[key] = { best: 684.3, attempts: 3, paid: [250, 600], modifier: p.daily.run().modifier.id };
      p.data.daily.bestEver = { m: 912.6, key };
      p.checkDay();
      const slot = p.data.missions.slots[0];
      slot.progress = 9999;
      slot.done = true;
      UI.showDaily();
      S.step(60);
    },
  },
  {
    id: 'golden-duck',
    accent: GOLD,
    en: { title: ['CATCH THE', 'GOLDEN DUCK'], sub: 'DUCK FRENZY: EVERY TAP IS A DUCK' },
    da: { title: ['FANG DEN', 'GYLDNE AND'], sub: 'DUCK FRENZY: HVERT TRYK ER EN AND' },
    seed: { stars: range(1, 11, 3), skin: 'kitty' },
    run: async () => {
      S.hideBanners();
      UI.play(12);
      S.harmless();
      S.play(60 * 6);
      // Gild the next duck down the track and put it on the orb's line.
      let duck = null;
      for (let k = SC.current + 1; k < SC.track.segments.length && !duck; k++) {
        const sg = SC.track.get(k);
        const d = sg && sg.hazards.find((h) => h.kind === 'duck' && h.alive);
        if (!d) continue;
        duck = d;
        d.variant = 'golden';
        d.radius = 24;
        d.moving = false;
        if (sg.dir % 2 === 0) d.y = d.baseY = sg.start.y;
        else d.x = d.baseX = sg.start.x;
        SC.hazardViews.get(d)?.destroy();
        SC.hazardViews.delete(d);
      }
      if (!duck) throw new Error('no duck on the track');
      const r = S.play(60 * 60, () => !!SC.frenzy);
      if (!r.hit) throw new Error('missed the golden duck');
      // Ten taps a second, like a happy thumb.
      for (let i = 0; i < 60 * 8 && SC.frenzy && SC.frenzy.count < 34; i++) {
        if (i % 6 === 0) S.tap();
        S.step(1);
      }
      if (!SC.frenzy) throw new Error('the frenzy ended early');
    },
  },
  {
    id: 'survival',
    accent: ORANGE,
    en: { title: ['HOW FAR', 'CAN YOU GO?'], sub: 'ENDLESS SURVIVAL. IT ONLY GETS FASTER.' },
    da: { title: ['HVOR LANGT', 'KAN DU NÅ?'], sub: 'UENDELIG SURVIVAL. DET GÅR KUN HURTIGERE.' },
    seed: { stars: range(1, 12, 3), skin: 'lava', best: 512 },
    run: async () => {
      // Beat a 512 m record mid-run: NEW RECORD! drops in.
      const p = window.progress;
      p.data.survival.best = 512;
      p.data.survival.top = [{ m: 512, s: 74, key: '2026-10-01' }];
      S.hideBanners({ live: true });
      UI.play(null);
      S.harmless();
      const r = S.play(60 * 120, (s) => s.meters > 518);
      if (!r.hit) throw new Error('did not reach the record: ' + JSON.stringify(r.state));
      S.play(26);
      // Picture it on a calm frame: nothing touching the orb.
      S.play(60 * 3, () => {
        const h = S.nearestHazard();
        return !h || h.gap > 30;
      });
      SC.safeUntil = 0;
    },
  },
  {
    id: 'universe-2',
    accent: '#ff2f9e',
    en: { title: ['WARP TO', 'UNIVERSE 2'], sub: 'FIND THE HIDDEN RAINBOW STAR' },
    da: { title: ['WARP TIL', 'UNIVERSE 2'], sub: 'FIND DEN SKJULTE REGNBUESTJERNE' },
    seed: { stars: range(1, 6, 3), skin: 'disco' },
    run: async () => {
      S.hideBanners();
      UI.play(7);
      S.harmless();
      S.play(60 * 4);
      // As if the orb just hit the rainbow star.
      SC.warp({ x: SC.player.x, y: SC.player.y, taken: false });
      S.play(100);
      S.play(60 * 2, () => {
        const h = S.nearestHazard();
        return !h || h.gap > 30;
      });
      SC.safeUntil = 0;
    },
  },
];

function range(from, to, stars) {
  const o = {};
  for (let i = from; i <= to; i++) o[i] = stars;
  return o;
}

// --- Capturing the game -----------------------------------------------------------

/** Installed in the page: deterministic stepping and a simple PERFECT-square bot. */
function pageHelpers() {
  const g = window.game;
  const UI = g.scene.getScene('UI');
  const SC = g.scene.getScene('Game');
  g.loop.sleep();
  let t = performance.now();
  // Tweens run on our clock too, and the quality ladder stays at the top.
  for (const k of ['Game', 'UI']) g.scene.getScene(k).tweens.getDelta = () => 16.667;
  SC.watchPerformance = () => {};
  SC.maybeRaiseQuality = () => {};
  const render = g.scene.render.bind(g.scene);
  let lastGate = null;
  const S = {
    framesSinceTap: 1e9,
    /** Advance n frames without drawing them (fast). */
    step(n = 1) {
      g.scene.render = () => {};
      for (let i = 0; i < n; i++) {
        t += 16.667;
        g.step(t, 16.667);
        S.framesSinceTap++;
      }
      g.scene.render = render;
    },
    /** Advance and draw a frame (for the picture). */
    draw(n = 1) {
      for (let i = 0; i < n; i++) {
        t += 16.667;
        g.step(t, 16.667);
      }
    },
    tap() {
      g.events.emit('dd-tap');
      S.framesSinceTap = 0;
    },
    /**
     * Play up to n frames, turning in the middle of each PERFECT square.
     * Stops early when until(state) is true.
     */
    play(n, until) {
      let px = SC.player.x;
      let py = SC.player.y;
      for (let i = 0; i < n; i++) {
        S.step(1);
        const s = SC.debugState();
        if (s.state !== 'play') return { hit: false, state: s };
        const vx = s.x - px;
        const vy = s.y - py;
        px = s.x;
        py = s.y;
        const p = s.perfect;
        if (p && !SC.frenzy && !(SC.ability && SC.ability.def.autopilot)) {
          const inside = s.x >= p.x1 && s.x <= p.x2 && s.y >= p.y1 && s.y <= p.y2;
          const cx = (p.x1 + p.x2) / 2;
          const cy = (p.y1 + p.y2) / 2;
          const past = (s.x - cx) * vx + (s.y - cy) * vy >= -0.5 * (vx * vx + vy * vy);
          if (inside && past && lastGate !== p) {
            lastGate = p;
            S.tap();
          }
        }
        if (until && until(SC.debugState())) return { hit: true, state: SC.debugState() };
      }
      return { hit: false, state: SC.debugState() };
    },
    /** Saws and bombs can't hurt the orb (until SC.safeUntil is reset). */
    harmless() {
      SC.safeUntil = Infinity;
    },
    /** The closest live saw or bomb: gap between the edges, and whether it's ahead. */
    nearestHazard() {
      const r = SC.playerRadius();
      const dirs = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ];
      const [ux, uy] = dirs[SC.player.dir];
      let best = null;
      for (const seg of [SC.track.get(SC.current), SC.track.get(SC.current + 1)]) {
        for (const h of seg?.hazards ?? []) {
          if (!h.alive || h.kind === 'duck') continue;
          const dx = h.x - SC.player.x;
          const dy = h.y - SC.player.y;
          const gap = Math.hypot(dx, dy) - h.radius - r;
          if (!best || gap < best.gap) best = { gap, ahead: dx * ux + dy * uy > 0, kind: h.kind };
        }
      }
      return best;
    },
    hazardsOnScreen() {
      return SC.visibleSegments().reduce((n, seg) => n + seg.hazards.filter((h) => h.alive && h.kind !== 'duck').length, 0);
    },
    /** Pixels of straight corridor left ahead of the orb. */
    straightAhead() {
      const seg = SC.track.get(SC.current);
      if (!seg || SC.player.dir !== seg.dir) return 0;
      const along = [SC.player.x - seg.start.x, SC.player.y - seg.start.y, seg.start.x - SC.player.x, seg.start.y - SC.player.y][seg.dir];
      return seg.length - along;
    },
    /** Hide banners (missions, achievements) or, with live, keep only in-run ones (NEW RECORD!). */
    hideBanners({ live = false } = {}) {
      const b = UI.banner;
      const push = b.push.bind(b);
      b.push = (n) => (live && n.live ? push(n) : undefined);
      b.queue = [];
      b.held = [];
      b.hideTimer?.remove();
      b.showing = false;
      b.current = null;
      b.root.setVisible(false);
      const show = b.next?.bind(b);
      if (show) b.next = () => (b.root.setVisible(true), show());
    },
  };
  Object.assign(window, { S, UI, SC });
}

async function captureShot(browser, shot, index) {
  const ctx = await browser.newContext({
    viewport: { width: GAME_CSS.w, height: GAME_CSS.h },
    deviceScaleFactor: DPR,
    locale: 'en-US',
  });
  const seed = shot.seed ?? {};
  const owned = 'mint,bubblegum,lemon,frosty,moon,kitty,froggy,panda,donut,bee,disco,ghost,lava,galaxy,pizza,crown,duckking,phoenix';
  const storage = {
    dontdie_intro_seen: '1',
    dontdie_tips_seen: JSON.stringify(Array.from({ length: 20 }, (_, i) => i + 1)),
    dontdie_quality_v2: '0',
    dontdie_level_stars: JSON.stringify(seed.stars ?? {}),
    dontdie_ducks: '486',
    dontdie_skins: owned,
    dontdie_skin: seed.skin ?? 'classic',
    dontdie_best_m: String(seed.best ?? 0),
    dontdie_warps: (seed.warps ?? []).join(','),
    dontdie_fx_reduced: '0',
  };
  await ctx.addInitScript(
    ({ storage, rngSeed }) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
      // Seeded Math.random: the same particles every time.
      let a = rngSeed >>> 0;
      Math.random = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let x = Math.imul(a ^ (a >>> 15), 1 | a);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
    },
    { storage, rngSeed: 1000 + index * 77 },
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.game?.scene.getScene('UI')?.sys.isActive(), null, { timeout: 120000 });
  await page.evaluate(pageHelpers);
  await page.evaluate(() => S.step(90));
  const skins = await page.evaluate(() => UI.shop?.tiles?.length ?? null);
  await page.evaluate(shot.run);
  await page.evaluate(() => S.draw(1));
  const file = path.join(RAW, `${String(index + 1).padStart(2, '0')}-${shot.id}.png`);
  await page.screenshot({ path: file, timeout: 180000 });
  await ctx.close();
  if (errors.length) console.warn(`  page errors: ${errors.join(' / ')}`);
  return { file, skins };
}

// --- Captions ---------------------------------------------------------------------

/** Runs in the composer page: one store screenshot on a canvas. */
function compose({ W, H, src, accent, title, sub }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.getElementById('c') ?? document.body.appendChild(Object.assign(document.createElement('canvas'), { id: 'c' }));
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      const gh = Math.round((W * img.height) / img.width);
      const band = H - gh;
      const hex = (a) => accent + Math.round(a * 255).toString(16).padStart(2, '0');

      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, W, H);
      // The band: a glow in the shot's colour and a faint floor grid.
      const glow = ctx.createRadialGradient(W / 2, band * 0.5, 0, W / 2, band * 0.5, W * 0.75);
      glow.addColorStop(0, hex(0.26));
      glow.addColorStop(0.55, hex(0.07));
      glow.addColorStop(1, hex(0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, band);
      ctx.save();
      const fade = ctx.createLinearGradient(0, 0, 0, band);
      fade.addColorStop(0, hex(0));
      fade.addColorStop(1, hex(0.1));
      ctx.strokeStyle = fade;
      ctx.lineWidth = 2;
      const cell = W / 12;
      for (let x = cell / 2; x < W; x += cell) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, band);
        ctx.stroke();
      }
      for (let y = band - cell / 2; y > 0; y -= cell) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.restore();

      // The game, full width, under a neon edge.
      ctx.drawImage(img, 0, band, W, gh);
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = W * 0.02;
      ctx.fillStyle = accent;
      ctx.fillRect(0, band - 2, W, 4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.fillRect(0, band - 1, W, 2);
      ctx.restore();

      // The caption: big lines, fitted to the width, with the logo's
      // magenta and cyan ghosts behind the white.
      const maxW = W * 0.88;
      let size = W * 0.096;
      ctx.font = `700 ${size}px "Chakra Petch"`;
      const widest = () => Math.max(...title.map((l) => ctx.measureText(l).width));
      while (widest() > maxW && size > 20) {
        size -= 2;
        ctx.font = `700 ${size}px "Chakra Petch"`;
      }
      let subSize = W * 0.03;
      const subFont = () => `500 ${subSize}px "JetBrains Mono"`;
      ctx.font = subFont();
      ctx.letterSpacing = `${subSize * 0.14}px`;
      while (ctx.measureText(sub).width > maxW && subSize > 12) {
        subSize -= 1;
        ctx.font = subFont();
        ctx.letterSpacing = `${subSize * 0.14}px`;
      }
      const lineH = size * 1.04;
      const gap = size * 0.42;
      const blockH = lineH * title.length + gap + subSize;
      let y = (band - blockH) / 2 + lineH / 2 + band * 0.02;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${size}px "Chakra Petch"`;
      ctx.letterSpacing = `${size * 0.02}px`;
      for (const line of title) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ff2f9e';
        ctx.fillText(line, W / 2 - size * 0.03, y + size * 0.01);
        ctx.fillStyle = CYAN_CSS;
        ctx.fillText(line, W / 2 + size * 0.03, y - size * 0.01);
        ctx.restore();
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = size * 0.35;
        ctx.fillStyle = '#f4fbff';
        ctx.fillText(line, W / 2, y);
        ctx.shadowBlur = size * 0.1;
        ctx.fillText(line, W / 2, y);
        ctx.restore();
        y += lineH;
      }
      y += gap - lineH / 2 + subSize / 2;
      ctx.font = subFont();
      ctx.letterSpacing = `${subSize * 0.14}px`;
      ctx.fillStyle = '#a9bccd';
      ctx.fillText(sub, W / 2 + subSize * 0.07, y);
      resolve();
    };
    img.onerror = reject;
    img.src = src;
  });
}

/** Runs in the composer page: small copies of a set side by side. */
function overview({ srcs, W, H }) {
  return Promise.all(
    srcs.map(
      (src) =>
        new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = src;
        }),
    ),
  ).then((imgs) => {
    const c = document.getElementById('c');
    const w = Math.round(W / 4);
    const h = Math.round(H / 4);
    c.width = imgs.length * (w + 24) + 24;
    c.height = h + 48;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1b2129';
    ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => ctx.drawImage(im, 24 + i * (w + 24), 24, w, h));
    return { w: c.width, h: c.height };
  });
}

// --- Main -----------------------------------------------------------------------

async function main() {
  const only = opt('only', '')
    .split(',')
    .filter(Boolean);
  const langs = (opt('lang', 'all') === 'all' ? 'en,da' : opt('lang')).split(',');
  const sizes = opt('sizes', Object.keys(SIZES).join(',')).split(',');
  const shots = SHOTS.map((s, i) => ({ ...s, n: i + 1 })).filter(
    (s) => only.length === 0 || only.includes(String(s.n)) || only.includes(s.id),
  );
  fs.mkdirSync(RAW, { recursive: true });
  const browser = await launch();

  // 1. The game frames.
  let skins = null;
  const metaFile = path.join(RAW, 'meta.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  for (const shot of shots) {
    const file = path.join(RAW, `${String(shot.n).padStart(2, '0')}-${shot.id}.png`);
    if (REUSE && fs.existsSync(file)) continue;
    const t0 = Date.now();
    try {
      const r = await captureShot(browser, shot, shot.n - 1);
      skins = r.skins ?? skins;
      console.log(`captured ${path.relative(ROOT, r.file)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    } catch (e) {
      console.error(`FAILED ${shot.id}: ${e.message.split('\n')[0]}`);
    }
  }
  if (skins) meta.skins = skins;
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
  skins = meta.skins ?? '?';

  // 2. Captions on top, in each language and size.
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: "Chakra Petch"; font-weight: 700; src: url(${fontDataUrl('chakra-petch/files/chakra-petch-latin-700-normal.woff2')}); }
    @font-face { font-family: "JetBrains Mono"; font-weight: 500; src: url(${fontDataUrl('jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')}); }
    body { margin: 0; background: #05070a; }
  </style></head><body><canvas id="c"></canvas><script>const CYAN_CSS = '${CYAN}';</script></body></html>`);
  await page.evaluate(() => Promise.all([document.fonts.load('700 40px "Chakra Petch"'), document.fonts.load('500 20px "JetBrains Mono"')]));
  for (const lang of langs) {
    for (const size of sizes) {
      const [W, H] = SIZES[size];
      const dir = path.join(OUT, lang, size);
      fs.mkdirSync(dir, { recursive: true });
      const made = [];
      for (const shot of SHOTS.map((s, i) => ({ ...s, n: i + 1 }))) {
        const name = `${String(shot.n).padStart(2, '0')}-${shot.id}.png`;
        const raw = path.join(RAW, name);
        if (!fs.existsSync(raw)) continue;
        const text = shot[lang] ?? shot.en;
        const fill = (s) => s.replace('{SKINS}', String(skins));
        await page.evaluate(compose, {
          W,
          H,
          src: `data:image/png;base64,${fs.readFileSync(raw).toString('base64')}`,
          accent: shot.accent,
          title: text.title.map(fill),
          sub: fill(text.sub),
        });
        const png = encodeRGB(await readCanvas(page, '#c', W, H), W, H);
        fs.writeFileSync(path.join(dir, name), png);
        made.push(path.join(dir, name));
      }
      console.log(`${lang} ${size}" ${W}x${H}: ${made.length} screenshots in ${path.relative(ROOT, dir)}`);
      if (size === sizes[0] && made.length) {
        const { w, h } = await page.evaluate(overview, {
          srcs: made.map((f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`),
          W,
          H,
        });
        fs.writeFileSync(path.join(OUT, lang, 'overview.png'), encodeRGB(await readCanvas(page, '#c', w, h), w, h));
      }
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
