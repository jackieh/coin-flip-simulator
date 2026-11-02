// Pure math for the coin-flip ruin simulator. No DOM, so it runs in Node tests,
// in the browser, and in the Web Worker.
//
// The game: each flip, with probability p you gain `win`, otherwise you lose `loss`.
// You are RUINED as soon as your wealth drops below `loss` (you can no longer cover
// the next bet). A ruined player stops and keeps whatever is left ($0 .. loss-1).
//
// After n flips with h heads, wealth = w0 + win*h - loss*(n-h). That is only n+1
// possible states per step, so we can track the exact probability distribution with
// a simple dynamic program instead of relying on random sampling.

export function wealthAt(w0, win, loss, n, h) {
  return w0 + win * h - loss * (n - h);
}

/**
 * Core exact dynamic program. Calls onStep(n, state) after every step n = 0..flips.
 * state = { alive: Float64Array (index h), lo, hi, ruined, absorbed: [{value, prob, step}] }
 * Alive states are those with h in [lo, hi]; wealth increases with h.
 */
export function runDP({ w0, win, loss, p }, flips, onStep) {
  const q = 1 - p;
  let cur = new Float64Array(flips + 2);
  let nxt = new Float64Array(flips + 2);
  const absorbed = [];
  let ruined = 0;
  let lo = 0;
  let hi = 0;
  if (w0 < loss) {
    absorbed.push({ value: w0, prob: 1, step: 0 });
    ruined = 1;
    lo = 1;
    hi = 0;
  } else {
    cur[0] = 1;
  }
  const state = { alive: cur, lo, hi, ruined, absorbed };
  onStep && onStep(0, state);

  for (let n = 0; n < flips; n++) {
    if (lo <= hi) {
      nxt.fill(0, lo, hi + 2);
      for (let h = lo; h <= hi; h++) {
        const m = cur[h];
        if (m === 0) continue;
        nxt[h + 1] += m * p;
        nxt[h] += m * q;
      }
      hi = hi + 1;
      // At most one state per step can fall below the ruin line (states are
      // win+loss apart and a single loss moves you by `loss`), but loop anyway.
      while (lo <= hi && wealthAt(w0, win, loss, n + 1, lo) < loss) {
        const m = nxt[lo];
        if (m > 0) {
          absorbed.push({ value: wealthAt(w0, win, loss, n + 1, lo), prob: m, step: n + 1 });
          ruined += m;
        }
        nxt[lo] = 0;
        lo++;
      }
      const t = cur;
      cur = nxt;
      nxt = t;
    }
    state.alive = cur;
    state.lo = lo;
    state.hi = hi;
    state.ruined = ruined;
    onStep && onStep(n + 1, state);
  }
  return state;
}

/** Positive root R of p*e^(-win R) + q*e^(loss R) = 1 (the "adjustment coefficient"). */
export function adjustmentCoefficient({ win, loss, p }) {
  const q = 1 - p;
  const drift = p * win - q * loss;
  if (drift <= 0 || q === 0) return drift <= 0 ? 0 : Infinity;
  const f = (r) => p * Math.exp(-win * r) + q * Math.exp(loss * r) - 1;
  let hiR = 1e-9;
  while (f(hiR) < 0) hiR *= 2;
  let loR = hiR / 2;
  if (f(loR) > 0) loR = 0; // only happens if the first guess already overshot
  for (let i = 0; i < 200; i++) {
    const mid = (loR + hiR) / 2;
    if (mid === loR || mid === hiR) break;
    if (f(mid) < 0 || mid === 0) loR = mid;
    else hiR = mid;
  }
  return (loR + hiR) / 2;
}

/**
 * Probability of EVER being ruined if you keep flipping forever, given the DP state
 * after some number of flips. Uses the martingale e^(-R*W): from wealth x the
 * eventual-ruin probability lies in [e^(-R x), e^(-R (x - loss))], because you land
 * somewhere in [0, loss) when ruined. Returns {estimate, lower, upper}.
 */
export function foreverRuinFromState(params, n, state, R) {
  const { w0, win, loss, p } = params;
  if (p >= 1) return { estimate: state.ruined, lower: state.ruined, upper: state.ruined };
  if (!(R > 0)) return { estimate: 1, lower: 1, upper: 1 };
  let lower = state.ruined;
  let upper = state.ruined;
  let est = state.ruined;
  for (let h = state.lo; h <= state.hi; h++) {
    const m = state.alive[h];
    if (m === 0) continue;
    const x = wealthAt(w0, win, loss, n, h);
    lower += m * Math.exp(-R * x);
    upper += m * Math.min(1, Math.exp(-R * (x - loss)));
    est += m * Math.min(1, Math.exp(-R * (x - loss / 2)));
  }
  return { estimate: est, lower, upper: Math.min(1, upper) };
}

/** Quick closed-form estimate of forever-ruin probability starting at wealth w. */
export function foreverRuin(w, params) {
  const { loss, p } = params;
  if (w < loss) return 1;
  if (p >= 1) return 0;
  const R = adjustmentCoefficient(params);
  if (!(R > 0)) return 1;
  return Math.min(1, Math.exp(-R * (w - loss / 2)));
}

function insertSorted(arr, item) {
  let i = arr.length;
  arr.push(item);
  while (i > 0 && arr[i - 1].value > item.value) {
    arr[i] = arr[i - 1];
    i--;
  }
  arr[i] = item;
}

/**
 * Exact distribution over time. Returns per-step arrays (length flips+1):
 *   ruin[n]   P(ruined by flip n)
 *   ahead[n]  P(wealth > starting wealth after n flips)
 *   mean[n], p10[n], median[n], p90[n]
 * plus the final distribution (list of {value, prob, ruined}) and forever-ruin estimate.
 */
export function exactDistribution(params, flips) {
  const { w0, win, loss } = params;
  const N = flips + 1;
  const out = {
    ruin: new Float64Array(N),
    ahead: new Float64Array(N),
    mean: new Float64Array(N),
    p10: new Float64Array(N),
    median: new Float64Array(N),
    p90: new Float64Array(N),
  };
  const sortedAbsorbed = [];
  let absorbedSeen = 0;
  let absorbedValueMass = 0;
  let finalState = null;

  runDP(params, flips, (n, s) => {
    while (absorbedSeen < s.absorbed.length) {
      const a = s.absorbed[absorbedSeen++];
      insertSorted(sortedAbsorbed, a);
      absorbedValueMass += a.prob * a.value;
    }
    let mean = absorbedValueMass;
    let ahead = 0;
    for (let h = s.lo; h <= s.hi; h++) {
      const m = s.alive[h];
      if (m === 0) continue;
      const x = wealthAt(w0, win, loss, n, h);
      mean += m * x;
      if (x > w0) ahead += m;
    }
    // Percentiles: absorbed values (< loss) all sit below alive values (>= loss).
    const targets = [0.1, 0.5, 0.9];
    const res = [NaN, NaN, NaN];
    let ti = 0;
    let cum = 0;
    for (let i = 0; i < sortedAbsorbed.length && ti < 3; i++) {
      cum += sortedAbsorbed[i].prob;
      while (ti < 3 && cum >= targets[ti] - 1e-12) res[ti++] = sortedAbsorbed[i].value;
    }
    for (let h = s.lo; h <= s.hi && ti < 3; h++) {
      cum += s.alive[h];
      while (ti < 3 && cum >= targets[ti] - 1e-12) res[ti++] = wealthAt(w0, win, loss, n, h);
    }
    while (ti < 3) res[ti++] = wealthAt(w0, win, loss, n, s.hi); // rounding fallback
    out.ruin[n] = s.ruined;
    out.ahead[n] = ahead;
    out.mean[n] = mean;
    out.p10[n] = res[0];
    out.median[n] = res[1];
    out.p90[n] = res[2];
    if (n === flips) finalState = s;
  });

  const final = sortedAbsorbed.map((a) => ({ value: a.value, prob: a.prob, ruined: true }));
  for (let h = finalState.lo; h <= finalState.hi; h++) {
    const m = finalState.alive[h];
    if (m > 0) final.push({ value: wealthAt(w0, win, loss, flips, h), prob: m, ruined: false });
  }
  out.final = final;
  out.forever = foreverRuinFromState(params, flips, finalState, adjustmentCoefficient(params));
  return out;
}

/** Ruin-by-step curves for many starting wealths (heatmap rows). */
export function ruinGrid(wealths, flips, params) {
  const R = adjustmentCoefficient(params);
  return wealths.map((w0) => {
    const p = { ...params, w0 };
    const curve = new Float32Array(flips + 1);
    let forever = null;
    let ahead = 0;
    runDP(p, flips, (n, s) => {
      curve[n] = s.ruined;
      if (n === flips) {
        forever = foreverRuinFromState(p, n, s, R);
        for (let h = s.lo; h <= s.hi; h++) {
          if (wealthAt(w0, p.win, p.loss, n, h) > w0) ahead += s.alive[h];
        }
      }
    });
    return { w0, curve, forever, ahead };
  });
}

/** Seeded PRNG so sample paths are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Monte Carlo sample paths. ruinStep[i] = flip at which path i was ruined, or -1. */
export function simulatePaths({ w0, win, loss, p }, flips, count, seed = 1) {
  const rand = mulberry32(seed);
  const paths = [];
  const ruinStep = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) {
    const path = new Float64Array(flips + 1);
    let w = w0;
    path[0] = w;
    let dead = w < loss;
    if (dead) ruinStep[i] = 0;
    for (let n = 1; n <= flips; n++) {
      if (!dead) {
        w += rand() < p ? win : -loss;
        if (w < loss) {
          dead = true;
          ruinStep[i] = n;
        }
      }
      path[n] = w;
    }
    paths.push(path);
  }
  return { paths, ruinStep };
}

// ---------------------------------------------------------------------------
// Utility: how much is ONE flip worth to someone with wealth w?
// CRRA utility with risk aversion gamma: gamma=0 is risk-neutral (pure EV),
// gamma=1 is log utility (Kelly), higher gamma is more risk-averse.
// ---------------------------------------------------------------------------

/** Dollar certainty equivalent of taking one flip at wealth w (positive = worth it). */
export function certaintyEquivalent(w, { win, loss, p }, gamma = 1) {
  const q = 1 - p;
  if (w < loss) return NaN;
  if (gamma === 0) return p * win - q * loss;
  const lu = Math.log1p(win / w);
  const ld = loss >= w ? -Infinity : Math.log1p(-loss / w);
  let lnM;
  if (Math.abs(gamma - 1) < 1e-9) {
    lnM = p * lu + (q > 0 ? q * ld : 0);
  } else {
    const e = 1 - gamma;
    // s - 1 = p*(up^e - 1) + q*(down^e - 1), computed with expm1 for precision.
    const downTerm = q > 0 ? Math.expm1(e * ld) : 0; // ld=-inf: e>0 -> -1, e<0 -> +inf
    const sm1 = p * Math.expm1(e * lu) + q * downTerm;
    if (!isFinite(sm1)) return -w; // gamma>1 and you could hit zero: utility -infinity
    lnM = Math.log1p(sm1) / e;
  }
  if (lnM === -Infinity) return -w;
  return w * Math.expm1(lnM);
}

/** Change in expected log-wealth from one flip at wealth w. */
export function logUtilityDelta(w, { win, loss, p }) {
  const q = 1 - p;
  if (w <= loss) return -Infinity;
  return p * Math.log1p(win / w) + q * Math.log1p(-loss / w);
}

/** Kelly-optimal fraction of wealth to stake, and the wealth at which this bet is exactly Kelly. */
export function kelly({ win, loss, p }) {
  const b = win / loss;
  const f = p - (1 - p) / b;
  return { fraction: f, wealth: f > 0 ? loss / f : Infinity };
}

/**
 * Rescale a bet to a new loss amount, keeping the odds of the anchor bet.
 * The win is rounded to cents, so the odds survive any number of rescales.
 * Pass the bet the user typed (the anchor), not a previously rescaled one.
 */
export function scaleBet({ win, loss }, L) {
  return { loss: L, win: Math.max(0.01, Math.round(((L * win) / loss) * 100) / 100) };
}

/** Smallest wealth at which one flip has a non-negative certainty equivalent. */
export function breakEvenWealth(params, gamma = 1) {
  const { loss } = params;
  if (certaintyEquivalent(loss, params, gamma) >= 0) return loss;
  const MAX = 1e13;
  if (certaintyEquivalent(MAX, params, gamma) < 0) return Infinity;
  let lo = Math.log(loss);
  let hi = Math.log(MAX);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (certaintyEquivalent(Math.exp(mid), params, gamma) < 0) lo = mid;
    else hi = mid;
  }
  return Math.exp(hi);
}

/** Log-spaced numbers from a to b inclusive. */
export function logspace(a, b, count) {
  const la = Math.log(a);
  const lb = Math.log(b);
  return Array.from({ length: count }, (_, i) => Math.exp(la + ((lb - la) * i) / (count - 1)));
}
