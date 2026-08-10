# Roadmap

Phased so each stage is independently useful and testable before the next starts.

## Phase 0 — Design (done)
- [x] Repo + architecture doc
- [x] Visual mockup agreed on (plus-shaped, per-workstream, subscriptions on Top)
- [x] Panel → display mapping decided: geometry heuristic + `jarvis.config.json` overrides
- [x] Workspace scaffolded (pnpm, TS, shared contracts) — see `CLAUDE.md`

## Phase 1 + Phase 2 — current kickoff target
Real Electron shell on real displays, wired to real data where a source exists. See
`CLAUDE.md` for the full brief, including which 4 subagents are known-blocked and how
they should degrade (`connected: false` + reason, never fabricated data) rather than
stall the rest of the build:
- `jarvis-shell` main process: real multi-display window creation, one fullscreen
  `BrowserWindow` per display
- Panel UI components built against the approved mockup, reading live `packages/shared`
  state over WS
- `jarvis-core`: real WS server, subagent registry, poll loop
- Real subagents: `cacc-comms`, `cacc-checks`, `momentum-crm`, `personal-tasks` (all have
  reachable data sources today)
- Known-blocked, build the interface but don't fake the data: `cacc-fleet`,
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
