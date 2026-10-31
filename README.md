# The coin-flip handbook

An interactive handbook about a +EV bet that can ruin you (default: heads +$1050, tails −$1000). Eight plates walk through stake size vs. wealth (an alignment chart / nomogram), average vs. typical outcomes, risk of ruin (with a table of ruin), utility and risk aversion, certainty equivalents, and Kelly bet sizing, all computed live from your own numbers. Your inputs and theme are remembered in the browser.

## Run

    poetry install
    poetry run coin-flip            # prints the URL, e.g. http://localhost:8000/

Options: `--port N` (first port to try; the next free one is used if it's taken),
`--open` (also open your browser), `--host`, `--verbose`. `poetry run python -m coin_flip_simulator` also works.

## Test

    node --test

## Layout

- `coin_flip_simulator/server.py`: tiny stdlib web server (no Python dependencies)
- `coin_flip_simulator/static/sim.js`: exact dynamic-programming ruin/wealth math, Monte Carlo paths, utility (CRRA / Kelly)
- `coin_flip_simulator/static/worker.js`: runs the heavy calculations off the main thread
- `coin_flip_simulator/static/{index.html,style.css,app.js,charts.js}`: UI
- `coin_flip_simulator/static/fonts/`: self-hosted Archivo and Source Serif 4 (OFL; works offline)
- `PRODUCT.md`, `DESIGN.md`, `.impeccable/surfaces/`: design context used by the impeccable skill
- `sim.test.js`: tests for the math
