---
version: 1
slug: "coin-flip-simulator-static-index-html"
primary_target: "coin_flip_simulator/static/index.html"
related_targets: []
---

# Surface brief: coin-flip handbook (index.html)

Scope: the single page of the local simulator. Mode: Read (an explorable handbook), with live instruments.
Audience/job: the owner studying bet sizing, Kelly, utility and risk aversion with their own numbers.
Constraints: light + dark themes with a toggle; local, offline-friendly; math in sim.js/worker.js unchanged.
User additions: Nomogram direction chosen, "but add a ruin table" (starting wealth × flips → P(ruin), your row highlighted).

## Direction contract

THESIS: A handbook of plates, one per concept, each readable with a straightedge: the bet is judged by stake ÷ wealth, not by its dollar edge. Refuses the dashboard of chart cards beside a settings sidebar.

OWN-WORLD: Cool drafting-film ground (dark: blue-black film), one Prussian-blue plate ink for scales, rules and headings, slate secondary ink, and one orange isopleth reserved for things you can drag or change. Condensed Archivo for scale legends and figures, Source Serif for the reading column. Series are told apart by stroke pattern as well as hue. Hairline rules, no cards, no shadows.

STORY: The reader sees that the stake is 100% of their wealth, learns why the average misleads, sees ruin pile up, meets utility and γ, prices the flip in certainty-equivalent dollars, and finishes with Kelly: the wealth at which this exact bet becomes the right size.

FIRST VIEWPORT: A running head with the bet terms and theme toggle. A left rail holds the plate contents and, beneath them, "Your numbers" set as underlined orange fields. The rail is the shared scrubber that drives every plate, so it stays put instead of scrolling away with Plate I. (This was amended after the first finish review. It is the builder's call and has not been confirmed by the user.) The centre column holds Plate I's sentence heading and short serif text. On the right, a large three-scale alignment chart (wealth | fraction at risk | stake) with draggable orange ends and a big read-out of the fraction at risk against the Kelly and break-even marks. On phones the inputs collapse to a one-line summary and each plate's figure follows its first paragraph.

FORM: Nomogram Handbook, #3 on my ordered list, assigned by roll. seed:053736aae491d65e

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
