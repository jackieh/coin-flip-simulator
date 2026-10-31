// Tiny canvas charting toolkit: scales, axes, a base layer + hover overlay, and a tooltip.

export function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    surface: v('--surface-1'),
    ink: v('--text-primary'),
    ink2: v('--text-secondary'),
    muted: v('--text-muted'),
    grid: v('--grid'),
    axis: v('--axis'),
    s1: v('--series-1'),
    s2: v('--series-2'),
    s3: v('--series-3'),
    critical: v('--critical'),
    good: v('--good'),
    seq: v('--seq').split(',').map((s) => s.trim()),
    font: '12px system-ui, -apple-system, "Segoe UI", sans-serif',
  };
}

// ---------- scales ----------
export function linearScale(d0, d1, r0, r1) {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const f = (x) => r0 + (x - d0) * k;
  f.invert = (y) => d0 + (y - r0) / k;
  f.domain = [d0, d1];
  f.ticks = (count = 5) => niceTicks(d0, d1, count);
  return f;
}

export function logScale(d0, d1, r0, r1) {
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  const k = (r1 - r0) / (l1 - l0 || 1);
  const f = (x) => r0 + (Math.log10(Math.max(x, 1e-300)) - l0) * k;
  f.invert = (y) => Math.pow(10, l0 + (y - r0) / k);
  f.domain = [d0, d1];
  f.ticks = () => {
    const out = [];
    const span = l1 - l0;
    const mults = span > 4 ? [1] : span > 2 ? [1, 3] : [1, 2, 5];
    for (let e = Math.floor(l0); e <= Math.ceil(l1); e++) {
      for (const m of mults) {
        const t = m * Math.pow(10, e);
        if (t >= d0 * 0.999 && t <= d1 * 1.001) out.push(t);
      }
    }
    return out;
  };
  return f;
}

function niceTicks(a, b, count) {
  if (a === b) return [a];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(+t.toFixed(10));
  return out;
}

// ---------- formatting ----------
export function money(x, { compact = true, sign = false } = {}) {
  if (!isFinite(x)) return x > 0 ? '∞' : '−∞';
  const s = sign && x > 0 ? '+' : x < 0 ? '−' : '';
  const a = Math.abs(x);
  if (compact && a >= 1e6) return `${s}$${trim(a / 1e6)}M`;
  if (compact && a >= 1e4) return `${s}$${trim(a / 1e3)}K`;
  return `${s}$${Math.round(a).toLocaleString('en-US')}`;
}
function trim(x) {
  return x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1).replace(/\.0$/, '') : x.toFixed(2).replace(/\.?0+$/, '');
}
export function pct(x, digits) {
  if (!isFinite(x)) return '—';
  const v = x * 100;
  if (digits == null) {
    if (v === 0) return '0%';
    if (v < 0.01) return '<0.01%';
    if (v < 1) digits = 2;
    else if (v > 99 && v < 100) digits = 1;
    else digits = 0;
  }
  return `${v.toFixed(digits)}%`;
}

// ---------- chart shell ----------
/**
 * A chart = container with two stacked canvases (base + hover overlay) and a tooltip.
 * render(ctx, frame) draws the base; hover(ctx, frame, mx, my) draws overlay and
 * returns tooltip HTML (or null).
 */
export class Chart {
  constructor(el, { height = 300, margin = { top: 16, right: 24, bottom: 36, left: 64 } } = {}) {
    this.el = el;
    this.height = height;
    this.margin = margin;
    el.classList.add('chart');
    el.style.height = `${height}px`;
    this.base = document.createElement('canvas');
    this.over = document.createElement('canvas');
    this.over.className = 'overlay';
    this.tip = document.createElement('div');
    this.tip.className = 'tooltip';
    this.tip.hidden = true;
    el.append(this.base, this.over, this.tip);
    this.renderFn = null;
    this.hoverFn = null;
    this.mouse = null;
    this.over.addEventListener('mousemove', (e) => {
      const r = this.over.getBoundingClientRect();
      this.mouse = [e.clientX - r.left, e.clientY - r.top];
      this.drawHover();
    });
    this.over.addEventListener('mouseleave', () => {
      this.mouse = null;
      this.drawHover();
    });
    new ResizeObserver(() => this.draw()).observe(el);
  }

  frame() {
    const w = this.el.clientWidth;
    const h = this.height;
    const m = this.margin;
    return { w, h, x0: m.left, x1: w - m.right, y0: m.top, y1: h - m.bottom, t: theme() };
  }

  setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = this.frame();
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }

  set(renderFn, hoverFn) {
    this.renderFn = renderFn;
    this.hoverFn = hoverFn;
    this.draw();
  }

  draw() {
    if (!this.renderFn || this.el.clientWidth === 0) return;
    const f = this.frame();
    const ctx = this.setup(this.base);
    ctx.font = f.t.font;
    this.renderFn(ctx, f);
    this.drawHover();
  }

  drawHover() {
    const ctx = this.setup(this.over);
    if (!this.mouse || !this.hoverFn) {
      this.tip.hidden = true;
      return;
    }
    const f = this.frame();
    ctx.font = f.t.font;
    const [mx, my] = this.mouse;
    const html = this.hoverFn(ctx, f, mx, my);
    if (!html) {
      this.tip.hidden = true;
      return;
    }
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let left = mx + 14;
    if (left + tw > f.w - 4) left = mx - tw - 14;
    let top = my - th / 2;
    top = Math.max(4, Math.min(f.h - th - 4, top));
    this.tip.style.left = `${Math.max(4, left)}px`;
    this.tip.style.top = `${top}px`;
  }
}

// ---------- drawing helpers ----------
export function drawAxes(ctx, f, x, y, { xFormat = String, yFormat = String, xTicks, yTicks, xLabel, yLabel } = {}) {
  const { t } = f;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = t.font;
  // gridlines (horizontal only) + y labels
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of yTicks || y.ticks(5)) {
    const py = Math.round(y(v)) + 0.5;
    if (py < f.y0 - 1 || py > f.y1 + 1) continue;
    ctx.strokeStyle = t.grid;
    ctx.beginPath();
    ctx.moveTo(f.x0, py);
    ctx.lineTo(f.x1, py);
    ctx.stroke();
    ctx.fillStyle = t.muted;
    ctx.fillText(yFormat(v), f.x0 - 8, py);
  }
  // baseline
  ctx.strokeStyle = t.axis;
  ctx.beginPath();
  ctx.moveTo(f.x0, Math.round(f.y1) + 0.5);
  ctx.lineTo(f.x1, Math.round(f.y1) + 0.5);
  ctx.stroke();
  // x labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = t.muted;
  let lastRight = -Infinity;
  for (const v of xTicks || x.ticks(6)) {
    const px = x(v);
    if (px < f.x0 - 1 || px > f.x1 + 1) continue;
    const label = xFormat(v);
    const w = ctx.measureText(label).width;
    if (px - w / 2 < lastRight + 8) continue;
    ctx.fillText(label, px, f.y1 + 8);
    lastRight = px + w / 2;
  }
  if (xLabel) {
    ctx.textAlign = 'right';
    ctx.fillText(xLabel, f.x1, f.y1 + 22);
  }
  if (yLabel) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(yLabel, 4, 0);
  }
  ctx.restore();
}

export function clipPlot(ctx, f) {
  ctx.beginPath();
  ctx.rect(f.x0, f.y0 - 2, f.x1 - f.x0, f.y1 - f.y0 + 4);
  ctx.clip();
}

export function line(ctx, xs, ys, x, y, color, width = 2, alpha = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < xs.length; i++) {
    const v = ys[i];
    if (!isFinite(v)) {
      started = false;
      continue;
    }
    const px = x(xs[i]);
    const py = y(v);
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

export function vline(ctx, f, px, color, label, { align = 'left', dy = 0 } = {}) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(px) + 0.5, f.y0);
  ctx.lineTo(Math.round(px) + 0.5, f.y1);
  ctx.stroke();
  if (label) {
    ctx.fillStyle = f.t.ink2;
    ctx.textBaseline = 'top';
    const w = ctx.measureText(label).width;
    let tx = align === 'left' ? px + 6 : px - 6 - w;
    if (tx + w > f.x1) tx = px - 6 - w;
    if (tx < f.x0) tx = px + 6;
    ctx.fillStyle = f.t.surface;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(tx - 3, f.y0 + dy, w + 6, 16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = f.t.ink2;
    ctx.fillText(label, tx, f.y0 + 2 + dy);
  }
  ctx.restore();
}

export function hline(ctx, f, py, color, label, { below = false } = {}) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(f.x0, Math.round(py) + 0.5);
  ctx.lineTo(f.x1, Math.round(py) + 0.5);
  ctx.stroke();
  if (label) {
    ctx.fillStyle = f.t.ink2;
    ctx.textAlign = 'right';
    ctx.textBaseline = below ? 'top' : 'bottom';
    ctx.fillText(label, f.x1 - 4, py + (below ? 4 : -4));
  }
  ctx.restore();
}

export function dot(ctx, px, py, color, surface, r = 4) {
  ctx.beginPath();
  ctx.arc(px, py, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function crosshair(ctx, f, px) {
  ctx.save();
  ctx.strokeStyle = f.t.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(px) + 0.5, f.y0);
  ctx.lineTo(Math.round(px) + 0.5, f.y1);
  ctx.stroke();
  ctx.restore();
}

/** Bar with 4px rounded top, square at the baseline. */
export function bar(ctx, x, yTop, w, yBase, color) {
  const h = yBase - yTop;
  if (h <= 0 || w <= 0) return;
  const r = Math.min(4, w / 2, h);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, yBase);
  ctx.lineTo(x, yTop + r);
  ctx.quadraticCurveTo(x, yTop, x + r, yTop);
  ctx.lineTo(x + w - r, yTop);
  ctx.quadraticCurveTo(x + w, yTop, x + w, yTop + r);
  ctx.lineTo(x + w, yBase);
  ctx.closePath();
  ctx.fill();
}

/** Interpolate a sequential ramp (array of hex) at t in [0,1]. */
export function rampColor(ramp, t) {
  t = Math.max(0, Math.min(1, t));
  const pos = t * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(pos));
  const k = pos - i;
  const a = hexToRgb(ramp[i]);
  const b = hexToRgb(ramp[i + 1]);
  return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * k)).join(',')})`;
}
function hexToRgb(h) {
  h = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** Legend items: [{label, color, kind: 'line'|'swatch'|'wash'}] rendered as HTML. */
export function legendHTML(items) {
  return items
    .map(
      (it) =>
        `<span class="key"><i class="k-${it.kind || 'line'}" style="--c:${it.color}"></i>${it.label}</span>`,
    )
    .join('');
}
