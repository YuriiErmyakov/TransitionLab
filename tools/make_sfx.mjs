// Procedural SFX synthesizer for CutAlchemy.
// node make_sfx.mjs [outRoot]   -> <outRoot>/<Style>/sfx/<style>_NN.wav
// Convention: the "hit" (cut point) of every sound is at exactly HIT = 0.5 s.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const HIT = 0.5;
const VARIANTS = 4;
const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = process.argv[2] || path.join(here, "..", "assets");

// ---------- helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

class Buf {
  constructor(dur) { this.n = Math.round(dur * SR); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
  add(i, v, pan = 0) { if (i < 0 || i >= this.n) return; const a = (pan + 1) * Math.PI / 4; this.L[i] += v * Math.cos(a); this.R[i] += v * Math.sin(a); }
}

// state-variable filter with per-sample cutoff
class SVF {
  constructor() { this.lp = 0; this.bp = 0; }
  run(x, f, q) { const F = 2 * Math.sin(Math.PI * clamp(f, 20, SR / 6) / SR); const hp = x - this.lp - this.bp / q; this.bp += F * hp; this.lp += F * this.bp; return { lp: this.lp, bp: this.bp, hp }; }
}

// envelope from points [[t, v], ...] with smooth interpolation
function envAt(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return lerp(v0, v1, smooth((t - t0) / (t1 - t0))); }
  return pts[pts.length - 1][1];
}

// filtered noise layer: freq(t), q, gain(t), pan(t)
function noiseLayer(b, rnd, { t0 = 0, t1 = b.n / SR, freq, q = 1.2, gain, pan = () => 0, mode = "bp" }) {
  const f = new SVF();
  for (let i = Math.round(t0 * SR); i < Math.min(b.n, Math.round(t1 * SR)); i++) {
    const t = i / SR; const o = f.run(rnd() * 2 - 1, freq(t), q);
    b.add(i, o[mode] * gain(t), pan(t));
  }
}

function tone(b, { t0, dur, f0, f1 = f0, gain = 0.5, decay = 6, attack = 0.002, pan = 0, shape = "sin", drive = 0 }) {
  let ph = 0;
  for (let k = 0; k < dur * SR; k++) {
    const t = k / SR; const fr = f0 * Math.pow(f1 / f0, t / dur); ph += 2 * Math.PI * fr / SR;
    let s = shape === "sin" ? Math.sin(ph) : shape === "sq" ? Math.sign(Math.sin(ph)) : (((ph / Math.PI) % 2) - 1);
    if (drive) s = Math.tanh(s * drive) / Math.tanh(drive);
    const env = Math.min(1, t / attack) * Math.exp(-decay * t);
    b.add(Math.round((t0 + t) * SR), s * gain * env, pan);
  }
}

// short filtered click / knock
function click(b, rnd, { t, freq = 2500, q = 6, gain = 0.6, decay = 60, len = 0.08, pan = 0 }) {
  const f = new SVF();
  for (let k = 0; k < len * SR; k++) {
    const tt = k / SR; const x = (k < 24 ? (rnd() * 2 - 1) * 4 : 0) + (rnd() * 2 - 1) * 0.3 * Math.exp(-tt * 200);
    b.add(Math.round((t + tt) * SR), f.run(x, freq, q).bp * gain * Math.exp(-decay * tt), pan);
  }
}

// Schroeder reverb (in-place mix)
function reverb(b, mix = 0.25, size = 1) {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round(d * size * SR / 44100));
  const aps = [225, 556].map((d) => Math.round(d * SR / 44100));
  for (const ch of [b.L, b.R]) {
    const wet = new Float32Array(b.n);
    combs.forEach((d, ci) => { const buf = new Float32Array(d); let idx = 0, fs_ = 0; const fb = 0.8 + ci * 0.01; for (let i = 0; i < b.n; i++) { const y = buf[idx]; fs_ = y * 0.7 + fs_ * 0.3; buf[idx] = ch[i] + fs_ * fb; idx = (idx + 1) % d; wet[i] += y * 0.25; } });
    aps.forEach((d) => { const buf = new Float32Array(d); let idx = 0; for (let i = 0; i < b.n; i++) { const y = buf[idx]; const x = wet[i]; buf[idx] = x + y * 0.5; idx = (idx + 1) % d; wet[i] = y - x * 0.5; } });
    if (ch === b.R) wet.copyWithin(0, 0); // keep
    for (let i = 0; i < b.n; i++) ch[i] = ch[i] * (1 - mix * 0.5) + wet[i] * mix;
  }
}

function bitcrush(b, t0, t1, bits = 5, hold = 6) {
  const q = Math.pow(2, bits - 1);
  for (const ch of [b.L, b.R]) { let held = 0; for (let i = Math.round(t0 * SR), k = 0; i < Math.min(b.n, t1 * SR); i++, k++) { if (k % hold === 0) held = Math.round(ch[i] * q) / q; ch[i] = held; } }
}

function finish(b, peakDb = -3) {
  // DC removal + fade edges + normalize
  for (const ch of [b.L, b.R]) { let x1 = 0, y1 = 0; for (let i = 0; i < b.n; i++) { const y = ch[i] - x1 + 0.995 * y1; x1 = ch[i]; y1 = y; ch[i] = y; } }
  const fade = Math.round(0.01 * SR);
  for (let i = 0; i < fade; i++) { const g = i / fade; b.L[i] *= g; b.R[i] *= g; b.L[b.n - 1 - i] *= g; b.R[b.n - 1 - i] *= g; }
  let pk = 1e-9; for (let i = 0; i < b.n; i++) pk = Math.max(pk, Math.abs(b.L[i]), Math.abs(b.R[i]));
  const g = Math.pow(10, peakDb / 20) / pk;
  for (let i = 0; i < b.n; i++) { b.L[i] = Math.tanh(b.L[i] * g * 1.1) / 1.1; b.R[i] = Math.tanh(b.R[i] * g * 1.1) / 1.1; }
}

function writeWav(file, b) {
  const data = Buffer.alloc(b.n * 4);
  for (let i = 0; i < b.n; i++) { data.writeInt16LE(Math.round(clamp(b.L[i], -1, 1) * 32767), i * 4); data.writeInt16LE(Math.round(clamp(b.R[i], -1, 1) * 32767), i * 4 + 2); }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

// ---------- recipes ----------
const R = {};

R.FilmFlash = (rnd) => {
  const b = new Buf(1.7); const dir = rnd() < 0.5 ? -1 : 1;
  noiseLayer(b, rnd, { freq: (t) => t < HIT ? lerp(250, 3200 + rnd() * 800, Math.pow(t / HIT, 2)) : lerp(3000, 400, clamp((t - HIT) / 0.9, 0, 1)), q: 1.6,
    gain: (t) => envAt([[0, 0], [0.15, 0.05], [HIT - 0.02, 1], [HIT + 0.15, 0.45], [1.6, 0]], t), pan: (t) => dir * lerp(-0.7, 0.7, clamp(t / 1.2, 0, 1)) });
  tone(b, { t0: HIT, dur: 0.6, f0: 70 + rnd() * 20, f1: 38, gain: 0.9, decay: 7 });
  // projector flutter tail
  const fl = 16 + rnd() * 6;
  noiseLayer(b, rnd, { t0: HIT, t1: 1.6, freq: () => 1800, q: 2, gain: (t) => (0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * fl * t))) * 0.25 * Math.exp(-(t - HIT) * 2.5) });
  reverb(b, 0.2); return b;
};

R.OpticalGlare = (rnd) => {
  const b = new Buf(2.0);
  noiseLayer(b, rnd, { freq: (t) => lerp(400, 2500, envAt([[0, 0], [HIT, 1], [1.8, 0.1]], t)), q: 0.9, mode: "lp",
    gain: (t) => envAt([[0, 0], [HIT - 0.05, 0.8], [HIT + 0.3, 0.4], [1.9, 0]], t), pan: (t) => Math.sin(t * 3 + rnd()) * 0.6 });
  const base = 1800 + rnd() * 1500;
  for (let k = 0; k < 6; k++) { const f = base * (1 + k * 0.5 + rnd() * 0.08); tone(b, { t0: 0.15 + rnd() * 0.25, dur: 1.6, f0: f, f1: f * (1.02 + rnd() * 0.05), gain: 0.06, decay: 1.6, attack: 0.3, pan: rnd() * 1.6 - 0.8 }); }
  tone(b, { t0: HIT - 0.1, dur: 1.2, f0: 55, f1: 45, gain: 0.35, decay: 3, attack: 0.08 });
  reverb(b, 0.45, 1.3); return b;
};

R.LensFlares = (rnd) => {
  const b = new Buf(1.9); const dir = rnd() < 0.5 ? -1 : 1;
  noiseLayer(b, rnd, { freq: (t) => lerp(600, 6000, envAt([[0, 0], [HIT, 1], [1.7, 0.2]], t)), q: 3,
    gain: (t) => envAt([[0, 0], [HIT - 0.03, 0.7], [HIT + 0.2, 0.25], [1.8, 0]], t), pan: (t) => dir * lerp(-0.9, 0.9, clamp(t / 1.2, 0, 1)) });
  tone(b, { t0: 0.1, dur: 0.45, f0: 300 + rnd() * 200, f1: 2400 + rnd() * 800, gain: 0.08, decay: 0.5, attack: 0.3 });
  tone(b, { t0: HIT, dur: 1.2, f0: 4200 + rnd() * 900, gain: 0.07, decay: 2.5, attack: 0.005 });
  tone(b, { t0: HIT, dur: 0.8, f0: 60, f1: 40, gain: 0.5, decay: 5 });
  reverb(b, 0.4, 1.2); return b;
};

R.Paper = (rnd) => {
  const b = new Buf(1.6);
  // rustle grains before hit
  for (let k = 0; k < 40; k++) { const t = rnd() * HIT; const len = 0.01 + rnd() * 0.04; noiseLayer(b, rnd, { t0: t, t1: t + len, freq: () => 1500 + rnd() * 4000, q: 1.5, gain: (tt) => 0.25 * Math.sin(Math.PI * (tt - t) / len) * (t / HIT), pan: () => rnd() * 1.4 - 0.7 }); }
  // the rip: dense crackle
  const ripLen = 0.25 + rnd() * 0.35; const f = new SVF(); const fc = 2200 + rnd() * 1500;
  for (let i = Math.round((HIT - 0.04) * SR); i < (HIT + ripLen) * SR; i++) { const t = i / SR - HIT; const dens = 0.08 + 0.3 * rnd(); const x = rnd() < dens ? (rnd() * 2 - 1) * 2 : 0; const env = envAt([[-0.04, 0], [0.01, 1], [ripLen * 0.7, 0.7], [ripLen, 0]], t); b.add(i, f.run(x, fc + Math.sin(t * 40) * 600, 1.1).bp * env * 0.8, Math.sin(t * 6) * 0.4); }
  click(b, rnd, { t: HIT - 0.01, freq: 900, q: 3, gain: 0.5, decay: 30, len: 0.12 });
  // flap tail
  noiseLayer(b, rnd, { t0: HIT, t1: 1.5, freq: () => 900, q: 0.8, mode: "lp", gain: (t) => 0.3 * Math.exp(-(t - HIT) * 4) });
  reverb(b, 0.12, 0.6); return b;
};

R.VHS = (rnd) => {
  const b = new Buf(1.6);
  // hum + hiss
  tone(b, { t0: 0, dur: 1.6, f0: 50, gain: 0.12, decay: 0, attack: 0.2, shape: "saw" });
  noiseLayer(b, rnd, { freq: () => 7000, q: 0.7, mode: "hp", gain: (t) => envAt([[0, 0], [0.2, 0.15], [HIT, 0.35], [1.5, 0.05]], t) });
  // digital stutter bursts around the hit
  for (let k = 0; k < 9; k++) { const t = HIT - 0.3 + rnd() * 0.55; tone(b, { t0: t, dur: 0.03 + rnd() * 0.07, f0: 200 + rnd() * 2400, f1: 100 + rnd() * 2400, gain: 0.25, decay: 4, shape: "sq", pan: rnd() * 1.6 - 0.8 }); }
  // tape stop / warp
  tone(b, { t0: HIT - 0.35, dur: 0.4, f0: 900 + rnd() * 400, f1: 60, gain: 0.25, decay: 1.5, shape: "saw", attack: 0.05 });
  click(b, rnd, { t: HIT, freq: 3000, q: 2, gain: 0.9, decay: 80 });
  bitcrush(b, HIT - 0.3, HIT + 0.3, 4 + Math.floor(rnd() * 3), 4 + Math.floor(rnd() * 8));
  return b;
};

R.Horror = (rnd) => {
  const b = new Buf(2.2);
  // reverse swell into the hit
  noiseLayer(b, rnd, { t0: 0, t1: HIT, freq: (t) => lerp(200, 2500, Math.pow(t / HIT, 3)), q: 0.9, mode: "lp", gain: (t) => Math.pow(t / HIT, 4) * 0.9 });
  tone(b, { t0: HIT, dur: 1.6, f0: 48 + rnd() * 10, f1: 30, gain: 1, decay: 2.4, drive: 3 });
  // metallic screech (FM)
  const fc = 1100 + rnd() * 900, fm = fc * (1.41 + rnd() * 0.3); let ph = 0;
  for (let k = 0; k < 1.2 * SR; k++) { const t = k / SR; ph += 2 * Math.PI * (fc + Math.sin(2 * Math.PI * fm * t) * fc * 0.8 * Math.exp(-t * 2)) / SR; b.add(Math.round((HIT + t) * SR), Math.sin(ph) * 0.12 * Math.min(1, t / 0.01) * Math.exp(-t * 2.2), Math.sin(t * 9) * 0.6); }
  click(b, rnd, { t: HIT, freq: 400, q: 1.5, gain: 1, decay: 20, len: 0.2 });
  reverb(b, 0.55, 1.5); return b;
};

R.SlideProjector = (rnd) => {
  const b = new Buf(1.5);
  noiseLayer(b, rnd, { freq: () => 300, q: 0.7, mode: "lp", gain: () => 0.08 }); // fan
  const t1 = HIT - 0.1 - rnd() * 0.08;
  click(b, rnd, { t: t1, freq: 1800 + rnd() * 600, q: 5, gain: 0.7, decay: 45, len: 0.1, pan: -0.2 });
  click(b, rnd, { t: t1 + 0.004, freq: 600, q: 3, gain: 0.6, decay: 35, len: 0.12 });
  // tray slide
  noiseLayer(b, rnd, { t0: t1 + 0.02, t1: HIT, freq: () => 2500, q: 2, gain: (t) => 0.2 * Math.sin(Math.PI * (t - t1 - 0.02) / (HIT - t1 - 0.02)) });
  click(b, rnd, { t: HIT, freq: 1300 + rnd() * 500, q: 6, gain: 0.9, decay: 40, len: 0.12, pan: 0.2 });
  click(b, rnd, { t: HIT + 0.003, freq: 450, q: 3, gain: 0.7, decay: 30, len: 0.15 });
  reverb(b, 0.15, 0.5); return b;
};

R.Scrapbook = (rnd) => {
  const b = new Buf(1.5); let t = 0.15 + rnd() * 0.08; const step = 1 / (10 + Math.floor(rnd() * 3));
  while (t < 1.05) {
    const near = Math.abs(t - HIT) < step / 2 ? HIT : t;
    if (rnd() < 0.8 || near === HIT) {
      click(b, rnd, { t: near, freq: 120 + rnd() * 140, q: 1.5, gain: near === HIT ? 1 : 0.5, decay: 25, len: 0.12, pan: rnd() * 1.2 - 0.6 });
      const s = near; const len = 0.03 + rnd() * 0.05;
      noiseLayer(b, rnd, { t0: s, t1: s + len, freq: () => 2000 + rnd() * 3000, q: 1.2, gain: (tt) => 0.35 * Math.exp(-(tt - s) * 40), pan: () => rnd() - 0.5 });
    }
    t += step;
  }
  reverb(b, 0.12, 0.6); return b;
};

R.PunchHole = (rnd) => {
  const b = new Buf(1.6);
  // ka-chunk
  click(b, rnd, { t: HIT - 0.06, freq: 2600, q: 4, gain: 0.5, decay: 70 });
  click(b, rnd, { t: HIT, freq: 180 + rnd() * 60, q: 1.4, gain: 1, decay: 22, len: 0.2 });
  click(b, rnd, { t: HIT + 0.002, freq: 3800 + rnd() * 800, q: 8, gain: 0.6, decay: 45, len: 0.12 });
  // film rattle 24 fps around hit
  const fps = 22 + rnd() * 4;
  for (let t = 0.05; t < 1.4; t += 1 / fps) { const g = envAt([[0, 0], [HIT - 0.1, 0.35], [HIT + 0.3, 0.3], [1.4, 0]], t); click(b, rnd, { t, freq: 2200 + rnd() * 900, q: 3, gain: g, decay: 120, len: 0.03, pan: rnd() * 0.6 - 0.3 }); }
  reverb(b, 0.12, 0.6); return b;
};

R.AestheticFilm = (rnd) => {
  const b = new Buf(2.0); const fps = 18 + rnd() * 6;
  for (let t = 0.02; t < 1.9; t += 1 / fps) { const g = envAt([[0, 0], [0.4, 0.4], [1.1, 0.35], [1.9, 0]], t); click(b, rnd, { t, freq: 1500 + rnd() * 500, q: 2, gain: g, decay: 140, len: 0.025 }); }
  noiseLayer(b, rnd, { freq: (t) => lerp(500, 1600, envAt([[0, 0], [HIT, 1], [1.9, 0.3]], t)), q: 1, mode: "lp", gain: (t) => envAt([[0, 0], [HIT, 0.5], [1.9, 0]], t), pan: (t) => Math.sin(t * 2) * 0.4 });
  tone(b, { t0: HIT, dur: 0.5, f0: 90, f1: 60, gain: 0.35, decay: 6 });
  reverb(b, 0.25, 0.9); return b;
};

R.PhotoMatchCut = (rnd) => {
  const b = new Buf(1.6);
  // flash charge whine
  tone(b, { t0: 0.02, dur: HIT - 0.06, f0: 1800 + rnd() * 400, f1: 7000 + rnd() * 2000, gain: 0.05, decay: 0, attack: 0.2 });
  // shutter: two clicks
  const gap = 0.025 + rnd() * 0.03;
  click(b, rnd, { t: HIT - gap, freq: 3200 + rnd() * 800, q: 4, gain: 0.8, decay: 70, len: 0.06, pan: -0.15 });
  click(b, rnd, { t: HIT, freq: 2400 + rnd() * 600, q: 4, gain: 0.9, decay: 60, len: 0.07, pan: 0.15 });
  click(b, rnd, { t: HIT + 0.002, freq: 500, q: 2, gain: 0.5, decay: 40, len: 0.1 });
  // flash pop + whoosh tail
  noiseLayer(b, rnd, { t0: HIT, t1: 1.5, freq: (t) => lerp(5000, 600, clamp((t - HIT) / 0.8, 0, 1)), q: 0.9, gain: (t) => 0.4 * Math.exp(-(t - HIT) * 3), pan: (t) => (t - HIT) * 0.8 });
  // film advance
  if (rnd() < 0.7) for (let k = 0; k < 6; k++) click(b, rnd, { t: HIT + 0.22 + k * 0.035, freq: 2600, q: 5, gain: 0.25, decay: 120, len: 0.02 });
  reverb(b, 0.18, 0.7); return b;
};

// ---------- main ----------
const names = { FilmFlash: "film_flash", OpticalGlare: "optical_glare", LensFlares: "lens_flares", Paper: "paper", VHS: "vhs", Horror: "horror", SlideProjector: "slide_projector", Scrapbook: "scrapbook", PunchHole: "punch_hole", AestheticFilm: "aesthetic_film", PhotoMatchCut: "photo_match_cut" };
let count = 0;
for (const [style, fn] of Object.entries(R)) {
  for (let v = 1; v <= VARIANTS; v++) {
    const rnd = mulberry32(v * 7919 + style.length * 104729 + style.charCodeAt(0));
    const b = fn(rnd); finish(b);
    const file = path.join(outRoot, style, "sfx", `${names[style]}_${String(v).padStart(2, "0")}.wav`);
    writeWav(file, b); count++;
  }
  fs.mkdirSync(path.join(outRoot, style, "overlays"), { recursive: true });
}
console.log(`wrote ${count} sfx to ${outRoot}`);
