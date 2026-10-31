import {
  certaintyEquivalent,
  breakEvenWealth,
  kelly,
  logspace,
} from './sim.js';
import {
  Chart,
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
  legendHTML,
  money,
  pct,
} from './charts.js';

const $ = (id) => document.getElementById(id);
const GRID_ROWS = 48;
const TABLE_MULTIPLES = [1, 2, 5, 10, 21, 50, 100, 1000];

// ---------------------------------------------------------------- state
const state = {
  w0: 1000,
  win: 1050,
  loss: 1000,
  p: 0.5,
  flips: 500,
  gamma: 1,
  pathCount: 200,
  seed: 1,
  main: null, // { dist, sample }
  grid: null, // { grid, table }
};
const params = () => ({ w0: state.w0, win: state.win, loss: state.loss, p: state.p });
const ev = () => state.p * state.win - (1 - state.p) * state.loss;

const charts = {
  paths: new Chart($('chart-paths'), { height: 340, margin: { top: 16, right: 120, bottom: 36, left: 64 } }),
  ruin: new Chart($('chart-ruin'), { height: 280, margin: { top: 16, right: 120, bottom: 36, left: 52 } }),
  heat: new Chart($('chart-heat'), { height: 360, margin: { top: 12, right: 24, bottom: 36, left: 64 } }),
  wealth: new Chart($('chart-wealth'), { height: 300, margin: { top: 16, right: 24, bottom: 36, left: 52 } }),
  ce: new Chart($('chart-ce'), { height: 300, margin: { top: 16, right: 24, bottom: 36, left: 64 } }),
  hist: new Chart($('chart-hist'), { height: 280, margin: { top: 16, right: 24, bottom: 36, left: 52 } }),
};

// ---------------------------------------------------------------- tooltip helpers
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
      $('status').textContent = 'Working out the chart across all starting amounts…';
    } else {
      state.grid = msg;
      busy = false;
      $('status').textContent = '';
      renderGrid();
    }
  };
  w.onerror = (e) => {
    $('status').textContent = `Calculation error: ${e.message}`;
    busy = false;
  };
  return w;
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
  const tableWealths = [...new Set([...TABLE_MULTIPLES.map((m) => m * state.loss), state.w0])].sort((a, b) => a - b);
  worker.postMessage({
    id: jobId,
    params: params(),
    flips: state.flips,
    pathCount: state.pathCount,
    seed: state.seed,
    gridRows: GRID_ROWS,
    tableWealths,
  });
}

let debounceTimer = null;
function scheduleCompute() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(compute, 120);
}

// ---------------------------------------------------------------- controls
function wealthToSlider(w) {
  const lo = Math.log(state.loss);
  const hi = Math.log(state.loss * 1000);
  return Math.round(((Math.log(Math.max(w, state.loss)) - lo) / (hi - lo)) * 1000);
}
function sliderToWealth(v) {
  const lo = Math.log(state.loss);
  const hi = Math.log(state.loss * 1000);
  const w = Math.exp(lo + ((hi - lo) * v) / 1000);
  const step = w < 10000 ? 100 : w < 100000 ? 1000 : 10000;
  return Math.max(state.loss, Math.round(w / step) * step);
}

function syncControls() {
  $('w0').value = state.w0;
  $('w0-slider').value = wealthToSlider(state.w0);
  $('flips').value = state.flips;
  $('flips-slider').value = state.flips;
  $('gamma-out').textContent = state.gamma;
  document.querySelectorAll('.nflips').forEach((el) => (el.textContent = state.flips.toLocaleString('en-US')));
  $('lede-win').textContent = money(state.win, { compact: false });
  $('lede-loss').textContent = money(state.loss, { compact: false });
  $('lede-ev').textContent = money(ev(), { compact: false, sign: true });
  const k = kelly(params());
  $('kelly-frac').textContent = k.fraction > 0 ? `${(k.fraction * 100).toFixed(2)}% (wealth ${money(k.wealth)})` : 'never (no edge)';
  renderPresets();
}

function renderPresets() {
  const be = breakEvenWealth(params(), 1);
  const k = kelly(params());
  const items = [1, 2, 5, 10, 100].map((m) => ({ label: money(m * state.loss), w: m * state.loss }));
  if (isFinite(be) && be > state.loss) items.push({ label: `Break-even ${money(be)}`, w: Math.round(be / 100) * 100 });
  if (isFinite(k.wealth) && k.wealth > state.loss) items.push({ label: `Kelly ${money(k.wealth)}`, w: Math.round(k.wealth / 100) * 100 });
  items.sort((a, b) => a.w - b.w);
  $('presets').innerHTML = items
    .map((it) => `<button type="button" data-w="${it.w}" aria-pressed="${it.w === state.w0}">${it.label}</button>`)
    .join('');
}

function num(id, fallback, min, max) {
  const v = parseFloat($(id).value);
  if (!isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function bindControls() {
  $('w0').addEventListener('change', () => {
    state.w0 = Math.round(num('w0', state.w0, 0, 1e9));
    syncControls();
    scheduleCompute();
  });
  $('w0-slider').addEventListener('input', () => {
    state.w0 = sliderToWealth(+$('w0-slider').value);
    $('w0').value = state.w0;
    renderPresets();
    scheduleCompute();
  });
  $('presets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.w0 = +b.dataset.w;
    syncControls();
    compute();
  });
  for (const id of ['win', 'loss', 'p']) {
    $(id).addEventListener('change', () => {
      state.win = Math.round(num('win', state.win, 1, 1e8));
      state.loss = Math.round(num('loss', state.loss, 1, 1e8));
      state.p = num('p', state.p, 0.01, 0.99);
      $('win').value = state.win;
      $('loss').value = state.loss;
      $('p').value = state.p;
      syncControls();
      scheduleCompute();
    });
  }
  $('flips').addEventListener('change', () => {
    state.flips = Math.round(num('flips', state.flips, 1, 5000));
    syncControls();
    scheduleCompute();
  });
  $('flips-slider').addEventListener('input', () => {
    state.flips = +$('flips-slider').value;
    $('flips').value = state.flips;
    document.querySelectorAll('.nflips').forEach((el) => (el.textContent = state.flips.toLocaleString('en-US')));
    scheduleCompute();
  });
  $('gamma').addEventListener('input', () => {
    state.gamma = +$('gamma').value;
    $('gamma-out').textContent = state.gamma;
    renderTilesAndVerdict();
    renderCE();
    renderGridDependents();
  });
  $('paths').addEventListener('change', () => {
    state.pathCount = +$('paths').value;
    compute();
  });
  $('reseed').addEventListener('click', () => {
    state.seed = (state.seed * 1103515245 + 12345) >>> 0;
    compute();
  });
  const modes = ['auto', 'light', 'dark'];
  let mode = 0;
  $('theme-toggle').addEventListener('click', () => {
    mode = (mode + 1) % 3;
    if (modes[mode] === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = modes[mode];
    $('theme-toggle').textContent = `Theme: ${modes[mode]}`;
    Object.values(charts).forEach((c) => c.draw());
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => Object.values(charts).forEach((c) => c.draw()));
}

// ---------------------------------------------------------------- tiles + verdict
function renderTilesAndVerdict() {
  if (!state.main) return;
  const { dist } = state.main;
  const N = state.flips;
  const P = params();
  const ce = certaintyEquivalent(state.w0, P, state.gamma);
  const tiles = [
    {
      label: `Average profit after ${N.toLocaleString('en-US')} flips`,
      value: money(dist.mean[N] - state.w0, { sign: true }),
      sub: `naive EV ${money(ev() * N, { sign: true })}. Going broke ends your play early.`,
    },
    { label: `Chance of going broke within ${N.toLocaleString('en-US')} flips`, value: pct(dist.ruin[N]), sub: 'exact' },
    {
      label: 'Chance of going broke if you never stop',
      value: pct(dist.forever.estimate),
      sub: dist.forever.upper - dist.forever.lower > 0.002 ? `between ${pct(dist.forever.lower)} and ${pct(dist.forever.upper)}` : 'flip forever',
    },
    { label: `Median wealth after ${N.toLocaleString('en-US')} flips`, value: money(dist.median[N]), sub: `you started with ${money(state.w0)}` },
    { label: `Chance you're ahead after ${N.toLocaleString('en-US')} flips`, value: pct(dist.ahead[N]), sub: 'ending above your starting wealth' },
    {
      label: 'One flip is worth, to you',
      value: isFinite(ce) ? money(ce, { sign: true, compact: Math.abs(ce) >= 1e4 }) : '—',
      sub: `certainty equivalent at γ = ${state.gamma}`,
    },
  ];
  $('tiles').innerHTML = tiles
    .map((t) => `<div class="tile"><div class="label">${t.label}</div><div class="value">${t.value}</div><div class="sub">${t.sub}</div></div>`)
    .join('');

  const v = $('verdict');
  const be = breakEvenWealth(P, state.gamma);
  const fr = pct(dist.forever.estimate);
  let cls = '';
  let html;
  if (ev() <= 0) {
    cls = 'bad';
    html = `<strong>This bet loses money on average (${money(ev(), { sign: true, compact: false })} per flip).</strong><p>Nobody should take it. If you keep playing you will eventually go broke.</p>`;
  } else if (state.w0 < state.loss) {
    cls = 'bad';
    html = `<strong>You can't cover a single loss.</strong><p>With ${money(state.w0)} you can't pay ${money(state.loss)} if it comes up tails.</p>`;
  } else if (state.gamma === 0) {
    html = `<strong>A pure expected-value player always takes this bet (+${money(ev(), { compact: false })} per flip).</strong>
      <p>But at ${money(state.w0)}, playing forever ends in going broke about <b>${fr}</b> of the time. The average only shows up for people who survive long enough to collect it. Raise γ to see how a risk-averse person values it.</p>`;
  } else if (state.w0 < be) {
    cls = 'bad';
    html = `<strong>At ${money(state.w0)}, one flip is worth ${money(ce, { sign: true, compact: false })} to you, so turn it down.</strong>
      <p>Your instinct is right. Even though the average is +${money(ev(), { compact: false })}, at your risk aversion (γ = ${state.gamma}) the bet only becomes worth taking once you have about <b>${money(be)}</b>.
      Keep flipping from here and you go broke about <b>${fr}</b> of the time.</p>`;
  } else {
    cls = 'good';
    html = `<strong>At ${money(state.w0)}, one flip is worth ${money(ce, { sign: true, compact: false })} to you, so it's worth taking.</strong>
      <p>You're above the break-even wealth of about <b>${money(be)}</b> for γ = ${state.gamma}. Even so, if you never stopped, there's about a <b>${fr}</b> chance you'd go broke at some point. The edge is small compared with the size of each swing.</p>`;
  }
  v.className = `verdict ${cls}`;
  v.innerHTML = html;
}

// ---------------------------------------------------------------- chart: sample paths
function renderPaths() {
  const { dist, sample } = state.main;
  const N = state.flips;
  const loss = state.loss;
  const ruinedCount = sample.ruinStep.filter((s) => s >= 0).length;
  $('legend-paths').innerHTML = legendHTML([
    { label: 'Average (exact)', color: 'var(--series-1)' },
    { label: 'Median (exact)', color: 'var(--series-2)' },
    { label: 'Middle 80% of outcomes', color: 'var(--series-1)', kind: 'wash' },
    { label: 'Sample run, still playing', color: 'var(--text-muted)', kind: 'thin' },
    { label: `Sample run, went broke (${ruinedCount} of ${sample.paths.length})`, color: 'var(--critical)', kind: 'thin' },
  ]);
  let ymax = state.w0;
  for (let n = 0; n <= N; n++) ymax = Math.max(ymax, dist.p90[n], dist.mean[n]);
  // make room for most surviving sample runs too (they're the ones that collected the edge)
  const ends = sample.paths.filter((_, i) => sample.ruinStep[i] < 0).map((p) => p[N]).sort((a, b) => a - b);
  if (ends.length) ymax = Math.max(ymax, ends[Math.floor(ends.length * 0.9)]);
  ymax *= 1.15;

  let X;
  let Y;
  charts.paths.set(
    (ctx, f) => {
      const { t } = f;
      X = linearScale(0, N, f.x0, f.x1);
      Y = linearScale(0, ymax, f.y1, f.y0);
      drawAxes(ctx, f, X, Y, { yFormat: (v) => money(v), xFormat: (v) => v.toLocaleString('en-US'), xLabel: 'flip number' });
      ctx.save();
      clipPlot(ctx, f);
      const stride = Math.max(1, Math.floor(N / (f.x1 - f.x0)));
      // band
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
      // paths: survivors first, then ruined on top
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
        if (r >= 0) drawPath(path, r, t.critical, 0.5);
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = t.critical;
      sample.paths.forEach((path, i) => {
        const r = sample.ruinStep[i];
        if (r >= 0) {
          ctx.beginPath();
          ctx.arc(X(r), Y(path[r]), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      const xs = Array.from({ length: N + 1 }, (_, i) => i);
      line(ctx, xs, dist.mean, X, Y, t.s1, 2);
      line(ctx, xs, dist.median, X, Y, t.s2, 2);
      ctx.restore();
      hline(ctx, f, Y(loss), t.axis, `broke below ${money(loss)}`, { below: false });
      // direct end labels (only if they don't collide)
      const ym = Y(dist.mean[N]);
      const yd = Y(dist.median[N]);
      ctx.fillStyle = t.ink2;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      if (Math.abs(ym - yd) >= 16) {
        ctx.fillText(`avg ${money(dist.mean[N])}`, f.x1 + 8, ym);
        ctx.fillText(`median ${money(dist.median[N])}`, f.x1 + 8, yd);
      } else {
        ctx.fillText(`avg ${money(dist.mean[N])}`, f.x1 + 8, Math.min(ym, yd) - 8);
        ctx.fillText(`median ${money(dist.median[N])}`, f.x1 + 8, Math.max(ym, yd) + 8);
      }
    },
    (ctx, f, mx) => {
      if (!X || mx < f.x0 || mx > f.x1) return null;
      const n = Math.max(0, Math.min(N, Math.round(X.invert(mx))));
      crosshair(ctx, f, X(n));
      dot(ctx, X(n), Y(dist.mean[n]), f.t.s1, f.t.surface);
      dot(ctx, X(n), Y(dist.median[n]), f.t.s2, f.t.surface);
      const sampleRuined = sample.ruinStep.filter((s) => s >= 0 && s <= n).length;
      return (
        tipHead(`After ${n.toLocaleString('en-US')} flips`) +
        tipRow('Average', money(dist.mean[n], { compact: false }), f.t.s1) +
        tipRow('Median', money(dist.median[n], { compact: false }), f.t.s2) +
        tipRow('Middle 80%', `${money(dist.p10[n])} – ${money(dist.p90[n])}`) +
        tipRow('Broke so far (exact)', pct(dist.ruin[n])) +
        tipRow('Sample runs broke', `${sampleRuined} / ${sample.paths.length}`)
      );
    },
  );
}

// ---------------------------------------------------------------- chart: ruin over time
function renderRuin() {
  const { dist } = state.main;
  const N = state.flips;
  $('legend-ruin').innerHTML = legendHTML([
    { label: 'Broke by this flip', color: 'var(--series-1)' },
    { label: 'Ahead of where you started', color: 'var(--series-2)' },
    { label: 'Eventually broke if you never stop', color: 'var(--text-muted)', kind: 'thin' },
  ]);
  let X;
  let Y;
  const xs = Array.from({ length: N + 1 }, (_, i) => i);
  charts.ruin.set(
    (ctx, f) => {
      const { t } = f;
      X = linearScale(0, N, f.x0, f.x1);
      Y = linearScale(0, 1, f.y1, f.y0);
      drawAxes(ctx, f, X, Y, { yFormat: (v) => `${Math.round(v * 100)}%`, xFormat: (v) => v.toLocaleString('en-US'), xLabel: 'flip number' });
      hline(ctx, f, Y(dist.forever.estimate), t.muted, null);
      ctx.save();
      clipPlot(ctx, f);
      // "ahead" oscillates flip to flip (parity); draw it as-is, it's exact.
      line(ctx, xs, dist.ahead, X, Y, t.s2, 2);
      line(ctx, xs, dist.ruin, X, Y, t.s1, 2);
      ctx.restore();
      ctx.fillStyle = t.ink2;
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
      crosshair(ctx, f, X(n));
      dot(ctx, X(n), Y(dist.ruin[n]), f.t.s1, f.t.surface);
      dot(ctx, X(n), Y(dist.ahead[n]), f.t.s2, f.t.surface);
      return (
        tipHead(`After ${n.toLocaleString('en-US')} flips`) +
        tipRow('Broke', pct(dist.ruin[n], 2), f.t.s1) +
        tipRow('Ahead', pct(dist.ahead[n], 2), f.t.s2) +
        tipRow('Still playing, not ahead', pct(Math.max(0, 1 - dist.ruin[n] - dist.ahead[n]), 2))
      );
    },
  );
}

// ---------------------------------------------------------------- chart: heatmap
function renderHeat() {
  const N = state.flips;
  $('legend-heat').innerHTML =
    `<span class="key">0%<i class="k-ramp"></i>100% chance of going broke</span>` +
    legendHTML([{ label: 'Your starting wealth', color: 'var(--text-primary)', kind: 'thin' }]);
  if (!state.grid) {
    charts.heat.set((ctx, f) => {
      ctx.fillStyle = f.t.muted;
      ctx.fillText('Computing…', f.x0, f.y0 + 20);
    }, null);
    return;
  }
  const rows = state.grid.grid;
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
      // contours
      for (const level of [0.01, 0.1, 0.5, 0.9]) {
        const pts = [];
        for (const r of rows) {
          let n = -1;
          for (let k = 0; k <= N; k++) if (r.curve[k] >= level) { n = k; break; }
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
      // your wealth
      if (state.w0 >= Y.domain[0] && state.w0 <= Y.domain[1]) {
        const py = Math.round(Y(state.w0)) + 0.5;
        ctx.strokeStyle = t.surface;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(f.x0, py); ctx.lineTo(f.x1, py); ctx.stroke();
        ctx.strokeStyle = t.ink;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(f.x0, py); ctx.lineTo(f.x1, py); ctx.stroke();
      }
      drawAxes(ctx, f, X, Y, {
        yFormat: (v) => money(v),
        xFormat: (v) => v.toLocaleString('en-US'),
        xLabel: 'number of flips',
        yTicks: Y.ticks(),
      });
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
        tipRow(`Broke within ${n.toLocaleString('en-US')} flips`, pct(best.curve[n], 2)) +
        tipRow('Broke if you never stop', pct(best.forever.estimate, 1))
      );
    },
  );
}

// ---------------------------------------------------------------- chart: by wealth
function renderWealth() {
  const N = state.flips;
  $('legend-wealth').innerHTML = legendHTML([
    { label: `Broke within ${N.toLocaleString('en-US')} flips`, color: 'var(--series-1)' },
    { label: `Ahead after ${N.toLocaleString('en-US')} flips`, color: 'var(--series-2)' },
    { label: 'Broke if you never stop', color: 'var(--series-3)' },
    { label: 'Your wealth / break-even', color: 'var(--text-muted)', kind: 'thin' },
  ]);
  if (!state.grid) {
    charts.wealth.set((ctx, f) => {
      ctx.fillStyle = f.t.muted;
      ctx.fillText('Computing…', f.x0, f.y0 + 20);
    }, null);
    return;
  }
  const rows = state.grid.grid;
  const ws = rows.map((r) => r.w0);
  const series = [
    { key: 'ruinN', vals: rows.map((r) => r.curve[N]), color: 's1', label: `Broke within ${N.toLocaleString('en-US')}` },
    { key: 'ahead', vals: rows.map((r) => r.ahead), color: 's2', label: `Ahead after ${N.toLocaleString('en-US')}` },
    { key: 'forever', vals: rows.map((r) => r.forever.estimate), color: 's3', label: 'Broke eventually' },
  ];
  const be = breakEvenWealth(params(), state.gamma);
  let X;
  let Y;
  charts.wealth.set(
    (ctx, f) => {
      const { t } = f;
      X = logScale(ws[0], ws[ws.length - 1], f.x0, f.x1);
      Y = linearScale(0, 1, f.y1, f.y0);
      drawAxes(ctx, f, X, Y, { yFormat: (v) => `${Math.round(v * 100)}%`, xFormat: (v) => money(v), xLabel: 'starting wealth (log scale)' });
      if (state.w0 >= ws[0] && state.w0 <= ws[ws.length - 1]) vline(ctx, f, X(state.w0), t.muted, `you ${money(state.w0)}`);
      if (isFinite(be) && be > ws[0] && be < ws[ws.length - 1] && state.gamma > 0)
        vline(ctx, f, X(be), t.muted, `break-even (γ=${state.gamma}) ${money(be)}`, { dy: 16 });
      for (const s of series) line(ctx, ws, s.vals, X, Y, t[s.color], 2);
    },
    (ctx, f, mx) => {
      if (!X || mx < f.x0 || mx > f.x1) return null;
      const w = X.invert(mx);
      let i = 0;
      for (let k = 0; k < ws.length; k++) if (Math.abs(Math.log(ws[k] / w)) < Math.abs(Math.log(ws[i] / w))) i = k;
      crosshair(ctx, f, X(ws[i]));
      let html = tipHead(`Start with ${money(ws[i])}`);
      for (const s of series) {
        dot(ctx, X(ws[i]), Y(s.vals[i]), f.t[s.color], f.t.surface);
        html += tipRow(s.label, pct(s.vals[i], 1), f.t[s.color]);
      }
      return html;
    },
  );
}

// ---------------------------------------------------------------- chart: certainty equivalent
function renderCE() {
  const P = params();
  const E = ev();
  const ws = logspace(state.loss, state.loss * 1000, 320);
  const series = [
    { label: `Risk-neutral, γ = 0 (always ${money(E, { sign: true, compact: false })})`, short: 'γ = 0', gamma: 0, color: 's1', css: '--series-1' },
    { label: 'Log utility, γ = 1', short: 'γ = 1', gamma: 1, color: 's2', css: '--series-2' },
  ];
  if (state.gamma !== 0 && state.gamma !== 1)
    series.push({ label: `Your setting, γ = ${state.gamma}`, short: `γ = ${state.gamma}`, gamma: state.gamma, color: 's3', css: '--series-3' });
  series.forEach((s) => (s.vals = ws.map((w) => certaintyEquivalent(w, P, s.gamma))));
  $('legend-ce').innerHTML = legendHTML(series.map((s) => ({ label: s.label, color: `var(${s.css})` })));
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
      drawAxes(ctx, f, X, Y, { yFormat: (v) => money(v, { compact: false, sign: true }), xFormat: (v) => money(v), xLabel: 'your wealth when offered the flip (log scale)' });
      hline(ctx, f, Y(0), t.axis, 'not worth taking ↓', { below: true });
      if (isFinite(be) && be > ws[0] && be < ws[ws.length - 1])
        vline(ctx, f, X(be), t.muted, `break-even (γ=${state.gamma > 0 ? state.gamma : 1}) ${money(be)}`);
      if (isFinite(k.wealth) && k.wealth > ws[0] && k.wealth < ws[ws.length - 1])
        vline(ctx, f, X(k.wealth), t.muted, `Kelly ${money(k.wealth)}`, { dy: 16 });
      ctx.save();
      clipPlot(ctx, f);
      for (const s of series) line(ctx, ws, s.vals.map((v) => Math.max(v, ymin * 1.5)), X, Y, t[s.color], 2);
      ctx.restore();
      if (state.w0 >= ws[0] && state.w0 <= ws[ws.length - 1]) {
        const s = series.find((s) => s.gamma === state.gamma) || series[series.length - 1];
        const v = certaintyEquivalent(state.w0, P, s.gamma);
        if (v >= ymin && v <= ymax) dot(ctx, X(state.w0), Y(v), t[s.color], t.surface);
        else vline(ctx, f, X(state.w0), t.axis, null);
        ctx.fillStyle = t.ink2;
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        const label = `you: ${money(v, { sign: true, compact: false })}`;
        const py = Y(Math.max(ymin, Math.min(ymax, v)));
        const lx = Math.min(f.x1 - ctx.measureText(label).width - 4, X(state.w0) + 8);
        ctx.fillText(label, lx, Math.max(f.y0 + 14, py - 6));
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
        html += tipRow(`One flip worth (${s.short})`, money(v, { sign: true, compact: false }), f.t[s.color]);
      }
      return html;
    },
  );
}

// ---------------------------------------------------------------- chart: final histogram
function renderHist() {
  const { dist } = state.main;
  const N = state.flips;
  $('legend-hist').innerHTML = legendHTML([
    { label: 'Still playing', color: 'var(--series-1)', kind: 'swatch' },
    { label: 'Went broke along the way', color: 'var(--critical)', kind: 'swatch' },
  ]);
  const alive = dist.final.filter((d) => !d.ruined);
  const broke = dist.final.filter((d) => d.ruined).reduce((s, d) => s + d.prob, 0);
  const lattice = state.win + state.loss;
  let bins = [];
  let lo = 0;
  let bw = lattice;
  if (alive.length) {
    const total = alive.reduce((s, d) => s + d.prob, 0);
    let cum = 0;
    let qlo = alive[0].value;
    let qhi = alive[alive.length - 1].value;
    let gotLo = false;
    for (const d of alive) {
      cum += d.prob / total;
      if (!gotLo && cum >= 0.001) { qlo = d.value; gotLo = true; }
      if (cum >= 0.999) { qhi = d.value; break; }
    }
    const k = Math.max(1, Math.ceil((qhi - qlo) / lattice / 40));
    bw = k * lattice;
    lo = qlo - bw / 2;
    const count = Math.max(1, Math.floor((qhi - lo) / bw) + 1);
    bins = Array.from({ length: count }, (_, i) => ({ a: lo + i * bw, b: lo + (i + 1) * bw, prob: 0 }));
    for (const d of alive) {
      const i = Math.max(0, Math.min(count - 1, Math.floor((d.value - lo) / bw)));
      bins[i].prob += d.prob;
    }
  }
  const pmax = Math.max(broke, ...bins.map((b) => b.prob), 1e-9);
  let hit = [];
  charts.hist.set(
    (ctx, f) => {
      const { t } = f;
      hit = [];
      const brokeW = 56;
      const Y = linearScale(0, pmax * 1.1, f.y1, f.y0);
      const ax0 = f.x0 + brokeW + 16;
      const X = bins.length ? linearScale(bins[0].a, bins[bins.length - 1].b, ax0, f.x1) : linearScale(0, 1, ax0, f.x1);
      drawAxes(ctx, { ...f, x0: f.x0 }, linearScale(0, 1, -1e9, -1e9), Y, { yFormat: (v) => pct(v, v < 0.1 ? 1 : 0), xTicks: [] });
      ctx.fillStyle = t.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('broke', f.x0 + 8 + brokeW / 2 - 4, f.y1 + 8);
      // broke bar
      const bwBroke = 24;
      const bxBroke = f.x0 + 8 + (brokeW - bwBroke) / 2 - 4;
      bar(ctx, bxBroke, Y(broke), bwBroke, f.y1, t.critical);
      hit.push({ x0: bxBroke - 6, x1: bxBroke + bwBroke + 6, html: tipHead('Went broke along the way') + tipRow('Probability', pct(broke, 2)) });
      if (broke > 0) {
        ctx.fillStyle = t.ink2;
        ctx.textBaseline = 'bottom';
        ctx.fillText(pct(broke), bxBroke + bwBroke / 2, Y(broke) - 4);
      }
      if (!bins.length) return;
      // x axis ticks for the alive part
      const tickF = (v) => money(v);
      ctx.save();
      ctx.fillStyle = t.muted;
      ctx.textBaseline = 'top';
      let lastR = -Infinity;
      for (const v of X.ticks(6)) {
        const px = X(v);
        if (px < ax0 || px > f.x1) continue;
        const label = tickF(v);
        const w = ctx.measureText(label).width;
        if (px - w / 2 < lastR + 8) continue;
        ctx.fillText(label, px, f.y1 + 8);
        lastR = px + w / 2;
      }
      ctx.restore();
      const slot = (f.x1 - ax0) / bins.length;
      const barW = Math.max(1, Math.min(24, slot - 2));
      for (const b of bins) {
        const cx = X((b.a + b.b) / 2);
        bar(ctx, cx - barW / 2, Y(b.prob), barW, f.y1, t.s1);
        hit.push({
          x0: cx - slot / 2,
          x1: cx + slot / 2,
          html: tipHead(`${money(b.a, { compact: false })} – ${money(b.b, { compact: false })}`) + tipRow('Probability', pct(b.prob, 2)),
        });
      }
      if (state.w0 >= bins[0].a && state.w0 <= bins[bins.length - 1].b) vline(ctx, f, X(state.w0), t.muted, `start ${money(state.w0)}`);
      if (dist.median[N] >= state.loss) vline(ctx, f, X(dist.median[N]), t.ink2, `median ${money(dist.median[N])}`, { dy: 16 });
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

// ---------------------------------------------------------------- table
function renderTable() {
  if (!state.grid) return;
  const N = state.flips;
  const P = params();
  const rows = state.grid.table;
  const head = ['Starting wealth', `Broke within ${N.toLocaleString('en-US')} flips`, 'Broke if you never stop', `Ahead after ${N.toLocaleString('en-US')}`, `One flip worth (γ=${state.gamma})`, 'Take it?'];
  const body = rows
    .map((r) => {
      const ce = certaintyEquivalent(r.w0, P, state.gamma);
      return `<tr class="${r.w0 === state.w0 ? 'current' : ''}"><td>${money(r.w0, { compact: false })}${r.w0 === state.w0 ? ' (you)' : ''}</td>
        <td>${pct(r.curve[N], 2)}</td><td>${pct(r.forever.estimate, 1)}</td><td>${pct(r.ahead, 1)}</td>
        <td>${money(ce, { sign: true, compact: false })}</td><td>${ce > 0 ? 'Yes' : 'No'}</td></tr>`;
    })
    .join('');
  $('table').innerHTML = `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---------------------------------------------------------------- orchestration
function renderMain() {
  renderTilesAndVerdict();
  renderPaths();
  renderRuin();
  renderHist();
  renderCE();
  // grid-based charts keep showing the previous result until the new one arrives
  if (state.grid) renderGridDependents();
  else {
    renderHeat();
    renderWealth();
  }
}
function renderGrid() {
  renderGridDependents();
}
function renderGridDependents() {
  if (!state.grid) return;
  // a stale grid from a different flip count can't be indexed safely
  if (state.grid.grid[0].curve.length !== state.flips + 1) return;
  renderHeat();
  renderWealth();
  renderTable();
}

bindControls();
syncControls();
compute();
