# Roadmap

Phased so each stage is independently useful and testable before the next starts.

## Phase 0 — Design (current)
- [x] Repo + architecture doc
- [ ] Visual mockup agreed on
- [ ] Panel → display mapping decided against the real 4-monitor arrangement

## Phase 1 — Shell, no voice
- Electron shell opens 4 fullscreen windows, one per display, static mock data
- Panel UI components built against the agreed mockup

## Phase 2 — Real data, still no voice
- `agents-fleet`, `token-usage`, `cacc-comms`, `momentum-clients`, `personal-tasks`
  subagents wired to their real sources, polling on an interval
- Vault/secrets connectors, fail-closed-per-panel behavior

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
