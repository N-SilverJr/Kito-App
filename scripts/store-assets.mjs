/**
 * Generate the launch assets: PWA icons (including the ones the manifest references), the
 * App Store and Play Store icon sizes, the Play feature graphic, and store-sized screenshots.
 *
 *   npm run dev                     # required for the screenshots
 *   node scripts/store-assets.mjs   # writes apps/web/public/*.png and store/*.png
 *
 * Icons are rasterised from the single source of truth, apps/web/public/icon.svg.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { seedDemoAccount } from './demo-account.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PUBLIC = `${ROOT}apps/web/public`;
const STORE = `${ROOT}store`;

const BRAND = '#0f7b63';
const CREAM = '#fbf7ef';

await mkdir(STORE, { recursive: true });

const svg = await readFile(`${PUBLIC}/icon.svg`, 'utf8');
const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
// iOS and the stores apply their own corner mask, so their icon is full-bleed: the same artwork
// with the rounded rect squared off, which avoids a tile-inside-a-tile look on the home screen.
const fullBleedSvg = svg.replace('rx="120"', 'rx="0"');
const fullBleedDataUrl = `data:image/svg+xml;base64,${Buffer.from(fullBleedSvg).toString('base64')}`;

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

/** Rasterise the logo onto a square canvas, optionally with a background and padding. */
async function renderIcon({ size, background, padding = 0, rounded = true }) {
  const dataUrl = await page.evaluate(
    async ({ src, size, background, padding, rounded }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      if (!rounded) {
        context.fillStyle = background ?? '#ffffff';
        context.fillRect(0, 0, size, size);
      }
      const inner = size * (1 - padding * 2);
      context.drawImage(image, (size - inner) / 2, (size - inner) / 2, inner, inner);
      return canvas.toDataURL('image/png');
    },
    { src: svgDataUrl, size, background, padding, rounded },
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Opaque, alpha-free PNG via a real screenshot: Apple rejects an alpha channel outright. */
async function renderOpaqueSquare({ size, background }) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${background}; }
    img { display: block; width: ${size}px; height: ${size}px; }
  </style></head><body><img src="${fullBleedDataUrl}" alt=""></body></html>`);
  const buffer = await page.screenshot({
    clip: { x: 0, y: 0, width: size, height: size },
    omitBackground: false,
  });
  return buffer;
}

const icons = [
  // Referenced by manifest.webmanifest — these were missing before this script existed.
  { file: `${PUBLIC}/icon-192.png`, size: 192, padding: 0, rounded: true },
  { file: `${PUBLIC}/icon-512.png`, size: 512, padding: 0, rounded: true },
  // Maskable icons need the art inside the central 80% safe zone, with a full-bleed background.
  { file: `${PUBLIC}/icon-512-maskable.png`, size: 512, padding: 0.1, rounded: false, background: BRAND },
  { file: `${STORE}/icon-play-512.png`, size: 512, padding: 0, rounded: true },
];

for (const icon of icons) {
  const buffer = await renderIcon(icon);
  await writeFile(icon.file, buffer);
  console.log(`wrote ${icon.file.replace(ROOT, '')} (${icon.size}px)`);
}

// iOS masks the corners itself; these must be opaque and carry no alpha channel.
for (const iosIcon of [
  { file: `${PUBLIC}/apple-touch-icon.png`, size: 180 },
  { file: `${STORE}/icon-ios-1024.png`, size: 1024 },
]) {
  await writeFile(iosIcon.file, await renderOpaqueSquare({ size: iosIcon.size, background: CREAM }));
  console.log(`wrote ${iosIcon.file.replace(ROOT, '')} (${iosIcon.size}px, opaque)`);
}

// Play feature graphic: 1024x500, no alpha.
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  @page { margin: 0 }
  html, body { margin: 0; width: 1024px; height: 500px; }
  body {
    background: radial-gradient(120% 140% at 12% 0%, #17a284 0%, #0f7b63 42%, #0a4d3f 100%);
    color: #fdf9ef; font-family: "Nunito", "Segoe UI", system-ui, sans-serif;
    display: flex; align-items: center; gap: 40px; padding: 0 64px; box-sizing: border-box;
  }
  img { width: 190px; height: 190px; border-radius: 44px; box-shadow: 0 24px 60px rgba(0,0,0,.28); flex: none; }
  .name { font-size: 66px; font-weight: 900; letter-spacing: -1.5px; line-height: 1; }
  .tag { margin-top: 16px; font-size: 27px; font-weight: 600; color: #cdeee3; line-height: 1.3; max-width: 640px; }
  .chips { margin-top: 26px; display: flex; gap: 10px; flex-wrap: wrap; }
  .chip {
    font-size: 17px; font-weight: 700; padding: 8px 16px; border-radius: 999px;
    background: rgba(253,249,239,.16); border: 1px solid rgba(253,249,239,.3);
  }
</style></head><body>
  <img src="${svgDataUrl}" alt="">
  <div>
    <div class="name">NutriPals</div>
    <div class="tag">Photograph a meal. Review the estimate. See your day come together.</div>
    <div class="chips"><span class="chip">AI meal photos</span><span class="chip">Water &amp; weight</span><span class="chip">Fasting timer</span><span class="chip">Kito the fox</span></div>
  </div>
</body></html>`);
await page.screenshot({ path: `${STORE}/feature-graphic-1024x500.png` });
console.log('wrote store/feature-graphic-1024x500.png');

// Store screenshots, captured from the real app with real stored data.
await seedDemoAccount(page);

const SHOTS = [
  { path: '/app', name: 'today' },
  { path: '/app/log', name: 'log-food' },
  { path: '/app/stats', name: 'insights' },
  { path: '/app/companion', name: 'companion' },
  { path: '/app/water', name: 'water' },
];

const TARGETS = [
  { prefix: 'ios-6.7', width: 430, height: 932, scale: 3, label: 'App Store iPhone 6.7" (1290x2796)' },
  { prefix: 'ios-ipad-13', width: 1032, height: 1376, scale: 2, label: 'App Store iPad 13" (2064x2752)' },
  { prefix: 'play-phone', width: 360, height: 640, scale: 3, label: 'Play phone (1080x1920)' },
  { prefix: 'play-tablet-7', width: 600, height: 960, scale: 2, label: 'Play 7" tablet (1200x1920)' },
];

// Carry the signed-in session (including the httpOnly cookie) into each device context.
const sessionState = await context.storageState();

for (const target of TARGETS) {
  const deviceContext = await browser.newContext({
    baseURL: BASE,
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: target.scale,
    isMobile: target.prefix !== 'ios-ipad-13',
    hasTouch: target.prefix !== 'ios-ipad-13',
    storageState: sessionState,
  });
  const shotPage = await deviceContext.newPage();

  let index = 1;
  for (const shot of SHOTS) {
    await shotPage.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
    await shotPage.waitForTimeout(700);
    const name = `${target.prefix}-${String(index).padStart(2, '0')}-${shot.name}.png`;
    await shotPage.screenshot({ path: `${STORE}/${name}` });
    console.log(`wrote store/${name} — ${target.label}`);
    index += 1;
  }
  await deviceContext.close();
}

await browser.close();
console.log('\nStore assets are in store/. Remember: screenshots must match the shipped build.');
