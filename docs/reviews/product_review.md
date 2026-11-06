# predictit web terminal — product review

Scope: `apps/web` (React 19 + TypeScript, no libraries, CSP `default-src 'self'`), the contract in `apps/web/src/api/types.ts`, and the engine outputs it renders (`packages/engine/src/decisions/summary.ts`, `decisions/decide.ts`, `closing/strikeFlip.ts`). Screenshots reviewed: Dash (desktop and 390px), Today (desktop and 390px), Closing (pre-window), Gamma, Lean, Settings, Setups, Performance, Positions.

The code moved while this was written: the engine now evaluates SPX and SPY natively (`DecisionRecord.instrument`, `CleanSummary.instrument`, `CleanSummary.cross`), `ServerState` gained `instruments` and `indices`, the status bar gained an instrument toggle, and the Dash gained a Cross-market tile. Line references below are to the files as they are now.

The owner's asks, restated as the test for every screen: up or down, call or put, which contract, how far it can move, when to sell, where support and resistance are. Brief Dash. Clean UI. Works on a phone.

## 1. Overall verdict

The engine already produces the clean answer. `buildSummary` composes action, contract, expected move, when-to-sell, S/R and risks into `CleanSummary`, and `decide` keeps the record immutable with a TTL. The UI then shows that answer three to four times per screen in slightly different words, surrounds it with research plumbing (validation chips, weights mode, inputs digest, learner parameters), and leaves the two things a trader acts on, "when to sell" and "where I am wrong", as prose lists or missing from the Dash.

The visual system is sound: tokens, dark and light themes, tabular numerals, focus rings, reduced-motion support, a sensible 208px rail that becomes a drawer. The problems are hierarchy, duplication, labelling, the absence of any alerting, and a poll payload that is about to triple. None of the fixes need a library.

## 2. Information hierarchy per view

### Dash (`src/views/Dash.tsx`)

Fifteen tiles of equal weight. The top row (Action, Lean, Expected move, To close; lines 108–123) is the right idea. From the second row down it becomes a data sheet.

Cut:

- The Timeframes tile when `mtf` is null (lines 151–153 render a tile whose only content is `n/a`).
- The Market tile's six regime words `γ negative · Vol normal · Trend unknown · Partic. narrow · Liq. good · Data high` (lines 160–165). That is the regime panel's vocabulary, not a glance.
- The new Cross-market tile (lines 139–150): seven index quotes with 15-minute returns and the `cross.text` sentence. The Dash header comment says "numbers and labels only; every sentence lives on Today". Keep the one-word `cross.label` in the status line and move the index list to Today's Market detail.
- `prior` in the Lean sub (line 110; it is `weightsMode`, an internal flag).
- The footer `prospective · decision v244` (lines 180–182). `validation` here is the lean's scoring state, not a claim about the decision.

Merge:

- Entry, Invalidation, Target and Exit (lines 127–130) into one line under the contract, with units. Four tiles of one number each is the wrong density.
- Resistance and Support (lines 133–136) into a single ladder with the spot in the middle, or better, the price-ladder strip proposed in section 3.

Promote:

- "When to sell". `summary.whenToSell` and `contract.entryCondition` are never read on the Dash. That was the owner's third ask.
- The open position. In `MANAGE` state the Action tile says MANAGE, the Contract tile says `no contract`, and the position is a small tile at the bottom (lines 175–177) that only shows `positions[0]`.

Fix:

- Lines 127–130 read from `d.primary` regardless of `d.state`, so the Dash can say `PASS` or `WAIT` beside `Entry 7397.5–7401.0 · Invalidation 7394.0 · Exit 35m`. A forming or armed candidate is not a plan.
- Line 93 takes `spot` from `s.spx` even when the toggle selects SPY, while `move`, `sm.support`, `sm.resistance` and the contract come from the projected SPY decision (`src/api/context.tsx` `projectState`). With SPY selected the expected-move sub prints an SPX spot plus or minus a SPY sigma. Today does this correctly (`src/views/Today.tsx` lines 33–35); the Dash must do the same.

### Today (`src/views/Today.tsx`, `src/components/SummaryCard.tsx`)

The hero says the same thing four ways: `BUY CALL` (h1, line 27), `lean UP (moderate, 80% of voting indicators agree) · BUY CALL` (headline, line 29), the `UP · moderate` chip with `80% agree, score 0.45, prospective` (lines 32–37), `BUY CALL — Key-level reclaim / rejection (triggered); risk $150/contract at the ask.` (actionText, line 43), and the LeanStrip at the bottom repeating `lean UP · moderate 80% of voting indicators agree, 21 available prior weights (burn-in)` (line 114).

The contract fact shows `SPY 2026-11-06 738 C` with the meta `SPY 2026-11-06 738C (Δ 0.48)` beneath it (line 47). Expected move is three facts (lines 65–70) that duplicate the market strip's `Expected move to close ±37.7 1σ pts` directly above. "When to sell" lists `Time stop 35 min` and `Time stop: 35 min after entry (flat scenario return −17%)`, `Invalidation close` and `Invalidation: Close back below…`. That duplication is produced in `summary.ts` lines 63–66 (it pushes `exitRules` and then appends its own invalidation and time-stop lines) and the card renders it raw.

Cut: headline, actionText, the bottom LeanStrip, the `GapCalendarLine` (`Null fill p 37%` is a research term on the hero), the `score` and `prospective` words.

Merge: the hero's two S/R ladders with the "Key levels" ladder in Market detail. Same levels, two presentations 1000px apart. Keep one ladder, with the S/R strength text folded in as a column.

Promote: the price chart. It sits inside the collapsed Market detail below the Decision record. It is the one picture that shows price against the levels. Put it directly under the hero. Also fix its x-domain: `PriceChart.tsx` lines 78–85 always span 09:30–16:00, so a session with bars since 13:05 draws candles in 15% of the width.

### Setups (`src/views/Setups.tsx`)

Reasonable as a drill-down. The candidate card repeats `unvalidated` and the family id as chips. The Ranked contracts table is the only place `atFlat`, `atTarget`, `atInvalidation`, `rewardRisk` and `breakevenWinRate` appear, and those are the numbers a trader wants beside the contract on the Dash. Promote the ranked table above the candidate cards when a setup is triggered; keep "Why no setup, per family" at the bottom, it is good.

### Lean (`src/views/Lean.tsx`)

Two 31-row tables (votes; weights versus prior) with the weight column in both. Merge into one table with a weight / prior / scored / hit column group. Move the explanatory paragraph in the view head into a help disclosure. The score bar is the one gauge-like element in the app; replace it with the count form (`15 for, 4 against, 2 abstain`).

### Gamma (`src/views/Gamma.tsx`)

Ten stat tiles, two charts, a 5-row sensitivity table, a 35-row by-expiry table and an assumptions block. For the owner's questions four numbers matter: call wall, put wall, zero-gamma estimate, net sign. Make those the first row. Collapse by-expiry to the first five rows with "show all"; put sensitivity and assumptions under a disclosure. It can stay a long research page, but the top must answer first.

### Closing window (`src/views/Closing.tsx`)

Covered in section 5. Before the window it shows a paragraph of prose and the method notes; fine as a help page, wrong as a workspace. With SPY selected it shows a one-paragraph refusal (line 24); that is correct, but it should still show the countdown.

### Positions (`src/views/Positions.tsx`)

Covered in section 6.

### Performance (`src/views/Performance.tsx`)

With zero trades it renders about 25 tiles of `n/a` and five "No trades" panels. Collapse the empty state to one line per section (`0 closed trades · 0 graded recommendations · 0 graded closing sessions`) until there is data. The small-sample banner is right; keep it.

### Settings (`src/views/Settings.tsx`)

Fine. The theme toggle exists in both the rail footer and the Appearance panel; keep one. The Closing window panel has 13 numeric fields with no grouping; group into Timing, Quote filters, Model. The Schwab three-step flow is clear.

### Replay (`src/views/Replay.tsx`)

Fine as a research tool. The date option text (`2026-11-06 — 812 snapshots, 180 decisions`) is good; the scrubber and the recorded-decisions timeline are the right controls.

## 3. The Dash: first two seconds

What a trader reads in two seconds, in order: the action in one word and one colour; the contract and what it costs; where the idea is wrong (invalidation) and where it pays (target, or the expected-move band); how much time is left (to close, or to the time stop); whether the numbers are live. Everything else is a second glance.

Proposed Dash, identical order on desktop and phone:

1. Action strip. `BUY CALL` · `SPY 739C` · `1.18 / 1.19` · `risk $119` · `LIVE` · `2:05:51 to close`. One line, state colour on the left edge, instrument in the label. In `MANAGE` state the line is the position: contract × qty · entry → bid · P&L · time-stop countdown · exit signal.
2. Price ladder. A horizontal SVG number line from spot−1σ to spot+1σ (faint ticks at ±2σ) with the spot marker, the entry zone shaded, invalidation and target as labelled ticks, and the nearest two supports and two resistances as labelled ticks. One picture answers "expected move", "support and resistance" and "where I am wrong". It is a scale with real levels on it, not a gauge.
3. When to sell. At most three lines, each a level or a time: `Invalidation 7394.0 (−13.2 from spot)` · `Time stop 35 min (counts down once a position is open)` · `Next level 7411.2 HOD`. Use `summary.whenToSell` text only where a number cannot express it.
4. Status line. Quote age · chain age · decision age · `cross.label` · the first `keyRisks` entry (the counterargument).
5. A "more" disclosure for timeframes pills, TICK, VIX, indices and the regime words. `Collapsible` already exists.

At 390px the same Dash, top to bottom, with nothing hidden that a trader needs:

```
BUY CALL  SPY 739C  1.18/1.19  $119      LIVE  2:05:51
───────────────────────────────────────────────────────
 7374 ──┬───────┬─────●──┬──────┬──────────── 7440
      LOD     inval   spot   HOD   put wall
     7384.4  7394.0  7407.2 7411.2  7400.0
───────────────────────────────────────────────────────
sell  inval 7394.0 (−13.2)  ·  35 min  ·  next 7411.2
quote 2s · chain 6s · decision 14s · broad-confirm
risk  Level interactions on a 1-minute path are noisy
[more: timeframes · TICK · VIX · indices · regime]
```

Two screens become one. The ladder is about 120px tall; the whole thing is under 500px before the disclosure.

Noise to remove from the current Dash: `71% agree · prior`; `straddle 23.9` beside `±32.8` (an E|move| next to a 1σ, neither labelled, line 118); the phase word under the countdown (line 122); four S/R rows per side with a 4px strength bar and no legend (lines 68–77); `BE 740.2` (a SPY breakeven in SPY points in a row of SPX levels, line 126); the `in budget` text (show over-budget only); `decision v244`; the seven-index list.

## 4. Uncertainty without gauges

The app mostly avoids gauges already. The remaining issues are false precision and unlabelled model outputs.

- Counts, not percentages. `15 of 21 indicators` instead of `71% agree`, with the against-count beside it. A percentage of 21 things reads as calibration it does not have.
- Ranges, not points. The expected move as a band on the ladder labelled `1σ to close (about 2 in 3 days)`, with ±2σ as faint ticks. `summary.expectedMove.toCloseSigmaPts` and `toHorizonSigmaPts` give both bands.
- Scenario rows, not probabilities. The settlement scenario table (−2σ…+2σ, `strikeFlip.ts` `settlementScenarios`) is the right shape. Use the same shape intraday with `RankedContract.atInvalidation`, `atFlat`, `atTarget` (exit premium and return), three rows under the contract. Keep `P(ITM)` but small, after the rows, labelled `model, uncalibrated` as Closing already does.
- Sample size beside every rate, always. `hit rate n/a (0 graded)`. Performance and Lean do this; the hero and Dash do not.
- Validation as a count, not a word. Replace the `unvalidated` / `prospective` / `in-sample-only` chips with `0 of 180 decisions graded`, linking to Performance.
- Strength as evidence, not a bar. The S/R bar is a 0–100 heuristic (`features/sr.ts`). Show what it is made of: `3 touches · confluence with VWAP`. The fields exist on `SRLevel`; today only the hover title carries them.
- Keep the counterargument one line under the action on every screen that shows the action. It is the most honest sentence the engine writes, and it is the fifth section of the hero.
- Stale is a state, not a colour. The age numbers and the "Stale" banner are right; do not grey numbers out, label them.
- One number per quantity. Pick 1σ for expected move and say so; the straddle-implied E|move| belongs in Today's detail with its label.

## 5. The closing-window workspace, 15:50–16:00

Today the Closing view during the window is: lean strip, a sub-window chip row with the countdown, the learner box (a separate `/api/grades` fetch), the recommendation section with about 12 facts and four bullet lists, a two-panel row (remaining move; confirmation), the scenario table, a 30-column strike ladder, and the method notes. Nothing flashes. The only change signal is the text `EXPIRED — awaiting refresh`.

Must be visible without scrolling, at 390px as well:

- Countdown to 16:00:00, large, 1 Hz on the server-corrected clock. Exists (lines 53–59); move it into a top strip with the sub-window name.
- Countdown to the next cutoff, from the settings: resale cutoff at close − max(30, `minResaleWindowSec`/2) = 60 s by default; 15:58 (resale infeasible); 15:59 (no new entries). One line: `resale until 15:59:00 (1:12)`.
- The state in one word with the contract, ask, risk, breakeven settlement, and mode (`resale` or `hold to settlement`).
- Invalidation with live distance: `SPX 7402.1 · 2.1 above 7400`, computed client-side from `s.spx.last` and `rec.strike`, plus the 30-second rule (`strikeFlip.ts`: back through K for more than 30 s) as a timer that starts when the client sees SPX cross.
- The three nearest strikes (K−5, K, K+5): `P(close above)`, pattern chip, the recommended side's bid/ask, edge with drift, feasibility chip. The full `StrikeLadder` (30 columns, `src/components/StrikeLadder.tsx`) goes under a disclosure.
- One scenario row: `−1σ / flat / +1σ` P&L for the recommended contract.
- Assessment age against the 20 s TTL: `assessed 7 s ago · refresh due 15:54:20`, amber past 20 s, red past 40 s.

Must flash or alert (visual, plus sound if enabled; see section 7):

- Recommendation state change in either direction (`WAIT → CALL SETUP`, `CALL SETUP → PASS`). The engine already records this as `ChangeEvent.kind === "closing"` in `diffDecisions`.
- SPX crossing the recommended strike against the position (invalidation).
- The recommended quote's spread exceeding `maxSpreadPts` (the second invalidation clause).
- Sub-window transitions at 15:55, 15:58, 15:59, and `secondsToClose <= noNewEntrySec`.
- `EXPIRED` (no fresh assessment for more than 40 s) and any feed error during the window.
- On an open position, the `Under 2 minutes to expiration` alert from `positions.ts`.

Remove during the window: the LeanStrip (line 44); the LearningBox (line 65); the method notes (lines 236–243); the Confirmation panel (fold `SPY confirms/diverges` into one chip in the header; `ES` is always `n/a` because `decide.ts` passes `esPath: []`); the Remaining-move panel (one number, `σ 4.1 pts`, in the header with a tooltip for the parts); and the six-chip sub-window row (`pre` and `closed` are not sub-windows; show one label and a 10-minute progress bar with the cutoffs marked).

## 6. Position management flows

Opening. The form (`Positions.tsx` lines 187–231) has 11 fields on a separate page. The `Use recommended contract` prefill is right but incomplete: it sets osi, ask, invalidation, horizon, note, strategy and decision id, and leaves `profitTargetPremium` empty although `RankedContract.atTarget.exit` is the modelled target premium. The budget check happens server-side after submit; show the resulting open risk against `maxOpenRiskUsd` and the daily-loss state before the button. Add a Dash action `Open paper ×1 at ask` with a confirm step that calls the same prefill.

Managing. Open positions are a 10-column table (lines 108–185) with the close form inside the last cell. On a phone it is a horizontal scroll where the Close button is off-screen. Replace with a card per position: contract and qty; entry → bid with quote age; P&L in dollars and percent; intrinsic now; time-stop countdown (`horizonEndsAt − now`; nothing counts down today); invalidation with live distance; alerts; and the exit signal with its age (`exitSignal.attemptAt` exists; show `exit signalled 45 s ago, not closed` and keep the card highlighted until closed).

Closing. `CloseForm` (lines 288–325) prefills the bid, defaults the reason to `manual`, and fires without confirmation. Make it two actions: `Close at bid 1.42` (one tap, then confirm) and `Close at…` (custom premium). Default the reason to the exit-signal reason when there is one.

Settlement. There is no settlement flow. `closePosition` accepts reason `settlement` with the index value, and a 0DTE PM position held past 16:00 has no way to be settled from the UI.

After closing. Show the realized P&L inline and link to the trade in Performance. The Dash in `MANAGE` state should be the position (section 3), not `MANAGE` plus `no contract`.

## 7. Alerting

Nothing notifies the owner today. There is no `document.title` change on state, no sound, no Notification API, no vibration. The rail shows a dot on "Closing window" and "Positions" (`App.tsx` lines 85–93) and the status bar a `stale` chip. A trader who tabs away misses the setup.

Tiers, all derivable from `state.changes` (`ChangeEvent.kind`) and `decision.state` on the existing poll, with no server change:

- Tier 1 (sound, browser notification, title prefix, vibration on phones): decision state becomes `CALL SETUP` or `PUT SETUP`; an exit signal appears on an open position; a closing-window recommendation appears or is invalidated; the under-2-minutes alert; a feed error or stale state during the regular session.
- Tier 2 (title prefix and an in-app toast): a setup becomes armed; SPX crosses a key level (`kind: "level"`); the lean direction flips; sub-window transitions.
- Tier 3 (changes feed only): regime words, zero-gamma moved, forming setups.

Mechanics under the CSP (`apps/worker/src/index.ts` line 19): `Notification` needs no network; a Web Audio `OscillatorNode` beep needs no URL (an `<audio src="data:…">` would be blocked since there is no `media-src`); `navigator.vibrate` works on Android. Request notification permission from a Settings toggle, never on load. Put the diff logic in one hook mounted in `App.tsx` so it runs on every view, with a "quiet for 15 min" mute and per-tier sound toggles stored through `lib/prefs.ts`. Set `document.title` to `● BUY CALL — predictit` while a setup is live. Add one user alert, "notify me when SPX crosses X", evaluated client-side against `s.spx.last`.

The poll keeps running in hidden tabs at 15 s, which is enough for Tier 1. Web Push would need a service worker, VAPID keys and a server; not needed for one owner with the tab open.

## 8. Accessibility and phone use

- Contrast. `--text-3` is `#6b7480` on `#0b0d10` (`src/styles/tokens.css` line 34), about 4.1:1. It is used for `.dash-label` (`global.css` line 1565), `.fact-meta`, `.xs`, chart axes and every uppercase tile label, mostly at 11.5px. That fails WCAG AA (4.5:1 under 18px). Raise it to about `#7f8893`, or use `--text-2` for labels.
- Type scale. `--fs-xs` is 11.5px (`tokens.css` line 7) and appears in about 25 rules; on a phone many facts (quote age, size, "needs Schwab live") exist only at that size. Floor it at 12.5px and reserve it for metadata that has a larger twin.
- Live regions. `DecisionCard.tsx` line 72 wraps a 1 Hz countdown in `aria-live="polite"`, which announces every second to a screen reader. Set it `off` and add one visually hidden `role="status"` region in `App.tsx` that announces state changes only. Closing's `big-num` already uses `aria-live="off"`.
- Colour-only meaning. The S/R and weight bars carry meaning by colour alone; chips and trend glyphs are fine. Replace the bars with the touches text (section 4).
- Tables on phones. `StrikeLadder` (30 columns) and the positions table (10 columns) scroll horizontally with no sticky first column or header. Position cards (section 6) and the nearest-3 strikes (section 5) remove the need.
- Phone status bar (`global.css` lines 1503–1512) hides `.clock-phase`, which is where "125 min to close" lives, and the engine-tick chip, but keeps the feed names and now the instrument toggle. Keep the time to close; hide the feed names first.
- Phone Dash is fifteen stacked tiles, about 3300px tall (dash-phone.png was 3067px with thirteen); support and resistance are five screens down. The proposed layout fits in about two screens.
- Phone Today is a 3000px hero with the chart collapsed; fine once the hero is cut, but add a "jump to chart" link in the market strip.
- Touch targets. `btn-sm`, the replay timeline buttons, the sub-window chips and the segmented instrument buttons (`global.css` line 1607, 3px vertical padding) are under 44px.
- The nav drawer has no Escape-to-close and no focus trap.
- Present and good: `:focus-visible` ring, `prefers-reduced-motion`, light theme, `lang`, `color-scheme`, `id="main"`, `aria-pressed` on segmented buttons.
- `.segmented` is defined twice in `global.css` (lines 1291–1312 keyed on `[aria-pressed="true"]`, lines 1606–1608 keyed on `.active`); the status bar toggle sets both, so it renders, but the two rules will drift.

## 9. Performance and polling

- `/api/state` is polled every 3 s while visible and 15 s hidden, with exponential backoff (`src/api/useServerState.ts`). A response captured before the per-instrument change, in DELAYED mode with 25 change events and no closing ladder, was 77.7 KB: `gex` 50.5 KB (65%, the `byStrike` rows within ±5% filtered in `apps/worker/src/market.ts` line 900) and `decision` 14.6 KB. Only the Gamma view reads `byStrike`, `byExpiry`, `sensitivity` and the profiles.
- The state now carries `instruments.SPX` and `instruments.SPY`, each with its own decision, regime, levels, bars, chain features, gex, closing, mtf, cross and notes, while the top-level fields still mirror SPX (`market.ts` lines 945–955, `types.ts` `ServerState`). The SPX decision and GEX ship twice and the SPY set once: roughly 2.5 to 3 times the 77 KB, parsed and `setState`'d 20 times a minute. On a phone that is in the order of 200 MB per hour before compression.
- Fix in order: stop mirroring SPX at the top level (let `projectState` in `context.tsx` do the projection for both instruments); move GEX detail to `/api/gex?instrument=` fetched by the Gamma view on its own cadence, keeping `walls`, `flip.level` and `totals` in state; send `ETag` and honour `If-None-Match` so unchanged polls return 304 (the decision record is immutable with a 20–60 s TTL, so most polls are unchanged); page `changes` with `?since=`.
- Re-rendering. Each poll replaces the whole state object; `projectState` builds a new `conn` per poll (`context.tsx` line 44); no view or tile is memoised except the three charts. The 1 Hz `ClockContext` re-renders every `useServerNow` consumer each second, which includes the whole `TodayView`, `DashView`, `ClosingView` and the status bar. Move `useServerNow` down into the components that display a time, and `memo` `SummaryCard` and `DecisionCard` on `decision.id`.
- Secondary fetches are fine: bars every 30 s (whole day, about 27 KB; `?since=` would help), grades and lean every 60 s, positions every 15 s.
- In the closing window the server reassesses every 20 s and the client polls every 3 s, so six identical polls per assessment; the 304 path removes that cost.

## 10. Inconsistencies between the API and the UI

Unused fields in `ServerState` (`src/api/types.ts`):

- `grades` (`GradeSummary`): never read; the hero could show `n graded, hit rate x (CI)` from it without the `/api/grades` fetch.
- `bars` (`BarFeatures`: `atr14`, `vwap`, `twap`, `or15`, `or30`, `rv15/30/60`, `er60`): never read. ATR would let the Dash express the invalidation distance in ATRs.
- `notes` (`DataQualityNote[]` from the context): never read; only `decision.dataNotes` is shown.
- `decisionAgeMs`: never read; views recompute from `decision.asOf`.
- `tickFeatures.hi10`, `lo10`, `extremes10`, `posShare10`, `text`: never read. The Dash shows `TICK +164 / 180` where `180` is `avg10` with no label (`Dash.tsx` line 158).
- `spx.bid`, `ask`, `open`, `high`, `low`; `spy.prevClose`: never read. The Dash shows SPY with no change.
- `chainFeatures.liquidity`, `pcVolume0dte`, `pcOi0dte`, `front.atmIv`: read only as a fallback. `Vol normal` is a regime word; the ATM IV number never appears.
- `instruments.SPY.quote`, `mtf`, `cross`: `projectState` (`context.tsx` line 25) copies decision, regime, levels, bars, chainFeatures, gex, closing, notes and evaluatedAt but not `quote`, `mtf` or `cross`, so a SPY-selected Dash still reads `s.spx` for spot and the SPX top-level `mode` badge in the status bar. (The Dash reads `mtf` and `cross` from `summary`, which is projected, so those two are fine.)
- `SRLevel.touches`, `crossings`, `confluence`, `lastInteractionAgoMs`: only via the hover title on Today.
- `CleanSummary.whenToSell`, `keyRisks`, `why`, `actionText`, `headline`, `leanScore`, `gap`, `calendar`, `contract.entryCondition`: none read on the Dash. `DecisionRecord.instrument` is read nowhere (the Dash uses `summary.instrument`).
- `RankedContract.atTarget`, `atFlat`, `atInvalidation`, `rewardRisk`, `breakevenWinRate`, `thetaPerMin`: only in the Setups table.
- `ClosingAssessment.confirmation.es`: always `n/a` (`decide.ts` passes `esPath: []`), yet Closing renders an `ES n/a` chip and a footnote every time.

Mislabelled or misleading numbers:

- Dash `Entry` (line 127): an SPX zone (`7397.5–7401.0`) intraday, a premium (`≤ 1.20`) in the closing case, same tile, no unit.
- Dash `Invalidation` in the closing case (line 128) shows the strike; the engine's rule is "back through K for more than 30 s, or spread above 0.40".
- Dash lines 127–130 populate from `d.primary` even under `PASS` and `WAIT`.
- Dash `Expected move ±32.8` is 1σ with no σ label; `straddle 23.9` beside it is E|move| (about 0.8σ) with no label (lines 113–118).
- Dash line 93: `spot` is always SPX; with SPY selected the band `spot − move … spot + move` mixes instruments.
- Dash `BE 740.2` (line 126) is a SPY breakeven in SPY points in a row of SPX-style levels.
- Dash closing tile from 15:40 to 15:50 (lines 172–174): `closing` exists from 20 minutes out, `inClosingWindow` only from 10, so the tile reads `PASS` in pass colour with the reason `Closing window opens at 15:50:00 ET`. That is "not open yet", not a pass verdict.
- Dash `To close` sub (line 122) prints the raw `clock.phase` (`midday`) while the status bar prints `PHASE_LABEL` (`Midday`) and `125 min to close`; the same number is on screen twice in two formats.
- Dash footer `prospective` (line 181) is `lean.validation`, a scoring-ledger state, not a decision validation.
- Dash Lean sub `prior` (line 110) is `weightsMode` truncated to one meaningless word.
- Dash Cross-market tile (lines 139–150): `indices` is an empty object on delayed feeds, so the tile prints `indices need the Schwab live feed` under a `Cross-market · n/a` label, a sentence on the numbers-only view.
- Status bar `tick 7.3s ago` (`StatusBar.tsx` line 63) is the engine tick; the Dash shows NYSE `TICK` on the same screen. `Schwab 6.2s ago 1.2s`: the second number is latency, unlabelled (`FeedHealth.tsx` line 24). `Cboe delayed 48m 34s ago` is shown while LIVE, where it is irrelevant and looks like a fault.
- Today's "When to sell" duplicates (engine `summary.ts` lines 63–66 plus `exitRules`); the contract label is shown twice (`SummaryCard.tsx` line 47); the market strip and the hero both print expected move to close.
- Budget. Settings says the per-contract budget "applies to … the closing window", and `decide.ts` seeds `maxPremiumUsd` from it, but spreads stored `closingSettings` after it; `ClosingSettings.maxPremiumUsd` is not in the Closing settings form. If a stored closing setting carries `maxPremiumUsd`, the Dash's `in budget` check (engine budget, line 126) and the engine's feasibility (closing budget) can disagree. Verify which closing settings are persisted.
- Positions `Realized today` lacks a sign colour; `Per-contract budget` and `Open risk … of $3,000 limit` are correct.

## 11. What already works; leave it

- The engine's `CleanSummary` is the right contract for the top of the screen. Change how it is shown, not what it contains (except the when-to-sell duplication).
- The decision record as an immutable, versioned, expiring object, with the `Countdown` to expiry and the `Stale` banner (`App.tsx` `Banners`, `StatusBar.tsx` `isStale`). Keep the honesty of "this is history, not live".
- The one polling loop shared by context, with backoff and the server-clock offset (`useServerState.ts`, `context.tsx`). The architecture is right; only the payload and the re-render scope need work.
- `format.ts`: every helper renders `n/a` instead of a fabricated number, true minus signs, ET everywhere.
- The tokens file, the light theme, `prefers-reduced-motion`, `:focus-visible`, and the `Collapsible` with per-browser memory. The design system is sound; this review is about what goes in it.
- The changes feed, the replay scrubber, and the Setups "Why no setup, per family" panel. They explain the engine's silence, which matters as much as its calls.
- The Performance small-sample banner and the Wilson intervals on Lean. That is the standard the rest of the app should meet.

## 12. Top ten changes, in priority order

1. Rebuild the Dash as the four-row answer (section 3): action strip, price ladder, when-to-sell, status line, with a `MANAGE` variant and a "more" disclosure. Gate the plan numbers on `state` being a SETUP, and take spot from the selected instrument. `src/views/Dash.tsx` lines 86–185; new `src/components/LevelLadderStrip.tsx` (inline SVG, same pattern as `PriceChart.tsx`).
2. Fix the Dash's mislabelled numbers now, ahead of the rebuild if needed: instrument-aware spot (line 93); units on Entry, Invalidation, Target from `summary.instrument`; `±32.8 pts (1σ to close)` with the range and no straddle (lines 113–118); label `avg10` (line 158); `PHASE_LABEL` (line 122); drop `prior` (line 110) and `prospective` (line 181); render the pre-window closing tile as `opens 15:50` without the pass colour (lines 172–174); move the index list out (lines 139–150).
3. Turn Closing into the window workspace (section 5): top strip with the three countdowns and the state; contract line; invalidation with live distance; nearest-3 strikes; scenario row; everything else behind disclosures; drop the LeanStrip, LearningBox, method notes and the ES chip during the window. `src/views/Closing.tsx` lines 36–66 and 99–243; `src/components/StrikeLadder.tsx`.
4. Add the alert hook (section 7): diff `changes` and `decision.state` per poll; title prefix, `Notification`, Web Audio beep, `vibrate`, toast stack, mute; Settings toggles. New `src/lib/alerts.ts` mounted in `src/App.tsx` `Shell`; toggles in `src/views/Settings.tsx` Appearance panel.
5. Position cards with one-tap `Close at bid`, a time-stop countdown, exit-signal age, a settlement close, and prefill of `profitTargetPremium` from `atTarget.exit`; a Dash `Open paper ×1 at ask` with confirm. `src/views/Positions.tsx` lines 50–65, 108–185, 288–325.
6. De-duplicate the Today hero: remove the headline, actionText and the bottom LeanStrip; one lean line as `15 of 21 indicators, 4 against`; one contract label; one expected-move line; move `GapCalendarLine` into Market detail; put the chart above the Decision record; dedupe when-to-sell in the engine. `src/components/SummaryCard.tsx` lines 24–43, 47, 65–70, 113–114; `src/views/Today.tsx` lines 38–44 and 68–90; `packages/engine/src/decisions/summary.ts` lines 63–66; `src/components/PriceChart.tsx` lines 78–85 (x-domain from the first bar).
7. Slim the poll: stop mirroring SPX at the top level, GEX detail to `/api/gex`, `ETag`/304 on `/api/state`, `?since=` for changes and bars; memoise `SummaryCard` and `DecisionCard`; narrow `useServerNow` consumers. `apps/worker/src/market.ts` lines 900–955; `src/api/useServerState.ts`; `src/api/context.tsx` lines 21–26 and 44; `src/views/Today.tsx` line 23.
8. Contrast and type: `--text-3` to at least 4.5:1, `--fs-xs` to 12.5px, keep "min to close" in the phone status bar and hide the feed names first, 44px segmented buttons, one `.segmented` rule. `src/styles/tokens.css` lines 7 and 34; `src/styles/global.css` lines 1291–1312, 1503–1512, 1565, 1606–1608.
9. Live-region fix: `aria-live="off"` on the DecisionCard countdown and one app-level `role="status"` region announcing state changes only. `src/components/DecisionCard.tsx` line 72; `src/App.tsx` `Banners`.
10. Status bar: rename `tick` to `engine`, label latency, hide the Cboe chip in LIVE, show quote age and chain age for the selected instrument instead, and make the mode badge follow the instrument. `src/components/StatusBar.tsx` lines 45–72; `src/components/FeedHealth.tsx` lines 14–30; `src/api/context.tsx` line 25 (project `quote` and `mode`).

Secondary, when convenient: merge the two Lean tables and replace the score bar with counts (`src/views/Lean.tsx`); collapse Gamma's by-expiry table and put sensitivity under a disclosure (`src/views/Gamma.tsx`); a one-line empty state on Performance; remove the duplicate theme toggle; replace the S/R strength bars with touches text everywhere (`SummaryCard.tsx` `SRLadder`, `Dash.tsx` `Levels`); Escape-to-close and a focus trap on the nav drawer; keep the countdown visible on Closing when SPY is selected.
