# jarvis-ui

A real-life JARVIS: a voice-driven HUD that spans all 4 of my monitors, styled after
Iron Man's interface, showing actually-live data — running agents, Claude token spend,
CACC inbox, Momentum clients, and personal taskers due — instead of decorative widgets.

Status: **design phase**. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full system
design (Electron multi-window shell, Jarvis master agent + subagents on the Claude Agent
SDK, voice pipeline, free/pro cost toggle) and [`docs/design/`](./docs/design) for the
visual mockups.

## Why public

This repo carries no secrets, no API keys, no credentials — every data connector reads
its token from a private vault or local secrets store at runtime (see
[`ARCHITECTURE.md` §7](./ARCHITECTURE.md#7-secrets-this-repo-has-none)). Keeping it
public is a deliberate choice, not an oversight.

## Layout

```
apps/
  jarvis-core/     headless service: Jarvis master agent + subagents, voice pipeline
  jarvis-shell/    Electron renderer: one fullscreen window per display
docs/
  design/          mockups and visual references
ARCHITECTURE.md
ROADMAP.md
```
