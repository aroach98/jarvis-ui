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

## Phase 3 — Voice, free mode only — done (2026-08-14)
- [x] Wake word via openWakeWord — Python sidecar owning the mic; pretrained
  **"hey jarvis"** phrase (a custom bare-"Jarvis" model would need training — Phase 4
  alongside "Good morning Jarvis")
- [x] Murmur server-mode STT integration (server mode shipped in the Murmur repo;
  jarvis-core is a plain HTTP client)
- [x] Local TTS (Windows SAPI), local-model routing/intent classification (rules
  first, Ollama 14b fallback + free-form answers grounded in cached state)
- [x] Basic voice queries answered from cached panel state ("what's in my inbox",
  checks, pipeline, taskers, "go premium"/"save mode")
- Verified end-to-end with synthetic WAVs injected at the sidecar boundary; live-mic
  wake-word tuning on the real desk is the remaining human test

## Phase 4 — Pro mode + briefing — done (2026-08-14)
- [x] Claude reasoning path (official SDK, claude-opus-5, refusal fallbacks
  enabled), free/pro toggle wired end to end: pro utterances route to Claude +
  ElevenLabs, free stays Ollama + SAPI, and every pro resource **fails closed
  to its free counterpart** — nothing spends silently, chips show why. ⚠ No
  personal ANTHROPIC_API_KEY exists yet, so pro reasoning currently falls back
  (verified live: 401 → local answer, turn never dropped).
- [x] Cloud TTS voice selected: ElevenLabs prebuilt "Daniel" (calm, precise,
  slightly formal — not a film-voice clone), configurable; ⚠ pending
  ELEVENLABS_API_KEY, falls back to SAPI until filed.
- [x] "Good morning" briefing: ducked AC/DC via Spotify Web API (⚠ pending a
  one-time Spotify OAuth setup — skipped gracefully until then), then a 3-line
  flash briefing (CACC / Momentum / Today, ≤15 words each, panel-owner merges
  its siblings), "that's enough" stops the music.
- [x] JARVIS vernacular: butler diction, addresses the user as "sir" in every
  spoken surface (canned answers, both reasoning prompts, briefing).

## Phase 5 — Polish — done (2026-08-14)
- [x] Generative-UI v1: subagents emit **presentation directives**
  (`SectionDirectives.attention`) — flagged mail, failing checks, overdue
  taskers make their section pulse; renderer owns the CSS, data owner owns the
  judgment. Full layout generation stays a future idea.
- [x] Reliability: `scripts/install-autostart.ps1` registers JarvisCore +
  JarvisShell logon tasks (hidden consoles, restart ×3 on failure) and a
  Murmur Startup shortcut; core restarts the wake sidecar on crash; per-panel
  WS reconnect with link-down banner (shipped in Phase 1).

**Project complete through the roadmap.** Remaining open items are the blocked
connectors and pending credentials — tracked in `ARCHITECTURE.md` §8, not
phases.
