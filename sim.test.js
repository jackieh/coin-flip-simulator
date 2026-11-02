import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDP,
  exactDistribution,
  simulatePaths,
  adjustmentCoefficient,
  foreverRuin,
  breakEvenWealth,
  kelly,
  certaintyEquivalent,
  ruinGrid,
  scaleBet,
} from './coin_flip_simulator/static/sim.js';

const base = { win: 1050, loss: 1000, p: 0.5 };

test('total probability is conserved', () => {
  const params = { ...base, w0: 5000 };
  runDP(params, 300, (n, s) => {
    let alive = 0;
    for (let h = s.lo; h <= s.hi; h++) alive += s.alive[h];
    assert.ok(Math.abs(alive + s.ruined - 1) < 1e-9, `step ${n}: ${alive + s.ruined}`);
  });
});

test('starting at $1000, the first flip ruins you 50% of the time', () => {
  const d = exactDistribution({ ...base, w0: 1000 }, 1);
  assert.equal(d.ruin[1], 0.5);
  assert.equal(d.mean[1], 0.5 * 2050 + 0.5 * 0);
});

test('mean grows exactly $25/flip when ruin is impossible', () => {
  const d = exactDistribution({ ...base, w0: 1e7 }, 200);
  assert.equal(d.ruin[200], 0);
  assert.ok(Math.abs(d.mean[200] - (1e7 + 25 * 200)) < 1e-4);
});

test('mean grows by less than $25/flip once ruin is possible', () => {
  // Expected gain per flip is 25 * P(still playing), so mean gain < 25n.
  const d = exactDistribution({ ...base, w0: 3000 }, 100);
  assert.ok(d.mean[100] - 3000 < 25 * 100);
  assert.ok(d.mean[100] - 3000 > 0);
});

test('exact ruin matches Monte Carlo', () => {
  const params = { ...base, w0: 4000 };
  const flips = 200;
  const d = exactDistribution(params, flips);
  const count = 40000;
  const { ruinStep } = simulatePaths(params, flips, count, 42);
  const mc = ruinStep.filter((s) => s >= 0).length / count;
  const se = Math.sqrt((mc * (1 - mc)) / count);
  assert.ok(Math.abs(mc - d.ruin[flips]) < 4 * se, `mc=${mc} exact=${d.ruin[flips]}`);
});

test('log-utility break-even is about $21,000 and Kelly wealth about $42,000', () => {
  const be = breakEvenWealth(base, 1);
  assert.ok(Math.abs(be - 21000) < 1, `break-even ${be}`);
  const k = kelly(base);
  assert.ok(Math.abs(k.wealth - 42000) < 1, `kelly ${k.wealth}`);
  assert.ok(certaintyEquivalent(20000, base, 1) < 0);
  assert.ok(certaintyEquivalent(22000, base, 1) > 0);
});

test('risk-neutral certainty equivalent is the plain EV', () => {
  assert.equal(certaintyEquivalent(5000, base, 0), 25);
  assert.equal(breakEvenWealth(base, 0), 1000);
});

test('forever-ruin estimate is bracketed and agrees with long DP / Monte Carlo', () => {
  const R = adjustmentCoefficient(base);
  assert.ok(Math.abs(R - 4.76e-5) < 0.05e-5, `R=${R}`);
  for (const w0 of [1000, 3000, 10000]) {
    const d = exactDistribution({ ...base, w0 }, 4000);
    assert.ok(d.forever.lower <= d.forever.estimate && d.forever.estimate <= d.forever.upper);
    // After 4000 flips the bounds should be tight.
    assert.ok(d.forever.upper - d.forever.lower < 0.03, `w0=${w0} ${JSON.stringify(d.forever)}`);
    // Closed form (no DP) should be within its own +-R*loss/2 band.
    assert.ok(Math.abs(foreverRuin(w0, base) - d.forever.estimate) < 0.03);
  }
});

test('ruinGrid rows agree with exactDistribution', () => {
  const rows = ruinGrid([2000, 8000], 150, base);
  const d = exactDistribution({ ...base, w0: 8000 }, 150);
  assert.ok(Math.abs(rows[1].curve[150] - d.ruin[150]) < 1e-6);
  assert.ok(Math.abs(rows[1].ahead - d.ahead[150]) < 1e-9);
});

test('rescaling the stake keeps the odds, however far it is dragged', () => {
  assert.deepEqual(scaleBet(base, 10), { loss: 10, win: 10.5 });
  const k0 = kelly(base).fraction;
  const down = Array.from({ length: 61 }, (_, i) => 1000 * 10 ** (-2 * i / 60));
  const up = Array.from({ length: 61 }, (_, i) => 10 * 10 ** (2 * i / 60));
  for (const L of [...down, ...up]) {
    const nice = Math.round(L / 10 ** (Math.floor(Math.log10(L)) - 1)) * 10 ** (Math.floor(Math.log10(L)) - 1);
    const bet = scaleBet(base, nice);
    assert.ok(Math.abs(kelly({ ...bet, p: 0.5 }).fraction / k0 - 1) < 1e-9, `stake ${nice}: ${bet.win}/${bet.loss}`);
  }
  assert.deepEqual(scaleBet(base, 1000), { loss: 1000, win: 1050 });
});
