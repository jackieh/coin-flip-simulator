// Runs the heavy exact calculations off the main thread.
import { exactDistribution, simulatePaths, ruinGrid, logspace } from './sim.js';

self.onmessage = (e) => {
  const { id, params, flips, pathCount, seed, gridRows, tableWealths } = e.data;
  const dist = exactDistribution(params, flips);
  const sample = simulatePaths(params, flips, pathCount, seed);
  self.postMessage({ id, type: 'main', dist, sample });

  const gridWealths = logspace(params.loss, params.loss * 1000, gridRows);
  const grid = ruinGrid(gridWealths, flips, params);
  const table = ruinGrid(tableWealths, flips, params);
  self.postMessage({ id, type: 'grid', grid, table });
};
