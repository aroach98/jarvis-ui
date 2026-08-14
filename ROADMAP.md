# Roadmap

Phased so each stage is independently useful and testable before the next starts.

## Phase 0 — Design (done)
- [x] Repo + architecture doc
- [x] Visual mockup agreed on (plus-shaped, per-workstream, subscriptions on Top)
- [x] Panel → display mapping decided: geometry heuristic + `jarvis.config.json` overrides
- [x] Workspace scaffolded (pnpm, TS, shared contracts) — see `CLAUDE.md`

## Phase 1 + Phase 2 — done (2026-08-14)
Real Electron shell on real displays, wired to real data where a source exists. The 4
known-blocked subagents degrade as designed (`connected: false` + reason, never
fabricated data) — see `CLAUDE.md` for current state:
- [x] `jarvis-shell` main process: real multi-display window creation, one fullscreen
  `BrowserWindow` per display (center-based geometry heuristic + `displayOverrides`;
  verified live on the plus-shaped 4-monitor desk)
- [x] Panel UI components built against the approved mockup, reading live
  `packages/shared` state over WS (auto-reconnect, per-section offline states)
- [x] `jarvis-core`: real WS server, subagent registry, poll loop (60s default)
- [x] Real subagents: `cacc-comms` (Graph), `cacc-checks` (Proving Ground DB + Vercel),
  `momentum-crm` (mscrm pooler), `personal-tasks` (tracking PostgREST)
- [x] Known-blocked, interface built, data honestly absent: `cacc-fleet`,
  `momentum-fleet`, `momentum-comms`, `subscriptions-usage`

## Phase 3 — Voice, free mode only
- Wake word ("Jarvis") via openWakeWord
- Murmur server-mode STT integration
- Local TTS, local-model routing/intent classification
- Basic voice queries answered from cached panel state

## Phase 4 — Pro mode + briefing
- Claude Agent SDK reasoning path, free/pro toggle wired end to end
- Cloud TTS voice selection
- "Good morning Jarvis" briefing + Spotify-ducked AC/DC easter egg

## Phase 5 — Polish
- Generative-UI stretch goal (subagents can adjust their own panel layout)
- Reliability: autostart on this machine, crash recovery, per-panel reconnect UI
