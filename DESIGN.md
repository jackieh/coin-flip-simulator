---
name: The coin-flip handbook
description: A handbook of plates on drafting film, read with one orange straightedge.
colors:
  drafting-film: "#eef1f3"
  rail-film: "#e4e9ed"
  ink: "#0f1720"
  prussian-plate: "#1d3557"
  slate-ink: "#33414f"
  muted-graphite: "#55626f"
  hairline: "#c3ccd4"
  rule-strong: "#8d9aa7"
  grid: "#d8dee3"
  isopleth-orange: "#d9530a"
  isopleth-wash: "rgba(217, 83, 10, 0.12)"
  series-blue: "#2a6fd0"
  series-green: "#139a74"
  series-magenta: "#c0479c"
  ruin-red: "#b42318"
  plate-zone: "rgba(29, 53, 87, 0.08)"
  dark-film: "#0e151d"
  dark-rail-film: "#121b25"
  dark-ink: "#e7edf3"
  dark-plate: "#a9c6ea"
  dark-slate-ink: "#c0cbd6"
  dark-muted: "#8d9cab"
  dark-hairline: "#263443"
  dark-rule-strong: "#43566a"
  dark-grid: "#1c2733"
  dark-isopleth-orange: "#ff7b33"
  dark-series-blue: "#4b8fe6"
  dark-series-green: "#1fae86"
  dark-series-magenta: "#d562b4"
  dark-ruin-red: "#f0605a"
typography:
  display:
    fontFamily: "Archivo, 'Source Serif 4', system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 84"
  readout:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 700
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 78"
  title:
    fontFamily: "Archivo, 'Source Serif 4', system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.3
    fontVariation: "'wdth' 86"
  figure:
    fontFamily: "Archivo, 'Source Serif 4', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 85"
  entry:
    fontFamily: "Archivo, 'Source Serif 4', system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 88"
  body:
    fontFamily: "'Source Serif 4', Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Archivo, 'Source Serif 4', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 80"
  caption:
    fontFamily: "Archivo, 'Source Serif 4', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  hair: "2px"
  sm: "3px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "18px"
  lg: "28px"
  plate: "56px"
components:
  text-button:
    textColor: "{colors.prussian-plate}"
    typography: "{typography.caption}"
    padding: "4px 0"
  numeric-entry:
    textColor: "{colors.ink}"
    typography: "{typography.entry}"
    padding: "2px 0 3px"
  preset-chip:
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.sm}"
    padding: "3px 7px"
  preset-chip-pressed:
    backgroundColor: "{colors.prussian-plate}"
    textColor: "{colors.drafting-film}"
    rounded: "{rounded.sm}"
    padding: "3px 7px"
  running-head:
    backgroundColor: "{colors.drafting-film}"
    textColor: "{colors.prussian-plate}"
    height: "44px"
    padding: "0 32px"
  rail:
    backgroundColor: "{colors.rail-film}"
    width: "284px"
    padding: "28px 24px 32px"
  tooltip:
    backgroundColor: "{colors.drafting-film}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  plate:
    backgroundColor: "{colors.drafting-film}"
    padding: "56px 48px 64px"
---

# Design System: The coin-flip handbook

## Overview

**Creative North Star: "The Nomogram Handbook"**

The surface is a bound handbook of engineering plates printed on cool drafting film. Each concept gets one plate: a sentence heading, a short serif reading column, and a figure you can read with a straightedge. Everything structural (scales, rules, headings, axes, captions) is drawn in a single Prussian-blue plate ink; everything the reader can move is drawn in one orange isopleth. Light mode is grey-blue film; dark mode is blue-black film with the same roles lifted for contrast.

Density is that of a technical reference, not a dashboard. Plates are separated by full-width plate-ink rules rather than boxed into cards, figures are framed only by a caption rule above them, and numbers are set in condensed Archivo with tabular figures so columns of results line up like a printed table. The rail on the left is the shared scrubber for every plate: contents above, "Your numbers" below, set as underlined orange fields.

The world rejects the chart-card dashboard beside a settings sidebar: no cards, no shadows, no filled panels around figures.

**Key Characteristics:**
- One plate ink (Prussian blue) for all structure; one orange for the reader's own position and controls.
- Hairline rules, no cards, no shadows, near-zero radii.
- Condensed Archivo (width axis 72–90%) for scales, figures and captions; Source Serif 4 for reading.
- Series told apart by stroke pattern (solid, dashed, dotted) and direct labels as well as hue.
- Every chart label is knocked out of the ground with a 4px ground-coloured halo.

## Colors

A cool, near-monochrome drafting palette: film grounds, one blue ink at two strengths, and a single hot orange.

### Primary
- **Prussian Plate Ink** (prussian-plate; dark: dark-plate): headings, scale lines and ticks, axes, figure-caption rules, the running-head rule, plate-separating rules, presets in the pressed state, `code`. It is the voice of the plate itself.

### Secondary
- **Isopleth Orange** (isopleth-orange; dark: dark-isopleth-orange): the straightedge on the alignment chart, its drag handles, the underline of every editable field and text button, slider thumbs, the crosshair over a hovered flip, the "you" line or dot in every chart, the focus ring and caret. Its tint **Isopleth Wash** highlights the reader's row in the table of ruin and text selection.

### Tertiary
- **Ruin Red** (ruin-red; dark: dark-ruin-red): ruin and loss only: negative ledger figures, broke players' paths and bars, the off-scale warning, and the diagonal hatch over forbidden zones.

### Data series
- **Series Blue / Green / Magenta** (series-blue, series-green, series-magenta; dark variants alongside): the three data series, validated on the film grounds. They are always paired with stroke patterns: series one solid, two dashed (7 5), three dotted (1.5 4.5).
- **Sequential plate ramp** (8 steps from film to deep Prussian; light `#eef1f3 → #12335f`, dark `#0e151d → #b9d1ef`): the ruin heatmap only.

### Neutral
- **Drafting Film** (drafting-film; dark: dark-film): page ground, tooltip ground, and the halo colour behind chart text.
- **Rail Film** (rail-film; dark: dark-rail-film): the rail, one step darker than the page.
- **Ink** (ink; dark: dark-ink): body text and the big read-outs.
- **Slate Ink** (slate-ink; dark: dark-slate-ink): secondary text, ledger terms, legends.
- **Muted Graphite** (muted-graphite; dark: dark-muted): hints, units, notes, zero cells, plate numerals.
- **Hairline** and **Rule Strong** (hairline, rule-strong): row dividers and chip borders; **Grid** for chart gridlines; **Plate Zone** (8% plate ink) for the shaded "your flips" column and chart zones.

### Named Rules
**The One Straightedge Rule.** Orange marks the reader: their inputs, the handles and lines that move them, and where they stand in each chart and table. Nothing else is orange; a decorative orange element is a bug.

**The Plate Ink Rule.** All structure is one blue ink. Headings, scales, axes and rules never borrow a series hue.

**The Pattern-Plus-Hue Rule.** A data series is never identified by colour alone; it carries a stroke pattern and a direct label or legend mark drawn with the same dash.

## Typography

**Display Font:** Archivo variable (width 62–125%, self-hosted), falling back to Source Serif 4 then system-ui
**Body Font:** Source Serif 4 (latin + greek, roman + italic, self-hosted), falling back to Georgia

**Character:** A condensed engineering grotesque for everything that is measured or labelled, against a calm optical-size serif for everything that is explained. Greek (γ) and italic variables are set in the serif even inside sans contexts.

### Hierarchy
- **Display** (700, 34px, 1.08, width 84%, −0.015em; 28px under 860px): plate sentence headings in plate ink, balanced wrap, preceded by a muted roman plate numeral.
- **Readout** (700, 46px, width 78%, tabular): the alignment chart's fraction-at-risk read-out.
- **Title** (700, 19px, 1.3, width 86%): sub-headings inside a plate (table of ruin, method).
- **Entry** (600, 22px, width 88%, tabular; 17px inside the bet fieldset): editable numbers in the rail.
- **Figure** (650, 20px, width 85%, tabular): ledger values.
- **Body** (400, 17px, 1.6): reading column, capped at 25rem beside a figure and 68ch when single-column.
- **Label** (700, 13px, width 80%, 0.06em, uppercase): figure captions and rail headings (rail headings run 800, width 75%, 0.12em).
- **Caption** (500, 13px, 1.45): legends, chart notes, tooltips, hints.

### Named Rules
**The Measured Things Are Condensed Rule.** Any number, scale label, or caption is Archivo with tabular figures; prose is never set in Archivo and numbers are never set in the serif.

**The Width Axis Is the Hierarchy Rule.** Rank is carried by width and weight within Archivo (72–90%), not by adding faces.

## Layout

A two-column book: a 284px sticky rail (contents, then "Your numbers") beside the plates, under a 44px sticky running head that carries the bet terms, the current plate ("Plate I of VIII"), and the theme toggle. Each plate is a two-column grid: a reading column (minmax(300px, 25rem)) and the figure, 56px apart, padded 56px 48px 64px, closed by a 1px plate-ink rule. Full-width additions inside a plate (the table of ruin) span both columns.

At 1180px and below each plate becomes one column and the figure is reordered to follow the heading and first paragraph. At 860px and below the running head drops to 40px and keeps only the title and toggle, the rail un-sticks, the contents become a horizontal scroller, and "Your numbers" collapses to a one-line summary with an Edit/Done disclosure. The alignment chart shrinks from 700px to 520px tall and gains a text key.

Rhythm runs in 6, 12, 18, 28 and 56px steps.

## Elevation & Depth

Flat. There are no shadows anywhere. Depth is tonal and linear only: the rail sits one film step darker than the page, the sticky running head is opaque film with a plate-ink bottom rule, and the tooltip is film with a 1px plate-ink border. In charts, separation comes from the 4px ground halo behind every label and the 7px ground halo under the isopleth.

### Named Rules
**The Drafting-Film Rule.** No box-shadow, no cards, no filled panels. If something must stand forward, give it a plate-ink rule or a tonal step, never a shadow.

## Shapes

Rectilinear drafting geometry. Radii are a hair (2px for focus rings, legend swatches, ramps) or small (3px for preset chips and the tooltip); the only full circles are the things you grab: slider thumbs, drag handles, chart dots. Lines carry the form: 1px hairlines between rows, 1px plate-ink rules under captions and between plates, 2px plate-ink rules under table headers, and 2px orange underlines beneath editable values. Forbidden regions use a 45° diagonal hatch in ruin red at 35% opacity, the same pattern in SVG and canvas.

## Components

### Buttons
Words, not boxes.
- **Text button:** Archivo 600 14px in plate ink, no background, a 2px orange underline offset 5px; hover darkens to ink; disabled goes muted and drops the underline. Used for the theme toggle, "Draw new runs", and "Reset to defaults" (right-aligned on the "Your numbers" heading line, disabled while every number is already at its default).
- **Preset chip:** 1px rule-strong border, 3px radius, 600 12px tabular; hover borders in plate ink; pressed fills plate ink with film text.

### Inputs / Fields
- **Numeric entry:** no box. A 2px orange bottom border under a condensed tabular number with a muted unit; on focus the underline turns plate ink and the 2px orange focus ring appears.
- **Range slider:** a 1px plate-ink track with a 14px orange thumb ringed in rail film.
- **Select:** same underlined treatment as the entry, at 15px.

### Navigation
- **Running head:** sticky, film ground, plate-ink bottom rule; uppercase condensed title (800, width 78%), slate bet terms, tracked uppercase plate locator.
- **Plate contents:** a ruled list, roman numerals (700, width 72%) in a 40px column; the current plate's text goes ink and 600 weight. Becomes a horizontal scroller on phones.

### Figures
- **Caption:** uppercase label in plate ink over a 1px plate-ink rule, with a muted right-aligned qualifier ("exact", "after 500 flips").
- **Legend marks:** 26×10 SVG strokes drawn with the series' own dash (2.5px, or 1.25px for reference lines), 12px swatches for bars, an 18% wash swatch for bands.
- **Tooltip:** film ground, 1px plate-ink border, 3px radius, plate-ink head, rows with a 10×3 series mark.

### Ledger
A definition list ruled in plate ink at the top and hairlines between rows: slate 14px term left, condensed 20px tabular value right, ruin red for negatives.

### Alignment Chart (signature)
Three parallel plate-ink scales (wealth, fraction at risk, stake) with major and minor ticks, a heavy orange straightedge (2.5px over a 7px ground halo), orange drag handles that grow on hover and drag and take arrow keys, a hollow orange crossing marker, hatched forbidden zones, and the large read-out against Kelly and break-even marks.

### Table of Ruin
Right-aligned tabular cells with hairline rows, uppercase condensed plate-ink headers over a 2px plate-ink rule, the reader's flip column shaded in plate zone and the reader's wealth row washed in isopleth orange.

## Do's and Don'ts

### Do:
- **Do** draw every scale, axis, heading and structural rule in plate ink (#1d3557 light, #a9c6ea dark).
- **Do** reserve orange for the reader's inputs, the controls that change them, and the reader's own position in every chart and table.
- **Do** give each data series a stroke pattern (solid, dashed 7 5, dotted 1.5 4.5) and a direct label as well as its hue.
- **Do** knock chart text out of the ground with a 4px halo so lines never cut through labels.
- **Do** set numbers in condensed Archivo with tabular figures.
- **Do** mark ruin and loss in ruin red, and forbidden zones with the 45° red hatch.

### Don't:
- **Don't** put figures in cards, filled panels, or anything with a shadow.
- **Don't** use orange for decoration, emphasis, or status that the reader cannot move.
- **Don't** set orange as small text on the light film; at 3.6:1 it is a mark colour, not a text ink.
- **Don't** tell series apart by hue alone; the validated palette needs its stroke patterns in the 6–8 contrast band.
- **Don't** introduce a third typeface or a system display face.
