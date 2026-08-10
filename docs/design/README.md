# Design references

Visual mockups and reference material for the HUD look.

## v1 — 4-panel wireframe

Interactive HTML mockup of the full 4-display spread: Jarvis Core, Fleet & Spend, CACC
Comms, Momentum + Personal. Sample data, not live connectors — see `ARCHITECTURE.md` §2
for the panel/display mapping this implements.

Live: https://claude.ai/code/artifact/294af993-7c48-4cf1-a1b3-834beffe0481

Visual language: near-black ground with a faint grid texture, cyan HUD accent (primary),
amber/gold accent reserved for pro-mode and secondary emphasis, corner-bracket panel
framing, monospace readouts with tabular numerals, uppercase technical labels. Pulled
from Iron Man HUD design conventions (circular reticles, arc-reactor motif, animated
data) rather than a generic dark-mode dashboard look.

Status: **not yet reviewed with the user.** Next step is iterating on this before Phase 1
(real Electron shell) starts.
