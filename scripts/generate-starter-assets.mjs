// Generates the original Clockwork starter art (SVG) and audio (WAV).
// Run once with `node scripts/generate-starter-assets.mjs`; the outputs are committed.
// All art is procedural and original to this project.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "starter");
const audioDir = join(outDir, "audio");

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;

// ---------------------------------------------------------------- player sheet
const CELL = 128;
function playerFrame(index) {
  const ox = (index % 4) * CELL;
  const oy = Math.floor(index / 4) * CELL;
  const bob = [0, -3, 0, 2, 0, -2, 0, 2][index] ?? 0;
  const legA = [0, 9, -7, 11, 0, 7, -5, 10][index] ?? 0;
  const legB = [0, -3, 9, -5, 0, -7, 7, -4][index] ?? 0;
  const arm = [0, -9, 0, 7, 0, -11, 0, 5][index] ?? 0;
  const cx = 64;
  const top = 38 + bob;
  return `<g transform="translate(${ox} ${oy})">
    <rect x="${cx - 26}" y="${top}" width="52" height="58" rx="12" fill="#8f9dff"/>
    <rect x="${cx - 20}" y="${top + 10}" width="40" height="15" rx="7" fill="#d7e2ff"/>
    <rect x="${cx - 10}" y="${top + 13}" width="20" height="9" rx="4" fill="#2a3350"/>
    <rect x="${cx - 6}" y="${top + 28}" width="12" height="6" rx="3" fill="#ff856f"/>
    <rect x="${cx - 24 + arm}" y="${top + 30}" width="10" height="18" rx="5" fill="#7383e8"/>
    <rect x="${cx + 14 - arm}" y="${top + 30}" width="10" height="18" rx="5" fill="#7383e8"/>
    <rect x="${cx - 16}" y="${top + 58 + legA * 0.15}" width="11" height="${24 + legA}" rx="5" fill="#6c7bdd"/>
    <rect x="${cx + 5}" y="${top + 58 + legB * 0.15}" width="11" height="${24 + legB}" rx="5" fill="#6c7bdd"/>
    <rect x="${cx - 18}" y="${top + 80 + legA}" width="16" height="7" rx="3" fill="#cfe0ff"/>
    <rect x="${cx + 2}" y="${top + 80 + legB}" width="16" height="7" rx="3" fill="#cfe0ff"/>
  </g>`;
}
let frames = "";
for (let i = 0; i < 8; i += 1) frames += playerFrame(i);
const playerSheet = svg(512, 256, frames);

// ---------------------------------------------------------------------- drone
const drone = svg(96, 64, `
  <rect x="28" y="24" width="40" height="24" rx="10" fill="#c7d0ff"/>
  <rect x="34" y="30" width="28" height="10" rx="5" fill="#ff856f"/>
  <rect x="10" y="18" width="24" height="5" rx="2.5" fill="#8a94ad"/>
  <rect x="62" y="18" width="24" height="5" rx="2.5" fill="#8a94ad"/>
  <rect x="46" y="12" width="4" height="12" fill="#8a94ad"/>
  <circle cx="16" cy="14" r="7" fill="none" stroke="#d7e2ff" stroke-width="3" opacity="0.7"/>
  <circle cx="80" cy="14" r="7" fill="none" stroke="#d7e2ff" stroke-width="3" opacity="0.7"/>
  <rect x="30" y="48" width="6" height="10" rx="3" fill="#5c6785"/>
  <rect x="60" y="48" width="6" height="10" rx="3" fill="#5c6785"/>
`);

// ----------------------------------------------------------------------- coin
const coin = svg(48, 48, `
  <circle cx="24" cy="24" r="20" fill="#f4c56a"/>
  <circle cx="24" cy="24" r="15" fill="#ffe7ad"/>
  <rect x="21" y="13" width="6" height="22" rx="3" fill="#c98f2a"/>
  <circle cx="24" cy="24" r="5" fill="none" stroke="#c98f2a" stroke-width="3"/>
`);

// ----------------------------------------------------------------------- flag
const flag = svg(64, 96, `
  <rect x="14" y="8" width="6" height="84" rx="3" fill="#c7d0ff"/>
  <path d="M20 10 L56 24 L20 38 Z" fill="#ff856f"/>
  <path d="M20 10 L56 24 L20 38 Z" fill="none" stroke="#ffb3a4" stroke-width="2"/>
  <rect x="6" y="88" width="22" height="6" rx="3" fill="#5c6785"/>
`);

// ---------------------------------------------------------------------- spark
const spark = svg(96, 48, `
  <path d="M4 44 L18 12 L30 34 L42 6 L54 34 L66 14 L80 40 L92 20 L92 44 Z" fill="#ff856f" opacity="0.95"/>
  <path d="M4 44 L18 12 L30 34 L42 6 L54 34 L66 14 L80 40 L92 20" fill="none" stroke="#ffd0c7" stroke-width="2"/>
  <circle cx="42" cy="30" r="3" fill="#fff1c4"/>
`);

// --------------------------------------------------------------------- ground
// Wide and short so the 2200x100 template ground is not stretched into mush.
let groundStones = "";
for (let i = 0; i < 40; i += 1) {
  const x = 16 + ((i * 137) % 2000);
  const y = 30 + ((i * 53) % 54);
  const w = 18 + ((i * 29) % 34);
  const h = 7 + ((i * 17) % 9);
  groundStones += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#1b2338"/>`;
}
for (let i = 0; i < 22; i += 1) {
  const x = 24 + ((i * 211) % 1980);
  const y = 22 + ((i * 37) % 64);
  groundStones += `<rect x="${x}" y="${y}" width="${8 + ((i * 13) % 9)}" height="5" rx="2" fill="#39466a"/>`;
}
const ground = svg(2048, 100, `
  <rect x="0" y="0" width="2048" height="100" fill="#242d44"/>
  <rect x="0" y="0" width="2048" height="16" fill="#384562"/>
  <rect x="0" y="0" width="2048" height="6" fill="#4d5c7f"/>
  ${groundStones}
`);

// ------------------------------------------------------------------- platform
const platform = svg(256, 32, `
  <rect x="0" y="6" width="256" height="20" rx="4" fill="#384562"/>
  <rect x="0" y="6" width="256" height="7" rx="3" fill="#4d5c7f"/>
  <rect x="4" y="26" width="30" height="4" rx="2" fill="#1b2338"/>
  <rect x="222" y="26" width="30" height="4" rx="2" fill="#1b2338"/>
  <rect x="92" y="14" width="18" height="5" rx="2" fill="#2a3350"/>
  <rect x="156" y="14" width="26" height="5" rx="2" fill="#2a3350"/>
`);

// ---------------------------------------------------------------------- sky
const stars = Array.from({ length: 48 }, (_, i) => {
  const x = (i * 197 + 83) % 2048;
  const y = 40 + ((i * 131) % 620);
  const r = i % 9 === 0 ? 2.6 : i % 3 === 0 ? 1.8 : 1.1;
  const o = (0.25 + ((i * 17) % 40) / 100).toFixed(2);
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#dce4ff" opacity="${o}"/>`;
}).join("");
const sky = svg(2048, 1024, `
  <defs>
    <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1020"/>
      <stop offset="0.55" stop-color="#1a2340"/>
      <stop offset="0.82" stop-color="#33436e"/>
      <stop offset="1" stop-color="#10162a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f6e7c8" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#f6e7c8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="2048" height="1024" fill="url(#dusk)"/>
  ${stars}
  <circle cx="1540" cy="210" r="210" fill="url(#glow)"/>
  <path d="M0 780 Q420 690 850 760 T2048 730 L2048 1024 L0 1024 Z" fill="#1a2238" opacity="0.55"/>
`);

const moon = svg(128, 128, `
  <circle cx="64" cy="64" r="46" fill="#f6e7c8"/>
  <circle cx="48" cy="50" r="7" fill="#e2d0ac" opacity="0.7"/>
  <circle cx="76" cy="78" r="10" fill="#e2d0ac" opacity="0.55"/>
  <circle cx="82" cy="46" r="5" fill="#e2d0ac" opacity="0.6"/>
  <circle cx="52" cy="82" r="4" fill="#e2d0ac" opacity="0.5"/>
`);

// ---------------------------------------------------------------------- hills
// 4:1 silhouettes sized to the template ridge objects; stars live in the sky asset.
const hill = (fill, accent, path) => svg(2048, 512, `
  <path d="${path}" fill="${fill}"/>
  <path d="${path}" fill="none" stroke="${accent}" stroke-width="3" opacity="0.45"/>
`);
const hillFar = hill("#1b2236", "#2a3350", "M0 380 L240 300 L460 350 L720 250 L1000 330 L1280 260 L1560 340 L1800 290 L2048 350 L2048 512 L0 512 Z");
const hillMid = hill("#202a42", "#39466a", "M0 430 L220 360 L480 410 L760 330 L1040 400 L1320 340 L1600 410 L1860 360 L2048 420 L2048 512 L0 512 Z");
const hillNear = hill("#27324d", "#4d5c7f", "M0 470 L280 420 L560 460 L840 400 L1120 455 L1400 410 L1680 460 L1920 430 L2048 460 L2048 512 L0 512 Z");

// ---------------------------------------------------------------------- panel
const panel = svg(256, 128, `
  <rect x="2" y="2" width="252" height="124" rx="14" fill="#151a2c" stroke="#39466a" stroke-width="2"/>
  <rect x="16" y="16" width="224" height="30" rx="8" fill="#202a42"/>
  <rect x="24" y="26" width="80" height="10" rx="5" fill="#8f9dff"/>
  <rect x="16" y="58" width="224" height="54" rx="8" fill="#10141f"/>
  <rect x="28" y="70" width="120" height="8" rx="4" fill="#4d5c7f"/>
  <rect x="28" y="88" width="84" height="8" rx="4" fill="#39466a"/>
`);

// ----------------------------------------------------------------------- audio
const SAMPLE_RATE = 22050;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function tone({ from, to, seconds, volume = 0.5, decay = 0.001, shape = "sine" }) {
  const length = Math.floor(seconds * SAMPLE_RATE);
  const samples = new Array(length);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    phase += (2 * Math.PI * (from + (to - from) * t)) / SAMPLE_RATE;
    const envelope = Math.exp(-decay * i) * (1 - t * 0.25);
    const wave = shape === "square" ? Math.sign(Math.sin(phase)) * 0.6 : Math.sin(phase);
    samples[i] = wave * envelope * volume;
  }
  return samples;
}

function mix(...tracks) {
  const length = Math.max(...tracks.map((track) => track.length));
  const out = new Array(length).fill(0);
  for (const track of tracks) for (let i = 0; i < track.length; i += 1) out[i] += track[i];
  return out.map((value) => Math.max(-1, Math.min(1, value)));
}

const coinSfx = mix(
  tone({ from: 880, to: 1320, seconds: 0.07, volume: 0.35, decay: 0.004 }),
  tone({ from: 1320, to: 1760, seconds: 0.09, volume: 0.3, decay: 0.003 }),
);
const jumpSfx = mix(
  tone({ from: 220, to: 660, seconds: 0.12, volume: 0.32, decay: 0.002, shape: "square" }),
  tone({ from: 330, to: 880, seconds: 0.09, volume: 0.18, decay: 0.004 }),
);
const clickSfx = mix(
  tone({ from: 1400, to: 900, seconds: 0.035, volume: 0.3, decay: 0.02 }),
  tone({ from: 600, to: 500, seconds: 0.02, volume: 0.15, decay: 0.03 }),
);

// ----------------------------------------------------------------------- write
await mkdir(audioDir, { recursive: true });
const files = {
  "player-sheet.svg": playerSheet,
  "drone.svg": drone,
  "coin.svg": coin,
  "flag.svg": flag,
  "spark.svg": spark,
  "sky.svg": sky,
  "moon.svg": moon,
  "ground.svg": ground,
  "platform.svg": platform,
  "hill-far.svg": hillFar,
  "hill-mid.svg": hillMid,
  "hill-near.svg": hillNear,
  "panel.svg": panel,
};
for (const [name, content] of Object.entries(files)) {
  await writeFile(join(outDir, name), content, "utf8");
}
await writeFile(join(audioDir, "coin.wav"), wav(coinSfx));
await writeFile(join(audioDir, "jump.wav"), wav(jumpSfx));
await writeFile(join(audioDir, "click.wav"), wav(clickSfx));

console.log(`Wrote ${Object.keys(files).length} SVGs and 3 WAVs to ${outDir}`);
