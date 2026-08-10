# Design references

Visual mockups and reference material for the HUD look.

## v2 — plus-shaped, per-workstream layout (current)

Interactive HTML mockup matching the real desk arrangement: top / left / bottom-middle
(core) / right, not a straight row. Panels are assigned by workstream, not by data
type — left is everything CACC, right is everything Momentum, so one glance answers
"how's this world doing" instead of needing to check three different panels. See
`ARCHITECTURE.md` §2 for the full mapping.

Live: https://claude.ai/code/artifact/294af993-7c48-4cf1-a1b3-834beffe0481

- **Left (CACC)**: inbox triage, CACC-scoped agent fleet, test/deploy verdicts, CACC's
  slice of today's token spend. Cyan accent, shield-shaped badge (placeholder insignia,
  not the real seal).
- **Right (Momentum)**: inbox triage (mailbox not yet identified — shown as an open
  connector), Momentum-scoped agent fleet, CRM pipeline, Momentum's slice of spend, and
  a dashed "phase 2" block reserved for autonomous demo-outreach status once that system
  exists. Amber accent, diamond-shaped badge (placeholder, not the real logo).
- **Bottom-middle (Jarvis Core)**: arc-reactor voice visualizer, listening/routing
  status, free/pro mode toggle, last-routed-command line, briefing spec note.
- **Top (Today)**: explicitly marked provisional (dashed border) — currently shows
  taskers due + total cross-world spend, but content isn't finalized.

Visual language: near-black ground with a faint grid texture, cyan HUD accent (primary,
CACC), amber/gold accent (secondary, Momentum + pro-mode), corner-bracket panel framing,
monospace readouts with tabular numerals, uppercase technical labels. Pulled from Iron
Man HUD design conventions (circular reticles, arc-reactor motif) rather than a generic
dark-mode dashboard look.

Status: **not yet reviewed with the user.** Next step is iterating on this before Phase 1
(real Electron shell) starts.

## v1 — 4-panel row (superseded)

First pass grouped panels by data type (Jarvis Core / Fleet & Spend / CACC / Momentum +
Personal) in a straight row. Replaced by v2's per-workstream, plus-shaped layout, which
matches the user's actual desk arrangement and groups by "which world" instead of "which
kind of data."
