# Coin flip: worth it?

Interactive explorer for a +EV bet that can ruin you (default: heads +$1050, tails −$1000).

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
- `sim.test.js`: tests for the math
