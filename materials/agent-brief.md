# Agent brief - shared by every fan-out page of learn-digital-twins-with-phoebe

You are writing ONE static HTML session page. No servers, no npm. **If your target file already
exists on disk, do not write it; report that and stop.** Write the file, return its path and one
line of coverage. No HTML in your reply.

## Read first, in this order

1. The template page for YOUR track. Copy its structure, classes, SVG grammar, widget markup and quiz
   markup EXACTLY, including 3 options per question:
   - Leader track: `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-digital-twins-with-phoebe/courses/a1-a-twin-is-a-promise-to-stay-in-sync.html`
   - Practitioner track: `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-digital-twins-with-phoebe/courses/p1-anatomy-of-a-twin.html`
   - The bench page (how a page uses the engine): `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-digital-twins-with-phoebe/courses/p10-the-twin-sync-bench.html`
2. The source map: every verified number, its evidence tier, per-session coverage, the seams, the bench
   canon. Use ONLY its numbers; never invent a statistic; if a fact is missing, teach the uncertainty.
   `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-digital-twins-with-phoebe/materials/official-course-map.md`
3. The stylesheet `:root` block for the palette tokens (first 30 lines):
   `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-digital-twins-with-phoebe/assets/style.css`
4. If your page uses the engine: `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-digital-twins-with-phoebe/assets/dtw-live.js`
   API: `DTW.ladder({seed})` -> {rungs[design, calib, kalman], anti, brk, cal[6]{kU,kC,rmse}, truthK{kU,kC},
   sensorRmse, trueSaving{base, setback, saving}}; each rung has rmse, energy, eTrue, eErr, eBase, saving,
   floors[6]; the kalman/anti/brk rungs also have cover, width, flagged[], floors[i].{cover, width, gain,
   shift{w1, w2, delta, z}}. `DTW.custom(sensorSdAssumed, brk, {seed})` -> one Kalman rung.
   `DTW.world(seed, brk)` -> {to, sol, occN, qlog[f], meas[f], truth[f], n}; `DTW.calibrate(W, f)`;
   `DTW.params(f, kU, kC)`; `DTW.step(p, [ti, tm], to, q)`; `DTW.kalman(W, f, p, DTW.DEFAULTS)` ->
   {ti, x, P, innov, gain}; `DTW.update(x, P, y, r)`; `DTW.selfTestResult`. Load it with
   `<script src="../assets/dtw-live.js?v=1"></script>` BEFORE app.js. Any number your prose quotes from
   a widget must be computed first: `cd` to the repo and run `node -e "var D=require('./assets/dtw-live.js'); ..."`.

## Page skeleton (keep every component, in the template's order)

toolbar (crumb EXACTLY "learn-digital-twins-with-phoebe / Leader session N of 6" or
"/ Practitioner session N of 10", linked as in the template, #toggle-all, #zoom-toggle) · masthead
(eyebrow "Learn Digital Twins with Phoebe · Leader session N of 6" or "· Practitioner session N of 10",
h1 with one `<span class="accent">`, .sub, .chip-row with the level chip (🟢 Foundations, 🟡 Working depth,
🟠 Advanced, matching the card colour on the landing page), two audience chips and the time chip, .agenda
a1-a4) · main.wrap · section#intro (Part 0: kicker, .lede, .legend pills, .callout.win "★ What you walk
out with tonight.", one open details.card with a `.callout.example` "Real world", one self-study card) ·
3 Parts, each `section.section#part-N` with section-kicker (klabel "Part N · covers ...", h2,
`.tag.concept "N min live"`), a `.lede`, ONE figure, `details.card` accordions (summary: `.mode.live` or
`.mode.self`, title, `.mini`, `.caret ▶`) · ONE live widget (`div.wk` with wk-head / wk-body / wk-foot,
as in the templates) in one of the Parts, computed in the page, constructed inputs declared in its wk-hint
or wk-foot · the build-along (leader pages: Part 3 is the build-along as in a1, `.tag.demo "★ 17 min ·
everyone builds"`, no code; practitioner pages: section#demo-1 after Part 3 as in p1, `.tag.demo "★ 22
min · everyone builds"`) with .lede, ONE figure, `.steps > .step > div > h4 + p`; practitioner steps
carry a `.prompt-box.good` with a `span.label` BELOW the p · section#quiz (3 x `.quiz-q
data-answer="0-based"`, `p.qtext`, three `button.qopt` "A · ...", `p.qwhy`; one `div.quiz-score` after
the last; vary the correct letter) · section#homework (leader: .steps like a1; practitioner: an `ol` of
4 items like p1) · section#official, h2 EXACTLY "What this session teaches, and where it came from",
`.covered > .covered-row` (pill solid ✓ / inkpill ◐ / light ○ + name + note), then `<p class="mono">Every
fact on this page, and its verification tier, is recorded in the course's source map.</p>` ·
section#cheatsheet (h2 "Cheat sheet", `.cheat` of eight `.cheat-item`) · `.callout.next` with `.nx-pill`
"Next session" · footer.pagefoot · scripts as the template.

Head: the template's social meta block with this page's own title/description/url;
`<title>Leader session N · Title - learn digital twins with phoebe</title>` (or Practitioner);
`<link rel="stylesheet" href="../assets/style.css?v=1">`. Nothing else external.

First `details.card` in the intro and the first card in Part 1 are `open`; the first card in other Parts
may be open as in the templates. Sentence case headings. Warm practitioner voice, concrete, never dry.
Inside prompt-boxes and widgets escape `&` `<` `>`. 450 to 700 lines is guidance about depth, never a
target: never collapse whitespace, dissolve a list into a paragraph, or drop a component to fit.

## Hard rules (a violation is rework)

- NEVER an em dash or en dash, anywhere (prose, code, aria-labels, comments). Hyphen only.
- No meta text: never "this course", "in this course", "the course teaches", "banned here". State
  the professional norm directly with its reason. The two exact estate phrases above are the only
  self-references; "session 5" / "practitioner session 7" cross-references are fine.
- Attribution "by Phoebe Fu". Never "built with" a tool.
- Every number comes from the map or is labelled constructed. A widget may compute new constructed
  numbers; prose may quote ONLY numbers the map records or that your widget prints at its default
  settings (compute them with node and the engine before quoting). For constructed data print "your
  numbers will differ", never invented outputs as if run.
- Practitioner code: if you show an "Output" box, you must have run the code (python3 -I from a scratch
  directory under /private/tmp, never the repo) and copied the output exactly. Otherwise show no output
  block, say "run it and read the output".
- Contested or missing evidence: teach the disagreement; never resolve what the literature has not.
  Savings attributed to twins and dates for "autonomous" twins are contested: no page gives a savings
  percentage from the literature or a date. Kittiwake's constructed savings (20.1 true, 21.5 calibrated
  twin, 23.9 design twin) are fine, labelled constructed.
- Citations as the map's appendix: body/author and year; paywalled standards say "reported".
- NEVER "lottery" or "lotteries"; say the mechanism.
- Default to English words; no Chinese terms.
- NO company names, vendor names, platform or product names, prices, market sizes, named buildings or
  incidents, or roadmaps. Name research by author/body and year. Not legal or compliance advice. Not
  investment advice anywhere money is near (energy cost, savings, budgets: say it once on the page).
- Titles, widget ids and class names must not collide with siblings: use ONLY the prefix scheme below.
  The family title "Why the warehouse playbook breaks here" for a5 is deliberate.
- Kittiwake Hall is CONSTRUCTED: say so on the page (masthead .sub and wherever its numbers appear).
- Seams: link, never reteach. Sensors/clocks/sampling/missing data -> learn-iot-data; city-scale data,
  sensor placement, consent -> learn-smart-city; sim-to-real for manipulation -> learn-physical-ai-robotics;
  forecasting methods -> learn-timeseries-forecasting; detectors -> learn-anomaly-detection.

## Figure grammar (hand-drawn, every figure)

Palette, ONLY these hexes (no invented greys): ink `#10202F` · deep `#033F6E` · primary `#045C9F` ·
mid `#2E6FAB` · soft `#B9D4EE` · tint `#EDF4FB` · muted `#4A5A6A` · faint `#C6D2DD` · hairline `#E3EAF1` ·
copper `#C8733A` · copper tint `#FBEFE5` · copper text `#8A4316` · `#FFFFFF` · universal reds
`#991B1B` `#FEF2F2` `#FCA5A5` only for a wrong-way panel.
Text on fills: INK ONLY on copper `#C8733A` (deep, primary, muted and white all FAIL on copper); ink on
white/tint/soft/copper tint/hachure; WHITE only on primary `#045C9F` and deep `#033F6E`. Never text on mid
`#2E6FAB` or faint. Muted text only on white, tint or copper tint. Value text (deep) only on white/tint.

- `<figure class="zoomable">` > `<svg viewBox="0 0 880 H" xmlns="http://www.w3.org/2000/svg" role="img"
  aria-label="the data, not the shape">` > `<defs>` + `<style>` + content, then
  `<figcaption>🔍 Click to zoom - takeaway</figcaption>`. Grow H, never W.
- Prefix unique per figure, used for every class and id: `kwk` + page id + letter, e.g. `kwka2a`,
  `kwka2b`, `kwkp7a`. Widget ids: `kwk<page>-name`, e.g. `kwkp7-band`. No other prefixes.
- `<defs>` holds three things with the figure prefix P: a wobble filter `id="PSk"`
  (`feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="<int>"` +
  `feDisplacementMap scale="2.4" xChannelSelector="R" yChannelSelector="G"`, `x="-3%" y="-3%"
  width="106%" height="106%"`), a hachure pattern `id="PHc"` (7x7 userSpaceOnUse, rotate(-38), one
  `#045C9F` line, opacity .5), an open arrowhead `id="PAr"` (path `M1 1 L9 5 L1 9`, fill none, ink stroke
  1.6). ALL shapes sit inside ONE `<g filter="url(#PSk)" fill="none" stroke="#10202F" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round">`; rects carry a tiny rotation (under 1 degree for
  panels). Fills: white, tint, the hachure for "the pile" or "the data", and copper ONLY for the one
  thing the figure is about. One doodle anchor per figure (a thermometer, a building, a radiator, a
  window), simple strokes, never a mascot. Text classes: `.PH` 800 12px ink heading · `.PL` 600 12px
  ink label · `.PS` 400 11px muted · `.PK` 400 11px ink (use on copper or hachure fills) · `.PV` 800
  16-20px deep value (never on copper) · `.PW` 800 12px white on a primary/deep fill · `.PA` 700 11px
  primary axis caption · `.PN` 400 12px muted note.
- ALL `<text>` OUTSIDE any filtered group, `font: ... Inter, sans-serif`, never below 10.5px.
- Fit: max chars ≈ (box width - 20) / 7 at 12px, 6.4px/char at 11px; full-width note under 110 chars;
  40px between neighbouring point labels; bottom note 22px below the last row, H clears it by 8px. No
  path may cross a label (the gate flags line-through-text): route lines around labels and put line
  labels beside, never on, the line. When in doubt, shorten.
- Floor: one figure per Part plus one in the build-along (4 figures). Draw the MECHANISM (heat paths
  between room, mass and outdoors; the drawn versus built wall; the prediction, reading and correction;
  the band around a forecast; the surprise stepping up after a change; the chain from model version to
  decision), never a metaphor literally, never decoration.

## Voice and honesty

Every Part gets a real-world story from the map's research (by author/body and year). Kittiwake is
constructed and says so. Standards are described as reported where the map says so.

## Cross-links (absolute URLs, only these)

- https://phoebefu6.github.io/learn-iot-data-with-phoebe/ (sensors, clocks, sampling, missing data, RUL)
- https://phoebefu6.github.io/learn-smart-city-with-phoebe/ (city-scale, sensor placement, consent)
- https://phoebefu6.github.io/learn-physical-ai-robotics-with-phoebe/ (sim-to-real for robots)
- https://phoebefu6.github.io/learn-timeseries-forecasting-with-phoebe/ (forecasting methods)
- https://phoebefu6.github.io/learn-anomaly-detection-with-phoebe/ (detectors)
- Hub: https://phoebefu6.github.io/learn-with-phoebe/
Internal links use relative file names from the list below.

## Footer chain and session titles

Footer `<p>`: "Leader session N of 6 · learn-digital-twins-with-phoebe · by Phoebe Fu &nbsp;·&nbsp;
📚 <a href="https://phoebefu6.github.io/learn-with-phoebe/">Learn with Phoebe ↗</a>" (Practitioner
session N of 10 likewise). `nav.pagenav`: "← Prev: <title>" and "Next: <title> →"; a6 next is
"Course home →" to ../index.html; p9 next is p10.

Leader (files in courses/; h1 text is the title):
- a1-a-twin-is-a-promise-to-stay-in-sync.html · A twin is a promise to stay in sync
- a2-fidelity-is-a-choice.html · Fidelity is a choice, not a virtue
- a3-the-as-built-gap.html · The as-built gap
- a4-reading-a-digital-twin-claim.html · Reading a digital twin claim
- a5-why-the-warehouse-playbook-breaks-here.html · Why the warehouse playbook breaks here
- a6-from-warehouse-to-digital-twins.html · From warehouse to digital twins: the transfer map
Practitioner:
- p1-anatomy-of-a-twin.html · Anatomy of a twin
- p2-physics-data-or-both.html · Physics, data or both
- p3-calibrating-a-model-to-measurements.html · Calibrating a model to measurements
- p4-the-kalman-filter-by-hand.html · Keeping state in sync: the Kalman filter by hand
- p5-model-drift-or-asset-drift.html · When the model drifts and when the asset does
- p6-the-change-log-is-a-data-source.html · The change log is a data source
- p7-what-if-runs-with-honest-bands.html · What-if runs with honest bands
- p8-twin-governance.html · Twin governance: versions, owners, who may act on it
- p9-closing-the-loop.html · Closing the loop
- p10-the-twin-sync-bench.html · The twin sync bench

## Before you return

Self-check your file: no em/en dash (grep for U+2014 and U+2013), every `<details>`/`<section>`/`<figure>`/
`<svg>`/`<text>` balanced, every hex in figures is from the palette list, no non-ink text on copper, every
figure prefix unique and used only in its figure, quiz has exactly 3 questions and one quiz-score. Then
return the path and one line of coverage, plus any source you read that the map lacks and any
contradiction you saw with another page.
