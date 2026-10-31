# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
One person: the owner, using it to think. The question that started it was a real offer: a coin flip that pays +$1050 on heads and costs −$1000 on tails, with only $1000 to stake, so that one tails is a wipeout that feels close to death. They use the tool alone, at a desk, to build intuition, and it should not need an onboarding flow.

## Product Purpose
It teaches the owner the finance concepts that decide whether a positive-expected-value bet is worth taking: risk of ruin, expected value versus median outcome, utility functions (log, CRRA), risk-aversion coefficients, certainty equivalents, and Kelly-optimal bet sizing. It succeeds when the owner can explain *why* the bet is bad at $1k and fine at $100k, and how the size of the bet relative to wealth changes that, using the tool's own numbers.

## Positioning
Every number is computed exactly (a dynamic program over heads count), not sampled, and the computation runs live in the browser as the owner changes the inputs. Monte Carlo is used only to draw illustrative paths.

## Operating Context
- It runs locally: `poetry run coin-flip` serves the static files from `coin_flip_simulator/static/` and prints the URL.
- The math lives in `sim.js`, has no DOM dependencies, and is tested with `node --test`. A Web Worker runs the heavy grid.
- It is used for desktop study sessions: changing one input and watching the consequences move.

## Capabilities and Constraints
- **Inputs:** starting wealth, win amount, loss amount, heads probability, number of flips, risk aversion γ (CRRA), and number of sample paths.
- **Exact outputs, per flip:**
  - P(ruin), P(ahead), mean, median, and the 10th and 90th percentiles;
  - the final-wealth distribution;
  - P(ruin) if you keep flipping forever (Lundberg bound);
  - the ruin heatmap over starting wealth × flips;
  - certainty equivalent under CRRA;
  - log-utility break-even (≈ $21k for the default bet);
  - Kelly fraction and Kelly wealth (≈ $42k).
- **Ruin rule:** you are ruined when wealth falls below the loss amount.
- **Must keep:** both the light and dark themes, including a user toggle (confirmed).
- **Free to change:** everything else, including which charts exist (confirmed: "nothing's sacred").

## Evidence on Hand
All figures come from `sim.js` and are verified in `sim.test.js`. There is no external content, testimonials or data, and none should be fabricated.

## Product Principles
- Teach through the owner's own numbers: every concept is shown moving with the live inputs, never as a static definition.
- Exact over approximate, and say which is which.
- Put the mean and the typical outcome side by side, every time.
- The gut feeling ("losing everything is close to death") is treated as a legitimate preference to be formalized (utility, γ), not dismissed.
