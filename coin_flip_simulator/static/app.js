import { certaintyEquivalent, breakEvenWealth, kelly, logspace, adjustmentCoefficient, scaleBet } from './sim.js';
import {
  Chart,
  DASH,
  linearScale,
  logScale,
  drawAxes,
  clipPlot,
  line,
  vline,
  hline,
  dot,
  crosshair,
  bar,
  rampColor,
  hatch,
  legendHTML,
  money,
  pct,
} from './charts.js';

const $ = (id) => document.getElementById(id);
const GRID_ROWS = 48;
const TABLE_MULTIPLES = [1, 2, 5, 10, 20, 50, 100, 1000];
const TABLE_COLS = [10, 50, 100, 500, 1000, 5000];
const STORE = 'coinflip:v1';
const fmtInt = (n) => n.toLocaleString('en-US');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- state (persisted)
/** The numbers "Reset to defaults" restores. Theme is a viewing preference and is left alone. */
const DEFAULTS = Object.freeze({ w0: 1000, win: 1050, loss: 1000, p: 0.5, flips: 500, gamma: 1, pathCount: 200, seed: 1 });
const state = {
  ...DEFAULTS,
  theme: 'auto',
  main: null, // { dist, sample }
  grid: null, // { grid, table }
};
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof saved[k] === 'number' && isFinite(saved[k])) state[k] = saved[k];
  }
  if (['auto', 'light', 'dark'].includes(saved.theme)) state.theme = saved.theme;
} catch {}
/** The bet as last typed. Moving the stake rescales this, never the already-rescaled bet, so the odds can't drift. */
const setAnchor = () => (state.anchor = { win: state.win, loss: state.loss });
setAnchor();
const cents = (x) => Math.round(x * 100) / 100;
let saveTimer = null;
function save() {
  syncResetButton();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { w0, win, loss, p, flips, gamma, pathCount, seed, theme } = state;
    try {
      localStorage.setItem(STORE, JSON.stringify({ w0, win, loss, p, flips, gamma, pathCount, seed, theme }));
    } catch {}
  }, 250);
}

const params = () => ({ w0: state.w0, win: state.win, loss: state.loss, p: state.p });
const ev = () => state.p * state.win - (1 - state.p) * state.loss;
const odds = () => ({ win: state.win, loss: state.loss, p: state.p });

/** Expected log-growth per flip when staking fraction f of wealth on these odds. */
function growth(f, P = odds()) {
  const b = P.win / P.loss;
  if (f >= 1) return -Infinity;
  return P.p * Math.log1p(b * f) + (1 - P.p) * Math.log1p(-f);
}
/** Fraction where growth returns to zero above Kelly (the log break-even fraction). */
function zeroGrowthFraction(P = odds()) {
  const k = kelly(P).fraction;
  if (!(k > 0)) return 0;
  let lo = k;
  let hi = 1 - 1e-12;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (growth(mid, P) > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}
/** The fraction of wealth a CRRA(γ) player would choose to stake on these odds. */
function bestFractionFor(gamma, P = odds()) {
  if (!(kelly(P).fraction > 0)) return 0;
  const b = P.win / P.loss;
  const val = (f) => certaintyEquivalent(1, { win: b * f, loss: f, p: P.p }, gamma);
  let a = 1e-6;
  let c = 0.999;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 120; i++) {
    const x1 = c - g * (c - a);
    const x2 = a + g * (c - a);
    if (val(x1) < val(x2)) a = x1;
    else c = x2;
  }
  return (a + c) / 2;
}
/** CRRA utility around w0, scaled so its slope at w0 is 1 (units: dollars). */
function utilityAt(W, gamma, w0) {
  if (gamma === 0) return W - w0;
  if (W <= 0) return gamma >= 1 ? -Infinity : (w0 ** gamma * (0 - w0 ** (1 - gamma))) / (1 - gamma);
  if (Math.abs(gamma - 1) < 1e-9) return w0 * Math.log(W / w0);
  return (w0 ** gamma * (W ** (1 - gamma) - w0 ** (1 - gamma))) / (1 - gamma);
}
function inverseUtility(u, gamma, w0) {
  if (gamma === 0) return u + w0;
  if (Math.abs(gamma - 1) < 1e-9) return w0 * Math.exp(u / w0);
  const inner = (u * (1 - gamma)) / w0 ** gamma + w0 ** (1 - gamma);
  return inner <= 0 ? 0 : inner ** (1 / (1 - gamma));
}
function niceRound(x) {
  if (!(x > 0)) return x;
  const m = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / m) * m;
}
const gammaLabel = (g) => (Number.isInteger(g) ? String(g) : String(g));

// ---------------------------------------------------------------- charts
const charts = {
  paths: new Chart($('chart-paths'), { height: 380, margin: { top: 14, right: 118, bottom: 38, left: 60 } }),
  hist: new Chart($('chart-hist'), { height: 320, margin: { top: 22, right: 20, bottom: 38, left: 52 } }),
  ruin: new Chart($('chart-ruin'), { height: 320, margin: { top: 14, right: 104, bottom: 38, left: 48 } }),
  heat: new Chart($('chart-heat'), { height: 420, margin: { top: 12, right: 20, bottom: 38, left: 60 } }),
  util: new Chart($('chart-util'), { height: 400, margin: { top: 16, right: 24, bottom: 38, left: 68 } }),
  ce: new Chart($('chart-ce'), { height: 360, margin: { top: 16, right: 24, bottom: 38, left: 64 } }),
  kelly: new Chart($('chart-kelly'), { height: 360, margin: { top: 16, right: 24, bottom: 38, left: 56 } }),
};
const redrawAll = () => {
  Object.values(charts).forEach((c) => c.draw());
  buildNomo();
};

const tipHead = (s) => `<div class="t-head">${s}</div>`;
const tipRow = (label, value, color) =>
  `<div class="t-row"><span>${color ? `<i style="--c:${color}"></i>` : ''}${label}</span><b>${value}</b></div>`;

// ---------------------------------------------------------------- worker
let worker = null;
let busy = false;
let jobId = 0;

function makeWorker() {
  const w = new Worker('./worker.js', { type: 'module' });
  w.onmessage = (e) => {
    const msg = e.data;
    if (msg.id !== jobId) return;
    if (msg.type === 'main') {
      state.main = msg;
      renderMain();
      $('status').textContent = 'Working out every starting bankroll…';
    } else {
      state.grid = msg;
      busy = false;
      $('status').textContent = '';
      renderGridDependents();
    }
  };
  w.onerror = (e) => {
    $('status').textContent = `Calculation failed: ${e.message}. Change any number to retry.`;
    busy = false;
  };
  return w;
}

function tableWealths() {
  const P = odds();
  const extra = [state.w0];
  const be = breakEvenWealth(P, 1);
  const k = kelly(P);
  if (isFinite(be) && be > state.loss) extra.push(niceRound(be));
  if (isFinite(k.wealth) && k.wealth > state.loss) extra.push(niceRound(k.wealth));
  return [...new Set([...TABLE_MULTIPLES.map((m) => m * state.loss), ...extra])].sort((a, b) => a - b);
}

function compute() {
  jobId++;
  if (busy && worker) {
    worker.terminate();
    worker = null;
  }
  if (!worker) worker = makeWorker();
  busy = true;
  $('status').textContent = 'Computing…';
  worker.postMessage({
    id: jobId,
    params: params(),
    flips: state.flips,
    pathCount: state.pathCount,
    seed: state.seed,
    gridRows: GRID_ROWS,
    tableWealths: tableWealths(),
  });
}
let debounceTimer = null;
function scheduleCompute() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(compute, 120);
}

// ---------------------------------------------------------------- rail controls
function wealthToSlider(w) {
  const lo = Math.log(state.loss);
  const hi = Math.log(state.loss * 1000);
  return Math.round(((Math.log(Math.max(w, state.loss)) - lo) / (hi - lo)) * 1000);
}
function sliderToWealth(v) {
  const lo = Math.log(state.loss);
  const hi = Math.log(state.loss * 1000);
  return Math.max(state.loss, niceRound(Math.exp(lo + ((hi - lo) * v) / 1000)));
}

const atDefaults = () => Object.keys(DEFAULTS).every((k) => state[k] === DEFAULTS[k]);
function syncResetButton() {
  $('reset').disabled = atDefaults();
}

function resetNumbers() {
  Object.assign(state, DEFAULTS);
  setAnchor();
  syncRail();
  buildNomo();
  nomoAnimate();
  // the button disables itself, so hand focus to the first field instead of dropping it on the page
  $('w0').focus({ preventScroll: true });
  save();
  renderInstant();
  compute();
}

function syncRail() {
  $('w0').value = state.w0;
  $('w0-slider').value = wealthToSlider(state.w0);
  $('flips').value = state.flips;
  $('flips-slider').value = state.flips;
  $('gamma').value = state.gamma;
  $('gamma-out').textContent = gammaLabel(state.gamma);
  $('win').value = state.win;
  $('loss').value = state.loss;
  $('p').value = state.p;
  $('paths').value = String(state.pathCount);
  renderPresets();
  syncResetButton();
}

function renderPresets() {
  const P = odds();
  const be = breakEvenWealth(P, 1);
  const k = kelly(P);
  const items = [1, 2, 5, 10, 100].map((m) => ({ label: money(m * state.loss), w: m * state.loss }));
  if (isFinite(be) && be > state.loss) items.push({ label: `Break-even ${money(niceRound(be))}`, w: niceRound(be) });
  if (isFinite(k.wealth) && k.wealth > state.loss) items.push({ label: `Kelly ${money(niceRound(k.wealth))}`, w: niceRound(k.wealth) });
  items.sort((a, b) => a.w - b.w);
  $('presets').innerHTML = items
    .map((it) => `<button type="button" data-w="${it.w}" aria-pressed="${it.w === state.w0}">${it.label}</button>`)
    .join('');
}

/** Everything cheap that depends only on the inputs (no worker results). */
function renderInstant() {
  const P = odds();
  const k = kelly(P);
  const be1 = breakEvenWealth(P, 1);
  const E = ev();
  $('rh-terms').textContent = `Heads ${money(state.win, { compact: false, sign: true })} · tails −${money(state.loss, { compact: false })} · p = ${state.p.toFixed(2)} · average ${money(E, { compact: false, sign: true })} a flip`;
  const vals = {
    loss: money(state.loss, { compact: false }),
    kellyF: k.fraction > 0 ? pct(k.fraction, 2) : 'zero',
    kellyW: isFinite(k.wealth) ? money(niceRound(k.wealth)) : 'no wealth at all',
    beF1: isFinite(be1) ? pct(state.loss / be1, 2) : '0%',
    beW1: isFinite(be1) ? money(niceRound(be1)) : 'never',
    ev: money(E, { compact: false, sign: true }),
  };
  document.querySelectorAll('[data-v]').forEach((el) => {
    if (vals[el.dataset.v] != null) el.textContent = vals[el.dataset.v];
  });
  document.querySelectorAll('.nflips').forEach((el) => (el.textContent = fmtInt(state.flips)));
  $('numbers-sum').textContent = `${money(state.w0)} · ${fmtInt(state.flips)} flips · γ ${gammaLabel(state.gamma)}`;
  renderPlate1Text();
  updateNomo();
  renderUtil();
  renderCE();
  renderKelly();
}

function onInputsChanged({ instant = true } = {}) {
  save();
  if (instant) renderInstant();
  scheduleCompute();
}

function num(id, fallback, min, max) {
  const v = parseFloat($(id).value);
  if (!isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

const dragWealth = (W) => {
  const w = niceRound(Math.min(1e9, Math.max(state.loss, W)));
  if (w !== state.w0) setWealth(w, { animate: false });
};

function setWealth(w, { animate = true } = {}) {
  state.w0 = Math.round(w);
  $('w0').value = state.w0;
  $('w0-slider').value = wealthToSlider(state.w0);
  renderPresets();
  if (animate) nomoAnimate();
  onInputsChanged();
}

function bindControls() {
  $('w0').addEventListener('change', () => setWealth(num('w0', state.w0, 0, 1e9)));
  $('w0-slider').addEventListener('input', () => setWealth(sliderToWealth(+$('w0-slider').value), { animate: false }));
  $('presets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setWealth(+b.dataset.w);
  });
  for (const id of ['win', 'loss', 'p']) {
    $(id).addEventListener('change', () => {
      state.win = cents(num('win', state.win, 0.01, 1e8));
      state.loss = Math.round(num('loss', state.loss, 1, 1e8));
      state.p = num('p', state.p, 0.01, 0.99);
      setAnchor();
      syncRail();
      nomoAnimate();
      buildNomo();
      onInputsChanged();
    });
  }
  $('flips').addEventListener('change', () => {
    state.flips = Math.round(num('flips', state.flips, 1, 5000));
    syncRail();
    onInputsChanged();
  });
  $('flips-slider').addEventListener('input', () => {
    state.flips = +$('flips-slider').value;
    $('flips').value = state.flips;
    onInputsChanged();
  });
  $('gamma').addEventListener('input', () => {
    state.gamma = +$('gamma').value;
    $('gamma-out').textContent = gammaLabel(state.gamma);
    save();
    buildNomo();
    renderInstant();
    renderSummary();
    renderTable();
  });
  $('paths').addEventListener('change', () => {
    state.pathCount = +$('paths').value;
    save();
    compute();
  });
  $('reset').addEventListener('click', resetNumbers);
  $('reseed').addEventListener('click', () => {
    state.seed = (state.seed * 1103515245 + 12345) >>> 0;
    save();
    compute();
  });

  const modes = ['auto', 'light', 'dark'];
  const applyTheme = () => {
    if (state.theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = state.theme;
    $('theme-toggle').textContent = `Theme: ${state.theme}`;
    $('theme-toggle').setAttribute('aria-label', `Colour theme: ${state.theme}. Click to change.`);
  };
  applyTheme();
  $('theme-toggle').addEventListener('click', () => {
    state.theme = modes[(modes.indexOf(state.theme) + 1) % 3];
    applyTheme();
    save();
    redrawAll();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);
}

// ---------------------------------------------------------------- ledger helper
function ledger(el, rows) {
  el.innerHTML = rows
    .filter(Boolean)
    .map(([dt, dd, cls = '']) => `<div><dt>${dt}</dt><dd class="${cls}">${dd}</dd></div>`)
    .join('');
}

// ---------------------------------------------------------------- Plate I: the nomogram
const NOMO = { W: [100, 1e7], L: [10, 1e5], F: [1e-5, 10] };
const nomo = { el: $('nomo'), g: null, disp: { w: state.w0, l: state.loss }, anim: null, drag: null };

function nomoGeom() {
  const w = nomo.el.clientWidth;
  const h = nomo.el.clientHeight;
  const narrow = w < 520;
  const top = 132;
  const bottom = h - 26;
  const H = bottom - top;
  const k = H / 5; // px per decade on the outer scales
  const xW = narrow ? 58 : 84;
  const xL = w - (narrow ? 58 : 84);
  const xF = (xW + xL) / 2;
  const up = (yUp) => bottom - yUp;
  return {
    w, h, top, bottom, H, k, xW, xL, xF, narrow,
    yW: (W) => up(H - k * (Math.log10(W) - 2)),
    yL: (L) => up(k * (Math.log10(L) - 1) + k / 2),
    yF: (f) => up((H + 1.5 * k + k * Math.log10(f)) / 2),
    W: (y) => 10 ** (2 + (H - (bottom - y)) / k),
    L: (y) => 10 ** ((bottom - y - k / 2) / k + 1),
  };
}

function tickSet(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (let m = 1; m <= 9; m++) {
      const v = m * 10 ** e;
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push({ v, major: m === 1, label: m === 1 || m === 2 || m === 5 });
    }
  }
  return out;
}
const fmtFrac = (f) => {
  const v = f * 100;
  if (v >= 10) return `${+v.toFixed(0)}%`;
  if (v >= 1) return `${+v.toFixed(1)}%`;
  return `${+v.toPrecision(2)}%`;
};

function buildNomo() {
  const G = nomoGeom();
  nomo.g = G;
  if (!G.w) return;
  const P = odds();
  const k = kelly(P).fraction;
  const f0 = zeroGrowthFraction(P);
  const beG = state.gamma > 0 ? breakEvenWealth(P, state.gamma) : Infinity;
  const fG = isFinite(beG) && state.gamma > 0 ? state.loss / beG : null;
  const parts = [];
  const lab = (x, y, text, cls, anchor = 'start') =>
    `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" dominant-baseline="middle">${text}</text>`;

  // the straightedge sits under every label, so labels stay legible where it crosses them
  parts.push(`<line id="iso-halo" class="iso-halo"/><line id="iso" class="iso"/>`);

  // zones on the middle scale
  const keyItems = [];
  const zx = G.xF - 16;
  const zone = (a, b, fill, label) => {
    const y1 = G.yF(Math.min(b, NOMO.F[1]));
    const y0 = G.yF(Math.max(a, NOMO.F[0]));
    if (y0 - y1 <= 0) return;
    parts.push(`<rect x="${zx}" y="${y1}" width="10" height="${y0 - y1}" fill="${fill}"/>`);
    if (label) keyItems.push({ swatch: fill, text: label });
    if (label && !G.narrow && y0 - y1 > 18) parts.push(lab(zx - 8, (y0 + y1) / 2, label, 'zone-lab', 'end'));
  };
  if (k > 0) {
    zone(NOMO.F[0], k, 'var(--zone)', 'under-betting');
    zone(k, f0, 'color-mix(in srgb, var(--plate) 35%, transparent)', 'over-betting');
    zone(f0, 1, 'color-mix(in srgb, var(--critical) 45%, transparent)', 'typical outcome shrinks');
  } else {
    zone(NOMO.F[0], 1, 'color-mix(in srgb, var(--critical) 45%, transparent)', 'no edge: every stake shrinks');
  }
  zone(1, NOMO.F[1], 'url(#hatch)', "can't cover a loss");

  // scales
  const scale = (x, lo, hi, yOf, side, fmt) => {
    parts.push(`<line class="scale-line" x1="${x}" x2="${x}" y1="${yOf(hi)}" y2="${yOf(lo)}"/>`);
    for (const t of tickSet(lo, hi)) {
      const y = yOf(t.v);
      const len = t.major ? 10 : 5;
      const x2 = side === 'left' ? x - len : x + len;
      parts.push(`<line class="tick${t.major ? '' : ' minor'}" x1="${x}" x2="${x2}" y1="${y}" y2="${y}"/>`);
      if (t.label) {
        const tx = side === 'left' ? x - 14 : x + 14;
        parts.push(lab(tx, y, fmt(t.v), `lab${t.major ? ' major' : ''}`, side === 'left' ? 'end' : 'start'));
      }
    }
  };
  scale(G.xW, NOMO.W[0], NOMO.W[1], G.yW, 'left', (v) => money(v));
  scale(G.xL, NOMO.L[0], NOMO.L[1], G.yL, 'right', (v) => money(v));
  // the middle scale: only majors labelled, 1e-5 .. 1, plus a stub above 1
  parts.push(`<line class="scale-line" x1="${G.xF}" x2="${G.xF}" y1="${G.yF(NOMO.F[1])}" y2="${G.yF(NOMO.F[0])}"/>`);
  for (const t of tickSet(NOMO.F[0], NOMO.F[1])) {
    const y = G.yF(t.v);
    parts.push(`<line class="tick${t.major ? '' : ' minor'}" x1="${G.xF}" x2="${G.xF + (t.major ? 10 : 5)}" y1="${y}" y2="${y}"/>`);
    if (t.major && t.v <= 1) parts.push(lab(G.xF + 14, y, fmtFrac(t.v), 'lab major'));
  }

  // marks: Kelly, zero growth, break-even at your γ
  const marks = [];
  if (k > 0) marks.push({ f: k, text: `Kelly ${pct(k, 2)}` });
  if (k > 0) marks.push({ f: f0, text: `growth stops ${pct(f0, 2)}` });
  if (fG && Math.abs(state.gamma - 1) > 1e-9) marks.push({ f: fG, text: `break-even at γ ${gammaLabel(state.gamma)}: ${pct(fG, 2)}` });
  marks.sort((a, b) => G.yF(a.f) - G.yF(b.f));
  let lastY = -Infinity;
  for (const m of marks) {
    const y = G.yF(m.f);
    parts.push(`<line x1="${G.xF - 18}" x2="${G.xF + 8}" y1="${y}" y2="${y}" stroke="var(--ink)" stroke-width="2.5"/>`);
    keyItems.push({ swatch: 'var(--ink)', text: m.text });
    if (G.narrow) continue;
    const ly = Math.max(y, lastY + 16);
    lastY = ly;
    // leader from the tick to its label, so the label reads as belonging to the middle scale
    parts.push(`<polyline class="leader" fill="none" points="${G.xF + 8},${y} ${G.xF + 56},${ly} ${G.xF + 62},${ly}"/>`);
    // a ground-coloured knockout so the straightedge never runs through the label
    parts.push(`<rect class="knock" x="${G.xF + 62}" y="${ly - 9}" width="0" height="18" rx="2" fill="var(--ground)"/>`);
    parts.push(lab(G.xF + 66, ly, m.text, 'mark-lab'));
  }
  $('nomo-key').innerHTML = keyItems
    .map((k) => `<li><i style="background:${k.swatch === 'url(#hatch)' ? 'repeating-linear-gradient(45deg, var(--critical) 0 2px, transparent 2px 5px)' : k.swatch}"></i>${k.text}</li>`)
    .join('');

  // headers and readout
  const hy = 18;
  parts.push(lab(G.xW, hy, 'WEALTH', 'head', 'middle'));
  parts.push(lab(G.xF, hy, 'FRACTION AT RISK', 'head', 'middle'));
  parts.push(lab(G.xL, hy, 'STAKE', 'head', 'middle'));
  parts.push(`<text id="nomo-readout" x="${G.xF}" y="74" class="readout" text-anchor="middle" dominant-baseline="middle"></text>`);
  parts.push(`<text id="nomo-readout-lab" x="${G.xF}" y="108" class="readout-lab" text-anchor="middle" dominant-baseline="middle"></text>`);

  // the straightedge and handles
  parts.push(`<circle id="iso-cross" class="cross" r="6"/>`);
  parts.push(`<text id="w-off" class="offscale" text-anchor="middle"></text><text id="l-off" class="offscale" text-anchor="middle"></text>`);
  parts.push(
    `<circle id="h-w" class="handle" r="10" tabindex="0" role="slider" aria-label="Starting wealth" aria-valuemin="${NOMO.W[0]}" aria-valuemax="${NOMO.W[1]}"/>`,
  );
  parts.push(
    `<circle id="h-l" class="handle" r="10" tabindex="0" role="slider" aria-label="Stake (the loss on tails); the win scales with it" aria-valuemin="${NOMO.L[0]}" aria-valuemax="${NOMO.L[1]}"/>`,
  );

  nomo.el.innerHTML = `<svg viewBox="0 0 ${G.w} ${G.h}" role="group" aria-label="Alignment chart: wealth, fraction at risk, stake">
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--critical)" stroke-width="2"/></pattern></defs>
    ${parts.join('')}</svg>`;
  // fit each knockout to its label's measured text box, so it never covers the stake scale
  const knocks = nomo.el.querySelectorAll('.knock');
  nomo.el.querySelectorAll('.mark-lab').forEach((t, i) => {
    const bb = t.getBBox();
    if (knocks[i]) {
      knocks[i].setAttribute('x', bb.x - 3);
      knocks[i].setAttribute('width', bb.width + 6);
    }
  });
  bindNomoHandles();
  updateNomo(true);
}

function updateNomo(fromBuild = false) {
  const G = nomo.g;
  if (!G || !G.w || !nomo.el.querySelector('#iso')) return;
  if (!fromBuild && !nomo.anim && !nomo.drag) nomo.disp = { w: state.w0, l: state.loss };
  const clampW = Math.min(NOMO.W[1], Math.max(NOMO.W[0], nomo.disp.w));
  const clampL = Math.min(NOMO.L[1], Math.max(NOMO.L[0], nomo.disp.l));
  const yw = G.yW(clampW);
  const yl = G.yL(clampL);
  const yc = (yw + yl) / 2;
  const set = (id, attrs) => {
    const el = nomo.el.querySelector(id);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  };
  for (const id of ['#iso', '#iso-halo']) set(id, { x1: G.xW, y1: yw, x2: G.xL, y2: yl });
  set('#iso-cross', { cx: G.xF, cy: yc });
  set('#h-w', { cx: G.xW, cy: yw, 'aria-valuenow': Math.round(state.w0), 'aria-valuetext': money(state.w0, { compact: false }) });
  set('#h-l', { cx: G.xL, cy: yl, 'aria-valuenow': Math.round(state.loss), 'aria-valuetext': money(state.loss, { compact: false }) });
  const wOff = nomo.el.querySelector('#w-off');
  wOff.textContent = state.w0 > NOMO.W[1] || state.w0 < NOMO.W[0] ? 'off scale' : '';
  wOff.setAttribute('x', G.xW);
  wOff.setAttribute('y', yw + (state.w0 > NOMO.W[1] ? 26 : -18));
  const lOff = nomo.el.querySelector('#l-off');
  lOff.textContent = state.loss > NOMO.L[1] || state.loss < NOMO.L[0] ? 'off scale' : '';
  lOff.setAttribute('x', G.xL);
  lOff.setAttribute('y', yl - 18);
  const f = state.loss / state.w0;
  nomo.el.querySelector('#nomo-readout').textContent = isFinite(f) ? (f >= 10 ? '>1,000%' : fmtFrac(f)) : '—';
  const k = kelly(odds()).fraction;
  let sub;
  if (!(k > 0)) sub = 'no edge, so no stake is worth it';
  else if (f > 1) sub = "more than you have: you can't cover a loss";
  else if (f <= k) sub = `at or under the Kelly fraction (${pct(k, 2)})`;
  else sub = `${(f / k).toFixed(f / k >= 10 ? 0 : 1)}× the Kelly fraction`;
  nomo.el.querySelector('#nomo-readout-lab').textContent = sub;
}

function nomoAnimate() {
  if (!nomo.g || reduceMotion.matches) {
    nomo.disp = { w: state.w0, l: state.loss };
    updateNomo();
    return;
  }
  const from = { ...nomo.disp };
  const to = { w: state.w0, l: state.loss };
  const t0 = performance.now();
  const dur = 380;
  cancelAnimationFrame(nomo.anim);
  const step = (t) => {
    const u = Math.min(1, (t - t0) / dur);
    const e = 1 - 2 ** (-10 * u); // exponential ease-out
    nomo.disp = {
      w: 10 ** (Math.log10(Math.max(from.w, 1)) + (Math.log10(Math.max(to.w, 1)) - Math.log10(Math.max(from.w, 1))) * e),
      l: 10 ** (Math.log10(from.l) + (Math.log10(to.l) - Math.log10(from.l)) * e),
    };
    updateNomo(true);
    nomo.anim = u < 1 ? requestAnimationFrame(step) : null;
    if (!nomo.anim) nomo.disp = to;
  };
  nomo.anim = requestAnimationFrame(step);
}

function setStake(L) {
  const bet = scaleBet(state.anchor, Math.max(1, Math.round(L)));
  state.loss = bet.loss;
  state.win = bet.win;
  $('loss').value = state.loss;
  $('win').value = state.win;
  $('w0-slider').value = wealthToSlider(state.w0);
  renderPresets();
}

function bindNomoHandles() {
  const svg = nomo.el.querySelector('svg');
  const hw = nomo.el.querySelector('#h-w');
  const hl = nomo.el.querySelector('#h-l');
  const toY = (e) => {
    const r = svg.getBoundingClientRect();
    return ((e.clientY - r.top) / r.height) * nomo.g.h;
  };
  const apply = (which, y) => {
    const G = nomo.g;
    const yy = Math.min(G.bottom, Math.max(G.top - 20, y));
    if (which === 'w') {
      const W = Math.min(NOMO.W[1], Math.max(NOMO.W[0], G.W(yy)));
      state.w0 = niceRound(W);
      $('w0').value = state.w0;
      $('w0-slider').value = wealthToSlider(state.w0);
      renderPresets();
    } else {
      setStake(niceRound(Math.min(NOMO.L[1], Math.max(NOMO.L[0], G.L(yy)))));
    }
    nomo.disp = { w: state.w0, l: state.loss };
    onInputsChanged();
  };
  for (const [el, which] of [[hw, 'w'], [hl, 'l']]) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cancelAnimationFrame(nomo.anim);
      nomo.anim = null;
      nomo.drag = which;
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
      el.focus({ preventScroll: true });
    });
    el.addEventListener('pointermove', (e) => {
      if (nomo.drag === which) apply(which, toY(e));
    });
    const end = () => {
      nomo.drag = null;
      el.classList.remove('dragging');
      if (which === 'l') {
        buildNomo(); // the marks don't move, but presets and labels might
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      const steps = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.25, PageDown: -0.25 };
      if (!(e.key in steps)) return;
      e.preventDefault();
      const d = steps[e.key];
      if (which === 'w') {
        // up on the wealth scale means less wealth; keep keys meaning "more" for the value
        const W = Math.min(NOMO.W[1], Math.max(NOMO.W[0], state.w0 * 10 ** d));
        setWealth(niceRound(W));
      } else {
        setStake(niceRound(Math.min(NOMO.L[1], Math.max(NOMO.L[0], state.loss * 10 ** d))));
        nomoAnimate();
        onInputsChanged();
      }
    });
  }
}

function renderPlate1Text() {
  const P = odds();
  const k = kelly(P);
  const f = state.loss / state.w0;
  const f0 = zeroGrowthFraction(P);
  const head =
    state.w0 < state.loss
      ? `At ${money(state.w0)}, you can't even cover one loss.`
      : `At ${money(state.w0)}, the stake is ${fmtFrac(f)} of what you have.`;
  $('p1-head').textContent = head;
  const beG = state.gamma > 0 ? breakEvenWealth(P, state.gamma) : NaN;
  ledger($('p1-ledger'), [
    k.fraction > 0 && ['Kelly stake at your wealth', money(k.fraction * state.w0, { compact: false })],
    k.fraction > 0 && ['Wealth where this stake is Kelly-sized', money(niceRound(k.wealth))],
    k.fraction > 0 && ['Wealth where growth stops (log break-even)', money(niceRound(state.loss / f0))],
    state.gamma > 0 && Math.abs(state.gamma - 1) > 1e-9 && isFinite(beG) && [`Break-even wealth at your γ = ${gammaLabel(state.gamma)}`, money(niceRound(beG))],
  ]);
}

// ---------------------------------------------------------------- Plate II: sample paths
/** Square-root wealth axis: room near zero, where most players are, without hiding the tail. */
function sqrtScale(max, r0, r1) {
  const f = (v) => r0 + (r1 - r0) * Math.sqrt(Math.max(0, v) / max);
  f.invert = (y) => max * ((y - r0) / (r1 - r0)) ** 2;
  f.domain = [0, max];
  f.ticks = () => {
    const out = [0];
    for (let e = 2; e <= 12; e++) for (const m of [1, 2, 5]) if (m * 10 ** e <= max) out.push(m * 10 ** e);
    // keep ticks at least ~28px apart
    const kept = [];
    for (const v of out) if (!kept.length || Math.abs(f(v) - f(kept[kept.length - 1])) >= 28) kept.push(v);
    return kept;
  };
  return f;
}

function renderPaths() {
  const { dist, sample } = state.main;
  const N = state.flips;
  const loss = state.loss;
  const ruinedCount = sample.ruinStep.filter((s) => s >= 0).length;
  $('p2-head').textContent =
    dist.median[N] < dist.mean[N] * 0.8
      ? `The average ends at ${money(dist.mean[N])}; the typical player ends at ${money(dist.median[N])}.`
      : `At this bankroll the average (${money(dist.mean[N])}) and the typical player (${money(dist.median[N])}) roughly agree.`;
  $('legend-paths').innerHTML = legendHTML([
    { label: 'Mean', color: 'var(--s1)' },
    { label: 'Median', color: 'var(--s2)', dash: DASH.dashed },
    { label: 'Middle 80%', color: 'var(--s1)', kind: 'wash' },
    { label: 'Run still playing', color: 'var(--muted)', kind: 'thin' },
    { label: `Run that fell below ${money(loss)} and stopped (${ruinedCount} of ${sample.paths.length})`, color: 'var(--critical)', kind: 'thin' },
  ]);
  let ymax = state.w0;
  for (let n = 0; n <= N; n++) ymax = Math.max(ymax, dist.p90[n], dist.mean[n]);
  const ends = sample.paths.filter((_, i) => sample.ruinStep[i] < 0).map((p) => p[N]).sort((a, b) => a - b);
  // A square-root axis keeps the exact mean and median legible near $0 while the
  // lucky runs that carry the mean still fit; anything beyond is clipped and counted.
  if (ends.length) ymax = Math.max(ymax, Math.min(ends[Math.floor(ends.length * 0.9)], ymax * 30));
  ymax *= 1.1;
  const above = sample.paths.filter((path) => path.some((v) => v > ymax)).length;

  let X;
  let Y;
  charts.paths.set(
    (ctx, f) => {
      const { t } = f;
      X = linearScale(0, N, f.x0, f.x1);
      Y = sqrtScale(ymax, f.y1, f.y0);
      drawAxes(ctx, f, X, Y, { yFormat: (v) => money(v), xFormat: fmtInt, xLabel: 'flip number', yLabel: 'wealth (square-root scale)' });
      ctx.save();
      clipPlot(ctx, f);
      const stride = Math.max(1, Math.floor(N / (f.x1 - f.x0)));
      ctx.beginPath();
      for (let n = 0; n <= N; n += stride) ctx.lineTo(X(n), Y(dist.p90[n]));
      ctx.lineTo(X(N), Y(dist.p90[N]));
      for (let n = N; n >= 0; n -= stride) ctx.lineTo(X(n), Y(dist.p10[n]));
      ctx.lineTo(X(0), Y(dist.p10[0]));
      ctx.closePath();
      ctx.fillStyle = t.s1;
      ctx.globalAlpha = 0.1;
      ctx.fill();
      ctx.globalAlpha = 1;
      const drawPath = (path, end, color, alpha) => {
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(0), Y(path[0]));
        for (let n = stride; n < end; n += stride) ctx.lineTo(X(n), Y(path[n]));
        ctx.lineTo(X(end), Y(path[end]));
        ctx.stroke();
      };
      const alphaAlive = Math.min(0.35, 12 / sample.paths.length + 0.08);
      sample.paths.forEach((path, i) => {
        if (sample.ruinStep[i] < 0) drawPath(path, N, t.muted, alphaAlive);
      });
      sample.paths.forEach((path, i) => {
        const r = sample.ruinStep[i];
        if (r >= 0) drawPath(path, r, t.critical, 0.45);
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = t.critical;
      sample.paths.forEach((path, i) => {
        const r = sample.ruinStep[i];
        if (r >= 0) {
          ctx.beginPath();
          ctx.arc(X(r), Y(path[r]), 2.25, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      const xs = Array.from({ length: N + 1 }, (_, i) => i);
      line(ctx, xs, dist.mean, X, Y, t.surface, 5);
      line(ctx, xs, dist.mean, X, Y, t.s1, 2.5);
      line(ctx, xs, dist.median, X, Y, t.surface, 5);
      line(ctx, xs, dist.median, X, Y, t.s2, 2.5, 1, DASH.dashed);
      ctx.restore();
      hline(ctx, f, Y(loss), t.axis, null);
      const ym = Y(dist.mean[N]);
      const yd = Y(dist.median[N]);
      ctx.fillStyle = t.ink;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const gap = Math.abs(ym - yd) >= 16 ? 0 : 8;
      const clampY = (y) => Math.min(f.y1 - 14, Math.max(f.y0 + 6, y));
      ctx.fillText(`mean ${money(dist.mean[N])}`, f.x1 + 8, clampY(ym <= yd ? ym - gap : ym + gap));
      ctx.fillText(`median ${money(dist.median[N])}`, f.x1 + 8, clampY(yd < ym ? yd - gap : yd + gap));
      if (above > 0) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = t.ink2;
        ctx.fillText(`↑ ${above} lucky run${above === 1 ? '' : 's'} climb past the top`, f.x1 - 4, f.y0 + 4);
      }
    },
    (ctx, f, mx) => {
      if (!X || mx < f.x0 || mx > f.x1) return null;
      const n = Math.max(0, Math.min(N, Math.round(X.invert(mx))));
      crosshair(ctx, f, X(n), f.t.iso);
      dot(ctx, X(n), Y(dist.mean[n]), f.t.s1, f.t.surface);
      dot(ctx, X(n), Y(dist.median[n]), f.t.s2, f.t.surface);
      const sampleRuined = sample.ruinStep.filter((s) => s >= 0 && s <= n).length;
      return (
        tipHead(`After ${fmtInt(n)} flips`) +
        tipRow('Mean', money(dist.mean[n], { compact: false }), f.t.s1) +
        tipRow('Median', money(dist.median[n], { compact: false }), f.t.s2) +
        tipRow('Middle 80%', `${money(dist.p10[n])} – ${money(dist.p90[n])}`) +
        tipRow('Broke so far (exact)', pct(dist.ruin[n])) +
        tipRow('Sample runs broke', `${sampleRuined} / ${sample.paths.length}`)
      );
    },
  );
}

// ---------------------------------------------------------------- Plate III: final distribution
function renderHist() {
  const { dist } = state.main;
  const N = state.flips;
  $('p3-head').textContent =
    dist.ruin[N] >= 0.005
      ? `After ${fmtInt(N)} flips, ${pct(dist.ruin[N])} of players are broke.`
      : `After ${fmtInt(N)} flips almost nobody is broke; the spread is all upside and downside.`;
  $('p3-text2').innerHTML =
    dist.mean[N] > dist.median[N] * 1.05
      ? 'That tail is where the average lives. A distribution like this is called <dfn>positively skewed</dfn>, and for it, mean &gt; median is the rule, not an accident.'
      : `Here the block of broke players drags the mean (${money(dist.mean[N])}) slightly <em>below</em> the median (${money(dist.median[N])}): the losses from ruin outweigh the lucky tail. Ruin, not luck, is what moves the average now.`;
  $('legend-hist').innerHTML = legendHTML([
    { label: 'Still playing (magnified, own scale)', color: 'var(--s1)', kind: 'swatch' },
    { label: 'Went broke along the way', color: 'var(--critical)', kind: 'swatch' },
  ]);
  const alive = dist.final.filter((d) => !d.ruined);
  const broke = dist.final.filter((d) => d.ruined).reduce((s, d) => s + d.prob, 0);
  const lattice = state.win + state.loss;
  let bins = [];
  if (alive.length) {
    const total = alive.reduce((s, d) => s + d.prob, 0);
    let cum = 0;
    let qlo = alive[0].value;
    let qhi = alive[alive.length - 1].value;
    let gotLo = false;
    for (const d of alive) {
      cum += d.prob / total;
      if (!gotLo && cum >= 0.001) {
        qlo = d.value;
        gotLo = true;
      }
      if (cum >= 0.999) {
        qhi = d.value;
        break;
      }
    }
    const k = Math.max(1, Math.ceil((qhi - qlo) / lattice / 40));
    const bw = k * lattice;
    const lo = qlo - bw / 2;
    const count = Math.max(1, Math.floor((qhi - lo) / bw) + 1);
    bins = Array.from({ length: count }, (_, i) => ({ a: lo + i * bw, b: lo + (i + 1) * bw, prob: 0 }));
    for (const d of alive) {
      const i = Math.max(0, Math.min(count - 1, Math.floor((d.value - lo) / bw)));
      bins[i].prob += d.prob;
    }
  }
  const aliveMax = Math.max(...bins.map((b) => b.prob), 1e-9);
  let hit = [];
  charts.hist.set(
    (ctx, f) => {
      const { t } = f;
      hit = [];
      // Two panels, each with its own axis: everyone who went broke, then the survivors magnified.
      const leftW = 64;
      const L = { ...f, x1: f.x0 + leftW };
      const R = { ...f, x0: f.x0 + leftW + 72 };
      const YL = linearScale(0, 1, f.y1, f.y0);
      const YR = linearScale(0, aliveMax * 1.5, f.y1, f.y0);
      drawAxes(ctx, L, linearScale(0, 1, -1e9, -1e9), YL, { yFormat: (v) => `${Math.round(v * 100)}%`, xTicks: [] });
      const bwBroke = 28;
      const bxBroke = L.x0 + (leftW - bwBroke) / 2;
      bar(ctx, bxBroke, YL(broke), bwBroke, f.y1, t.critical);
      hit.push({ x0: bxBroke - 6, x1: bxBroke + bwBroke + 6, html: tipHead('Went broke along the way') + tipRow('Share of players', pct(broke, 2)) });
      ctx.fillStyle = t.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      if (broke > 0) ctx.fillText(pct(broke), bxBroke + bwBroke / 2, YL(broke) - 4);
      ctx.textBaseline = 'top';
      ctx.fillStyle = t.muted;
      ctx.fillText('broke', bxBroke + bwBroke / 2, f.y1 + 8);
      // panel divider
      ctx.strokeStyle = t.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(f.x0 + leftW + 18) + 0.5, f.y0 - 10);
      ctx.lineTo(Math.round(f.x0 + leftW + 18) + 0.5, f.y1 + 30);
      ctx.stroke();
      if (!bins.length) return;
      const X = linearScale(bins[0].a, bins[bins.length - 1].b, R.x0, R.x1);
      drawAxes(ctx, R, X, YR, { yFormat: (v) => pct(v, v < 0.001 ? 2 : 1), xFormat: (v) => money(v) });
      const slot = (R.x1 - R.x0) / bins.length;
      const barW = Math.max(1, Math.min(24, slot - 2));
      for (const b of bins) {
        const cx = X((b.a + b.b) / 2);
        bar(ctx, cx - barW / 2, YR(b.prob), barW, f.y1, t.s1);
        hit.push({
          x0: cx - slot / 2,
          x1: cx + slot / 2,
          html: tipHead(`${money(b.a, { compact: false })} – ${money(b.b, { compact: false })}`) + tipRow('Share of players', pct(b.prob, 2)),
        });
      }
      ctx.fillStyle = t.ink;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`survivors (${pct(1 - broke)} of players), own scale`, R.x1, R.y0 - 14);
      if (state.w0 >= bins[0].a && state.w0 <= bins[bins.length - 1].b) vline(ctx, R, X(state.w0), t.iso, `you started at ${money(state.w0)}`, { dy: 14 });
      const mean = dist.mean[N];
      if (mean >= bins[0].a && mean <= bins[bins.length - 1].b) vline(ctx, R, X(mean), t.s1, `mean of everyone ${money(mean)}`, { dy: 34 });
      if (dist.median[N] >= state.loss && dist.median[N] >= bins[0].a) vline(ctx, R, X(dist.median[N]), t.ink2, `median ${money(dist.median[N])}`, { dy: 54 });
    },
    (ctx, f, mx) => {
      const h = hit.find((h) => mx >= h.x0 && mx <= h.x1);
      if (!h) return null;
      ctx.fillStyle = f.t.ink;
      ctx.globalAlpha = 0.06;
      ctx.fillRect(h.x0, f.y0, h.x1 - h.x0, f.y1 - f.y0);
      ctx.globalAlpha = 1;
      return h.html;
    },
  );
}

// ---------------------------------------------------------------- Plate IV: ruin over time
function renderRuin() {
  const { dist } = state.main;
  const N = state.flips;
  $('p4-head').textContent =
    dist.forever.estimate >= 0.005
      ? `Keep flipping forever and you go broke ${pct(dist.forever.estimate)} of the time.`
      : 'At this bankroll, going broke is a remote possibility even if you never stop.';
  $('legend-ruin').innerHTML = legendHTML([
    { label: 'Broke by this flip', color: 'var(--critical)' },
    { label: 'Ahead of where you started', color: 'var(--s2)', dash: DASH.dashed },
    { label: 'Broke eventually (never stop)', color: 'var(--muted)', kind: 'thin', dash: DASH.dotted },
  ]);
  let X;
  let Y;
  const xs = Array.from({ length: N + 1 }, (_, i) => i);
  charts.ruin.set(
    (ctx, f) => {
      const { t } = f;
      X = linearScale(0, N, f.x0, f.x1);
      Y = linearScale(0, 1, f.y1, f.y0);
      drawAxes(ctx, f, X, Y, { yFormat: (v) => `${Math.round(v * 100)}%`, xFormat: fmtInt, xLabel: 'flip number' });
      ctx.save();
      ctx.setLineDash(DASH.dotted);
      ctx.lineCap = 'round';
      ctx.strokeStyle = t.muted;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(f.x0, Y(dist.forever.estimate));
      ctx.lineTo(f.x1, Y(dist.forever.estimate));
      ctx.stroke();
      ctx.restore();
      ctx.save();
      clipPlot(ctx, f);
      line(ctx, xs, dist.ahead, X, Y, t.s2, 2, 1, DASH.dashed);
      line(ctx, xs, dist.ruin, X, Y, t.critical, 2.5);
      ctx.restore();
      ctx.fillStyle = t.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const labels = [
        { y: Y(dist.ruin[N]), text: `broke ${pct(dist.ruin[N])}` },
        { y: Y(dist.ahead[N]), text: `ahead ${pct(dist.ahead[N])}` },
        { y: Y(dist.forever.estimate), text: `forever ${pct(dist.forever.estimate)}` },
      ].sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 15);
      labels.forEach((l) => ctx.fillText(l.text, f.x1 + 8, l.y));
    },
    (ctx, f, mx) => {
      if (!X || mx < f.x0 || mx > f.x1) return null;
      const n = Math.max(0, Math.min(N, Math.round(X.invert(mx))));
      crosshair(ctx, f, X(n), f.t.iso);
      dot(ctx, X(n), Y(dist.ruin[n]), f.t.critical, f.t.surface);
      dot(ctx, X(n), Y(dist.ahead[n]), f.t.s2, f.t.surface);
      return (
        tipHead(`After ${fmtInt(n)} flips`) +
        tipRow('Broke', pct(dist.ruin[n], 2), f.t.critical) +
        tipRow('Ahead', pct(dist.ahead[n], 2), f.t.s2) +
        tipRow('Playing, not ahead', pct(Math.max(0, 1 - dist.ruin[n] - dist.ahead[n]), 2))
      );
    },
  );
}

// ---------------------------------------------------------------- table of ruin
function renderTable() {
  if (!state.grid) return;
  const rows = state.grid.table;
  const N = state.flips;
  const P = odds();
  const be1 = breakEvenWealth(P, 1);
  const kw = kelly(P).wealth;
  const cols = [...new Set([...TABLE_COLS, N])].sort((a, b) => a - b);
  const maxN = rows[0].curve.length - 1;
  const cell = (v, colN = false) => {
    const cls = [colN && 'col-n', v === 0 && 'z'].filter(Boolean).join(' ');
    const text = v === 0 ? '0' : pct(v, v >= 0.995 && v < 1 ? 1 : v < 0.01 ? 2 : 0);
    return `<td${cls ? ` class="${cls}"` : ''}>${text}</td>`;
  };
  const notes = (w) => {
    const out = [];
    if (w === state.w0) out.push('you');
    if (isFinite(be1) && w === niceRound(be1)) out.push('log break-even');
    if (isFinite(kw) && w === niceRound(kw)) out.push('Kelly-sized');
    return out.length ? `<span class="note">${out.join(' · ')}</span>` : '';
  };
  const head = `<tr><th scope="col">Start</th>${cols
    .map((c) => `<th scope="col" class="${c === N ? 'col-n' : ''}">${fmtInt(c)}${c === N ? '<span class="note">your flips</span>' : ''}</th>`)
    .join('')}<th scope="col">Forever</th></tr>`;
  const body = rows
    .map(
      (r) =>
        `<tr class="${r.w0 === state.w0 ? 'you' : ''}"><th scope="row">${money(r.w0, { compact: false })}${notes(r.w0)}</th>${cols.map((c) => cell(r.curve[Math.min(c, maxN)], c === N)).join('')}${cell(r.forever.estimate)}</tr>`,
    )
    .join('');
  $('table').innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ---------------------------------------------------------------- Plate V: heatmap
function renderHeat() {
  const N = state.flips;
  $('legend-heat').innerHTML =
    `<span class="key">0%<span class="ramp" id="ramp-key"></span>100% chance of going broke</span>` +
    legendHTML([{ label: 'Your starting wealth', color: 'var(--iso)' }]);
  const seq = getComputedStyle(document.documentElement).getPropertyValue('--seq');
  $('ramp-key').style.background = `linear-gradient(90deg, ${seq})`;
  $('ramp-key').style.outline = '1px solid var(--rule)';
  if (!state.grid) return;
  const rows = state.grid.grid;
  const R = adjustmentCoefficient(odds());
  const safeN = rows.find((r) => r.curve[N] <= 0.1);
  const safeF = rows.find((r) => r.forever.estimate <= 0.1);
  $('p5-head').textContent = safeN
    ? `Keeping ruin under 10% over ${fmtInt(N)} flips takes about ${money(niceRound(safeN.w0))}.`
    : `Even ${money(rows[rows.length - 1].w0)} doesn't keep ruin under 10% over ${fmtInt(N)} flips.`;
  $('p5-text').innerHTML =
    R > 0
      ? `Survival needs a cushion of many losses, not one. If you never stop, ruin falls roughly exponentially with wealth: each extra <b>${money(niceRound(1 / R))}</b> of bankroll cuts it by a factor of <i>e</i> (about 2.7)${
          safeF ? `, and it drops under 10% from about <b>${money(niceRound(safeF.w0))}</b>` : ''
        }.`
      : 'This bet has no edge, so if you never stop you eventually go broke from any starting wealth.';
  const ratio = rows[1].w0 / rows[0].w0;
  const half = Math.sqrt(ratio);
  let X;
  let Y;
  charts.heat.set(
    (ctx, f) => {
      const { t } = f;
      X = linearScale(0, N, f.x0, f.x1);
      Y = logScale(rows[0].w0 / half, rows[rows.length - 1].w0 * half, f.y1, f.y0);
      const cols = Math.min(N + 1, Math.floor((f.x1 - f.x0) / 2));
      const cw = (f.x1 - f.x0) / cols;
      for (const r of rows) {
        const yTop = Y(r.w0 * half);
        const yBot = Y(r.w0 / half);
        for (let c = 0; c < cols; c++) {
          const n = Math.round(((c + 0.5) / cols) * N);
          ctx.fillStyle = rampColor(t.seq, r.curve[n]);
          ctx.fillRect(f.x0 + c * cw, yTop, cw + 0.6, yBot - yTop + 0.6);
        }
      }
      for (const level of [0.01, 0.1, 0.5, 0.9]) {
        const pts = [];
        for (const r of rows) {
          let n = -1;
          for (let k = 0; k <= N; k++)
            if (r.curve[k] >= level) {
              n = k;
              break;
            }
          if (n < 0) break;
          pts.push([X(n), Y(r.w0)]);
        }
        if (pts.length < 2) continue;
        for (const [color, width] of [[t.surface, 3.5], [t.ink, 1.25]]) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        }
        const [lx, ly] = pts[pts.length - 1];
        const label = `${Math.round(level * 100)}%`;
        const w = ctx.measureText(label).width;
        const tx = Math.min(f.x1 - w - 6, lx + 6);
        ctx.fillStyle = t.surface;
        ctx.fillRect(tx - 3, ly - 16, w + 6, 15);
        ctx.fillStyle = t.ink;
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        ctx.fillText(label, tx, ly - 2);
      }
      if (state.w0 >= Y.domain[0] && state.w0 <= Y.domain[1]) {
        const py = Math.round(Y(state.w0)) + 0.5;
        ctx.strokeStyle = t.surface;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(f.x0, py);
        ctx.lineTo(f.x1, py);
        ctx.stroke();
        ctx.strokeStyle = t.iso;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f.x0, py);
        ctx.lineTo(f.x1, py);
        ctx.stroke();
      }
      drawAxes(ctx, f, X, Y, { yFormat: (v) => money(v), xFormat: fmtInt, xLabel: 'flips played', yTicks: Y.ticks() });
    },
    (ctx, f, mx, my) => {
      if (!X || mx < f.x0 || mx > f.x1 || my < f.y0 || my > f.y1) return null;
      const n = Math.max(0, Math.min(N, Math.round(X.invert(mx))));
      const w = Y.invert(my);
      let best = rows[0];
      for (const r of rows) if (Math.abs(Math.log(r.w0 / w)) < Math.abs(Math.log(best.w0 / w))) best = r;
      ctx.strokeStyle = f.t.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx - 5, Y(best.w0) - 5, 10, 10);
      return (
        tipHead(`Start with ${money(best.w0)}`) +
        tipRow(`Broke within ${fmtInt(n)} flips`, pct(best.curve[n], 2)) +
        tipRow('Broke if you never stop', pct(best.forever.estimate, 1))
      );
    },
    (mx, my) => Y && dragWealth(Y.invert(Math.min(charts.heat.frame().y1, Math.max(charts.heat.frame().y0, my)))),
    'y',
  );
}

// ---------------------------------------------------------------- Plate VI: utility
function utilSeries() {
  const out = [
    { gamma: 0, label: 'γ = 0, risk-neutral', color: 's1', css: '--s1', dash: DASH.solid },
    { gamma: 1, label: 'γ = 1, log utility', color: 's2', css: '--s2', dash: DASH.dashed },
  ];
  if (state.gamma !== 0 && state.gamma !== 1)
    out.push({ gamma: state.gamma, label: `γ = ${gammaLabel(state.gamma)}, yours`, color: 's3', css: '--s3', dash: DASH.dotted });
  return out;
}

function renderUtil() {
  const w0 = state.w0;
  const { win, loss, p } = state;
  const g = state.gamma;
  const E = ev();
  const ce = certaintyEquivalent(w0, odds(), g);
  const series = utilSeries();
  const mine = series.find((s) => s.gamma === g);
  $('legend-util').innerHTML =
    legendHTML(series.map((s) => ({ label: s.label, color: `var(${s.css})`, dash: s.dash.length ? s.dash : null }))) +
    legendHTML([{ label: 'Chord between the two outcomes', color: 'var(--ink)', kind: 'thin' }]);

  const uA = utilityAt(w0 - loss, g, w0);
  const uB = utilityAt(w0 + win, g, w0);
  // u(w0) = 0, so the win helps by uB and the loss hurts by −uA. The curve makes every lost
  // dollar hurt more than a won dollar helps, but a bigger win can still outweigh the loss in total.
  $('p6-head').textContent =
    g === 0
      ? 'At γ = 0 a dollar is a dollar: no curve, so no risk aversion.'
      : -uA > uB
        ? `At γ = ${gammaLabel(g)}, losing ${money(loss)} hurts more than winning ${money(win)} helps.`
        : `At γ = ${gammaLabel(g)}, winning ${money(win)} helps more than losing ${money(loss)} hurts.`;
  const sigma2 = p * (1 - p) * (win + loss) ** 2;
  const prem = E - ce;
  ledger($('p6-ledger'), [
    ['Relative risk aversion', `γ = ${gammaLabel(g)}`],
    ['Absolute risk aversion γ/W', g === 0 ? '0' : `1 per ${money(w0 / g, { compact: w0 / g >= 1e5 })}`],
    w0 >= loss && ['Risk premium (average − CE)', isFinite(prem) ? money(prem, { compact: false }) : '—', 'lead'],
    g > 0 && w0 >= loss && ['Arrow–Pratt estimate ½·(γ/W)·σ²', money((0.5 * g * sigma2) / w0, { compact: false })],
  ]);

  const xmin = Math.max(0, w0 - 1.5 * loss);
  const xmax = w0 + 1.5 * win;
  const xs = Array.from({ length: 241 }, (_, i) => xmin + ((xmax - xmin) * i) / 240);
  for (const s of series) s.vals = xs.map((x) => utilityAt(x, s.gamma, w0));
  const eu = p * uB + (1 - p) * uA;
  const floor = -2.2 * (loss + win);
  let ymin = Math.min(...series.flatMap((s) => s.vals.filter(isFinite)));
  ymin = Math.max(floor, ymin) * 1.05;
  const ymax = Math.max(...series.flatMap((s) => s.vals.filter(isFinite))) * 1.12;
  let X;
  let Y;
  charts.util.set(
    (ctx, f) => {
      const { t } = f;
      X = linearScale(xmin, xmax, f.x0, f.x1);
      Y = linearScale(ymin, ymax, f.y1, f.y0);
      drawAxes(ctx, f, X, Y, {
        yFormat: (v) => money(v, { sign: true }),
        xFormat: (v) => money(v),
        xLabel: 'wealth after the flip',
      });
      vline(ctx, f, X(w0), t.iso, `you now ${money(w0)}`);
      ctx.save();
      clipPlot(ctx, f);
      for (const s of series) line(ctx, xs, s.vals.map((v) => Math.max(v, ymin * 1.5)), X, Y, t[s.color], 2.5, 1, s.dash);
      if (w0 >= loss && mine) {
        const ax = X(w0 - loss);
        const bx = X(w0 + win);
        const ay = Y(Math.max(uA, ymin * 1.5));
        const by = Y(uB);
        ctx.strokeStyle = t.ink;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        dot(ctx, ax, ay, t.ink, t.surface, 4);
        dot(ctx, bx, by, t.ink, t.surface, 4);
        if (isFinite(eu) && eu >= ymin) {
          const ex = X(w0 + E);
          const ey = Y(eu);
          const cx = X(w0 + ce);
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = t.ink2;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(cx, ey);
          ctx.moveTo(cx, ey);
          ctx.lineTo(cx, f.y1);
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex, f.y1);
          ctx.stroke();
          ctx.setLineDash([]);
          dot(ctx, ex, ey, t.ink, t.surface, 4.5);
          dot(ctx, cx, ey, t[mine.color], t.surface, 5);
          // risk premium bracket on the baseline
          const by0 = f.y1 - 10;
          ctx.strokeStyle = t.ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx, by0 - 4);
          ctx.lineTo(cx, by0);
          ctx.lineTo(ex, by0);
          ctx.lineTo(ex, by0 - 4);
          ctx.stroke();
          ctx.fillStyle = t.ink;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          if (Math.abs(ex - cx) > 70) ctx.fillText(`risk premium ${money(E - ce)}`, (ex + cx) / 2, by0 - 6);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`CE ${money(ce, { sign: true, compact: false })}`, cx + 8, ey - 6);
        }
      }
      ctx.restore();
      if (w0 >= loss && !isFinite(uA)) {
        ctx.fillStyle = t.critical;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('↓ −∞: at γ ≥ 1, losing everything is infinitely bad', X(w0 - loss) + 8, f.y1 - 24);
      }
    },
    (ctx, f, mx) => {
      if (!X || mx < f.x0 || mx > f.x1) return null;
      const W = X.invert(mx);
      crosshair(ctx, f, mx);
      let html = tipHead(`Wealth ${money(W, { compact: false })}`);
      for (const s of series) {
        const u = utilityAt(W, s.gamma, w0);
        if (isFinite(u) && u >= ymin && u <= ymax) dot(ctx, mx, Y(u), f.t[s.color], f.t.surface);
        html += tipRow(`Utility, γ = ${gammaLabel(s.gamma)}`, isFinite(u) ? money(u, { sign: true, compact: false }) : '−∞', f.t[s.color]);
      }
      return html;
    },
  );
}

// ---------------------------------------------------------------- Plate VII: certainty equivalent by wealth
function renderCE() {
  const P = odds();
  const E = ev();
  const ce = certaintyEquivalent(state.w0, P, state.gamma);
  $('p7-head').textContent =
    state.w0 < state.loss
      ? "You can't cover a loss, so the flip isn't on offer."
      : `At ${money(state.w0)} and γ = ${gammaLabel(state.gamma)}, one flip is worth ${money(ce, { sign: true, compact: false })} to you.`;
  const ws = logspace(state.loss, state.loss * 1000, 320);
  const series = utilSeries().map((s) => ({ ...s, vals: ws.map((w) => certaintyEquivalent(w, P, s.gamma)) }));
  $('legend-ce').innerHTML = legendHTML(series.map((s) => ({ label: s.label, color: `var(${s.css})`, dash: s.dash.length ? s.dash : null })));
  const be = breakEvenWealth(P, state.gamma > 0 ? state.gamma : 1);
  const k = kelly(P);
  const A = Math.max(Math.abs(E), 1);
  const ymin = -3 * A;
  const ymax = 1.6 * A;
  let X;
  let Y;
  charts.ce.set(
    (ctx, f) => {
      const { t } = f;
      X = logScale(ws[0], ws[ws.length - 1], f.x0, f.x1);
      Y = linearScale(ymin, ymax, f.y1, f.y0);
      ctx.fillStyle = hatch(ctx, t.critical);
      ctx.fillRect(f.x0, Y(0), f.x1 - f.x0, f.y1 - Y(0));
      drawAxes(ctx, f, X, Y, {
        yFormat: (v) => money(v, { compact: false, sign: true }),
        xFormat: (v) => money(v),
        xLabel: 'your wealth when offered the flip',
      });
      hline(ctx, f, Y(0), t.axis, 'below this line: turn it down', { below: true });
      if (isFinite(be) && be > ws[0] && be < ws[ws.length - 1])
        vline(ctx, f, X(be), t.muted, `break-even, γ ${gammaLabel(state.gamma > 0 ? state.gamma : 1)}: ${money(be)}`, { align: 'right' });
      if (isFinite(k.wealth) && k.wealth > ws[0] && k.wealth < ws[ws.length - 1]) vline(ctx, f, X(k.wealth), t.muted, `Kelly-sized ${money(k.wealth)}`, { dy: 18 });
      ctx.save();
      clipPlot(ctx, f);
      for (const s of series) line(ctx, ws, s.vals.map((v) => Math.max(v, ymin * 1.5)), X, Y, t[s.color], 2.5, 1, s.dash);
      ctx.restore();
      if (state.w0 >= ws[0] && state.w0 <= ws[ws.length - 1]) {
        const py = Y(Math.max(ymin, Math.min(ymax, ce)));
        dot(ctx, X(state.w0), py, t.iso, t.surface, 5);
        ctx.fillStyle = t.ink;
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        const label = `you: ${money(ce, { sign: true, compact: false })}${ce < ymin ? ' (below the chart)' : ''}`;
        const lx = Math.min(f.x1 - ctx.measureText(label).width - 4, X(state.w0) + 10);
        ctx.fillText(label, lx, ce < ymin ? f.y1 - 8 : Math.max(f.y0 + 14, py - 8));
      }
    },
    (ctx, f, mx) => {
      if (!X || mx < f.x0 || mx > f.x1) return null;
      const w = X.invert(mx);
      crosshair(ctx, f, mx);
      let html = tipHead(`If you have ${money(w)}`);
      for (const s of series) {
        const v = certaintyEquivalent(w, P, s.gamma);
        if (v >= ymin && v <= ymax) dot(ctx, mx, Y(v), f.t[s.color], f.t.surface);
        html += tipRow(`One flip worth (γ = ${gammaLabel(s.gamma)})`, money(v, { sign: true, compact: false }), f.t[s.color]);
      }
      return html;
    },
    (mx) => X && dragWealth(X.invert(Math.min(charts.ce.frame().x1, Math.max(charts.ce.frame().x0, mx)))),
  );
}

// ---------------------------------------------------------------- Plate VIII: Kelly growth curve
const mult = (x) => `×${x <= 0 ? '0' : x.toFixed(4)}`;
/** A signed percentage that never prints "−0.0%" for a value that is zero to the shown precision. */
const signedPct = (v, digits = 1) => {
  if (Math.abs(v) >= 1) digits = 0; // "+1157%", not "+1156.9%"
  const r = +(v * 100).toFixed(digits);
  if (r === 0) return `${(0).toFixed(digits)}%`;
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}%`;
};
const typical100 = (f, P) => (f >= 1 ? -1 : Math.expm1(100 * growth(f, P)));

/** Plate VIII's second paragraph: why growth has a peak, in the reader's own numbers. */
function renderGrowthWhy(P, k, f0) {
  const b = P.win / P.loss;
  const heads = Math.round(P.p * 100);
  const atKelly =
    Math.abs(P.p - 0.5) < 1e-9
      ? `At Kelly, one heads and one tails together leave you ${mult((1 + b * k) * (1 - k))}; no other stake does better.`
      : `At Kelly, a typical 100 flips leaves you ${signedPct(typical100(k, P))}; no other stake does better.`;
  const twice = Math.abs(f0 / k - 2) < 0.2 ? ', about twice Kelly,' : '';
  $('p8-why').innerHTML =
    `Why does growth peak? Your wealth <em>multiplies</em>. Stake a fraction <i>f</i> and each heads leaves you <span class="formula">×(1 + <i>b</i>·<i>f</i>)</span>, each tails <span class="formula">×(1 − <i>f</i>)</span>, where <i>b</i> = ${+b.toFixed(3)}. ` +
    `A typical 100 flips has about ${heads} heads and ${100 - heads} tails. ` +
    `Stake a little and the edge barely adds up. Stake a lot and a tails takes away more than a heads gives back: losing half needs a doubling to recover. ` +
    `${atKelly} Past ${pct(f0, 2)}${twice} the typical run shrinks, even though every flip still has a positive average.`;
}

/** The table of growth: what one heads and one tails do at a few stakes, ending in the curve's own height. */
function renderGrowthTable(P, k, f0, fYou) {
  $('p8-growth').hidden = false;
  const b = P.win / P.loss;
  const rows = [
    { f: k / 2, label: 'half-Kelly' },
    { f: k, label: 'Kelly', lead: true },
    { f: f0, label: 'growth stops' },
  ];
  const same = rows.find((r) => Math.abs(r.f - fYou) / r.f < 0.01);
  if (same) {
    same.label += ' · you';
    same.you = true;
  } else rows.push({ f: fYou, label: 'you', you: true });
  rows.sort((a, c) => a.f - c.f);
  const stake = (f) => (f < 0.1 ? pct(f, 2) : fmtFrac(f));
  const wide = (s) => `<span class="wide">Each </span>${s}`;
  const body = rows
    .map((r) => {
      const v = typical100(r.f, P);
      const cls = [r.you && 'you', r.lead && 'lead'].filter(Boolean).join(' ');
      return (
        `<tr class="${cls}"><th scope="row">${stake(r.f)}<span class="note">${r.label}</span></th>` +
        `<td>${mult(1 + b * r.f)}</td><td>${mult(1 - r.f)}</td>` +
        `<td class="${v < -0.0005 ? 'neg' : ''}">${signedPct(v)}</td></tr>`
      );
    })
    .join('');
  $('growth-table').innerHTML =
    `<table><thead><tr><th scope="col">Stake</th><th scope="col">${wide('heads')}</th><th scope="col">${wide('tails')}</th><th scope="col">Typical 100 flips</th></tr></thead><tbody>${body}</tbody></table>`;
  const heads = Math.round(P.p * 100);
  $('growth-note').textContent = `A typical 100 flips is about ${heads} heads and ${100 - heads} tails; that column is the growth curve's height at each stake. Exact.`;
}

function renderKelly() {
  const P = odds();
  const k = kelly(P).fraction;
  const per100 = (f) => Math.expm1(100 * growth(f, P));
  const fYou = state.loss / state.w0;
  if (!(k > 0)) {
    $('p8-head').textContent = 'This bet has no edge, so the best stake is zero.';
    $('p8-why').textContent = 'With no edge, every stake shrinks the typical run, so no fraction grows your money.';
    $('p8-growth').hidden = true;
    ledger($('p8-ledger'), [['Kelly fraction', '0%', 'lead']]);
    charts.kelly.set((ctx, f) => {
      ctx.fillStyle = f.t.muted;
      ctx.fillText('No positive stake grows your money on these odds.', f.x0, f.y0 + 20);
    }, null);
    $('legend-kelly').innerHTML = '';
    return;
  }
  const f0 = zeroGrowthFraction(P);
  const fG = bestFractionFor(state.gamma, P);
  $('p8-head').textContent = `Stake ${pct(k, 2)} of your wealth each flip and your money grows fastest.`;
  renderGrowthWhy(P, k, f0);
  renderGrowthTable(P, k, f0, fYou);
  ledger($('p8-ledger'), [[`Best fraction for your γ = ${gammaLabel(state.gamma)}`, state.gamma === 0 ? 'everything' : pct(fG, 2)]]);
  $('legend-kelly').innerHTML = legendHTML([
    { label: 'Median growth per 100 flips', color: 'var(--s1)' },
    { label: 'Your stake', color: 'var(--iso)', kind: 'swatch' },
  ]);
  const xmax = Math.min(0.999, f0 * 1.45);
  const xs = Array.from({ length: 301 }, (_, i) => (xmax * i) / 300);
  const ys = xs.map(per100);
  const top = per100(k);
  const ymax = top * 1.45;
  const ymin = -top * 1.4;
  let X;
  let Y;
  charts.kelly.set(
    (ctx, f) => {
      const { t } = f;
      X = linearScale(0, xmax, f.x0, f.x1);
      Y = linearScale(ymin, ymax, f.y1, f.y0);
      ctx.fillStyle = hatch(ctx, t.critical);
      ctx.fillRect(f.x0, Y(0), f.x1 - f.x0, f.y1 - Y(0));
      drawAxes(ctx, f, X, Y, {
        yFormat: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}%`,
        xFormat: (v) => `${+(v * 100).toFixed(1)}%`,
        xLabel: 'fraction of wealth staked per flip',
      });
      hline(ctx, f, Y(0), t.axis, 'below: your typical wealth shrinks', { below: true, align: 'left' });
      vline(ctx, f, X(k), t.muted, `Kelly ${pct(k, 2)}`);
      vline(ctx, f, X(f0), t.muted, `growth stops ${pct(f0, 2)}`, { dy: 18 });
      ctx.save();
      clipPlot(ctx, f);
      line(ctx, xs, ys, X, Y, t.s1, 2.5);
      ctx.restore();
      dot(ctx, X(k / 2), Y(per100(k / 2)), t.s1, t.surface, 4);
      ctx.fillStyle = t.ink;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('half-Kelly', X(k / 2) - 8, Y(per100(k / 2)) - 4);
      dot(ctx, X(k), Y(top), t.s1, t.surface, 5);
      if (state.gamma > 0 && fG < xmax && Math.abs(fG - k) / k > 0.03) {
        dot(ctx, X(fG), Y(per100(fG)), t.s3, t.surface, 5);
        ctx.textAlign = 'left';
        ctx.fillText(`best for γ ${gammaLabel(state.gamma)}`, X(fG) + 8, Y(per100(fG)) + 18);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      if (fYou <= xmax) {
        const v = per100(fYou);
        const py = Y(Math.max(ymin, v));
        dot(ctx, X(fYou), py, t.iso, t.surface, 6);
        ctx.textAlign = 'left';
        ctx.fillText(`you: ${fmtFrac(fYou)}`, X(fYou) + 10, py + 4);
      } else {
        ctx.fillStyle = t.ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        dot(ctx, f.x0 + 10, f.y1 - 14, t.iso, t.surface, 5);
        ctx.fillStyle = t.ink;
        ctx.fillText(`you stake ${fmtFrac(fYou)}: far off this chart, typical wealth ${fYou >= 1 ? 'goes to zero' : 'collapses'}`, f.x0 + 22, f.y1 - 7);
      }
    },
    (ctx, f, mx) => {
      if (!X || mx < f.x0 || mx > f.x1) return null;
      const fr = X.invert(mx);
      crosshair(ctx, f, mx);
      const v = per100(fr);
      if (v >= ymin) dot(ctx, mx, Y(v), f.t.s1, f.t.surface);
      return (
        tipHead(`Stake ${pct(fr, 2)} of wealth`) +
        tipRow('Each heads', mult(1 + (P.win / P.loss) * fr)) +
        tipRow('Each tails', mult(1 - fr)) +
        tipRow('Median change per 100 flips', pct(v, 2), f.t.s1) +
        tipRow('Stake at your wealth', money(fr * state.w0, { compact: false }))
      );
    },
    (mx) => {
      if (!X) return;
      const fr = Math.max(0.0005, Math.min(xmax, X.invert(mx)));
      const L = niceRound(fr * state.w0);
      if (L >= 1 && L !== state.loss) {
        setStake(L);
        nomoAnimate();
        onInputsChanged();
      }
    },
  );
}

// ---------------------------------------------------------------- summary
function renderSummary() {
  if (!state.main) return;
  const { dist } = state.main;
  const N = state.flips;
  const P = odds();
  const ce = certaintyEquivalent(state.w0, P, state.gamma);
  const be = breakEvenWealth(P, state.gamma);
  const fr = pct(dist.forever.estimate);
  const E = ev();
  let html;
  if (E <= 0) {
    html = `<strong>This bet loses money on average (${money(E, { sign: true, compact: false })} a flip).</strong><p>Nobody should take it. Keep playing and you will eventually go broke.</p>`;
  } else if (state.w0 < state.loss) {
    html = `<strong>You can't cover a single loss.</strong><p>With ${money(state.w0)} you can't pay ${money(state.loss)} if it comes up tails.</p>`;
  } else if (state.gamma === 0) {
    html = `<strong>A pure expected-value player always takes it (${money(E, { sign: true, compact: false })} a flip).</strong>
      <p>But at ${money(state.w0)}, playing forever ends in ruin about <b>${fr}</b> of the time. The average only reaches people who survive long enough to collect it. Raise γ to see how a cautious person prices it.</p>`;
  } else if (state.w0 < be) {
    html = `<strong>At ${money(state.w0)}, turn it down: one flip is worth ${money(ce, { sign: true, compact: false })} to you.</strong>
      <p>The instinct that losing everything feels like death is what γ formalises. Although the average is ${money(E, { sign: true, compact: false })}, the stake is ${fmtFrac(state.loss / state.w0)} of your wealth, far above the Kelly ${pct(kelly(P).fraction, 2)}. At γ = ${gammaLabel(state.gamma)} the flip becomes worth taking from about <b>${money(niceRound(be))}</b>. Keep flipping from here and you go broke about <b>${fr}</b> of the time.</p>`;
  } else {
    html = `<strong>At ${money(state.w0)}, take it: one flip is worth ${money(ce, { sign: true, compact: false })} to you.</strong>
      <p>You're above the break-even wealth of about <b>${money(niceRound(be))}</b> for γ = ${gammaLabel(state.gamma)}. Even so, if you never stopped, there's about a <b>${fr}</b> chance you'd go broke at some point: the edge is small against the size of each swing.</p>`;
  }
  $('verdict').innerHTML = html;
  ledger($('summary-ledger'), [
    [`Average profit after ${fmtInt(N)} flips`, money(dist.mean[N] - state.w0, { sign: true })],
    [`Median wealth after ${fmtInt(N)} flips`, money(dist.median[N])],
    [`Broke within ${fmtInt(N)} flips`, pct(dist.ruin[N])],
    ['Broke if you never stop', pct(dist.forever.estimate)],
    [`Ahead after ${fmtInt(N)} flips`, pct(dist.ahead[N])],
    [`One flip is worth to you (γ = ${gammaLabel(state.gamma)})`, isFinite(ce) ? money(ce, { sign: true, compact: Math.abs(ce) >= 1e4 }) : '—', ce < 0 ? 'neg' : ''],
  ]);
}

// ---------------------------------------------------------------- orchestration
function renderMain() {
  renderPaths();
  renderHist();
  renderRuin();
  renderSummary();
  if (state.grid) renderGridDependents();
}
function renderGridDependents() {
  if (!state.grid) return;
  if (state.grid.grid[0].curve.length !== state.flips + 1) return; // stale grid from another flip count
  renderHeat();
  renderTable();
}

// ---------------------------------------------------------------- contents: where am I
function bindToc() {
  const links = [...document.querySelectorAll('#toc a')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href')));
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = sections.indexOf(e.target);
        links.forEach((a, j) => a.setAttribute('aria-current', String(i === j)));
        $('rh-where').textContent = i < 8 ? `Plate ${roman[i]} of VIII` : 'Summary';
        history.replaceState(null, '', `#${e.target.id}`);
      }
    },
    { rootMargin: '-40% 0px -55% 0px' },
  );
  sections.forEach((s) => io.observe(s));
}

// ---------------------------------------------------------------- boot
const phone = matchMedia('(max-width: 860px)');
const syncDisclosure = () => ($('numbers-box').open = !phone.matches);
syncDisclosure();
phone.addEventListener('change', syncDisclosure);
$('numbers-box').addEventListener('toggle', () => {
  if (!phone.matches && !$('numbers-box').open) $('numbers-box').open = true;
});
bindControls();
syncRail();
new ResizeObserver(() => buildNomo()).observe(nomo.el);
buildNomo();
renderInstant();
bindToc();
compute();
document.fonts.ready.then(redrawAll);
