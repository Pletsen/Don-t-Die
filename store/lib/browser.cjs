// Headless Chromium for the store scripts (Playwright).
//
// Playwright is not a dependency of the game. Either run the scripts with a
// global install (NODE_PATH=$(npm root -g) node store/...) or install it next
// to the game without saving it: npm i --no-save playwright && npx playwright install chromium
//
// CHROME=/path/to/chrome picks a browser binary. Without it, the sandbox's
// pre-installed Chromium is used if it is there, else Playwright's own.

const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error(
    'Playwright not found. Run with NODE_PATH=$(npm root -g), or: npm i --no-save playwright && npx playwright install chromium',
  );
  process.exit(1);
}

const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function launch() {
  const executablePath = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined);
  return chromium.launch({
    executablePath,
    // Software WebGL: works on machines (and CI runners) without a GPU.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

/** The repo root (store/lib/.. /..). */
const ROOT = path.resolve(__dirname, '..', '..');

/** A bundled web font as a data: URL, so pages drawn from about:blank use the game's fonts. */
function fontDataUrl(file) {
  const p = path.join(ROOT, 'node_modules', '@fontsource', file);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}: run npm install first`);
  return `data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}`;
}

/**
 * Read a canvas's pixels back into Node in strips (one big transfer of a
 * 2732 px square would be ~40 MB of base64 at once).
 */
async function readCanvas(page, selector, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const strip = 256;
  for (let y = 0; y < h; y += strip) {
    const rows = Math.min(strip, h - y);
    const b64 = await page.evaluate(
      ({ selector, y, rows, w }) => {
        const c = document.querySelector(selector);
        const data = c.getContext('2d').getImageData(0, y, w, rows).data;
        let s = '';
        for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
        return btoa(s);
      },
      { selector, y, rows, w },
    );
    Buffer.from(b64, 'base64').copy(out, y * w * 4);
  }
  return out;
}

module.exports = { launch, ROOT, fontDataUrl, readCanvas };
