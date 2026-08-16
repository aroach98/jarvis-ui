# Build brief for jarvis-ui

This file is for whichever agent picks up the actual build. Read it before writing code
— it exists so that agent doesn't have to re-derive decisions already made.

## Read these first, in this order

1. `ARCHITECTURE.md` — the system design. Source of truth for *why* things are shaped
   the way they are.
2. `packages/shared/src/index.ts` — the actual data contract (panel state shapes, WS
   protocol, `JarvisConfig`). If this ever disagrees with `ARCHITECTURE.md`'s prose,
   the code wins — update the doc to match, not the other way around.
3. `docs/design/README.md` — links the approved visual mockup. Panels must match its
   layout, component structure, and visual language (dark HUD, cyan/amber accents,
   corner-bracket panels, monospace tabular-numeral readouts) — it's an approved design,
   not a rough sketch to reinterpret freely.
4. `ROADMAP.md` — phase breakdown.

## Current state (Phase 1 + 2 shipped 2026-08-14)

The Electron shell renders the real 4-panel layout fullscreen on this machine's
actual displays, and `jarvis-core` polls real data (60s) over WS. What's real:

- `cacc-comms` — Graph inbox via the shared `~/.cacc-graph/token.json` cache
  (`src/lib/graph.ts` ports mail.ps1's refresh flow, single-flight, rotation-safe).
- `cacc-checks` — Proving Ground `testing` schema over the CACC Supavisor pooler
  (vault: "CACC Core / Supabase" / `SUPABASE_SUPAVISOR_TRANSACTION_URL`) + gate
  decisions + Vercel prod deploy state for red/amber sites ("CACC Core / Vercel" /
  `VERCEL_TOKEN`). Waiver semantics: verdict comes from `runs.status` + `runs.waived`,
  never from re-counting `run_results`.
- `momentum-crm` — `mscrm.deals ⋈ companies` over the Momentum pooler (vault:
  "Momentum Core / Supabase" / `CRM_DATABASE_URL`, filed 2026-08-14), pinned-CA TLS.
- `personal-tasks` — tracking-schema PostgREST with creds in `.env.local`
  (see `.env.example`), mirroring the tracking app's own due-soon semantics.

Still **known-blocked**, honestly stubbed in `src/subagents/stubs.ts`
(`connected: false` + reason, rendered as "not configured"):

| Subagent | Why it's blocked |
|---|---|
| `momentum-fleet` | no Momentum repos registered in the AGENTS pipeline yet (`cacc-fleet` went live 2026-08-16 reading the whole `agents` schema — an org filter only becomes needed once Momentum repos exist there) |
| `momentum-comms` | no mailbox/address identified yet |
| `subscriptions-usage` | usage.andrewroach.xyz's backend/API is unexplored — open that codebase before building, don't guess at its API |
| token-spend ledger (Top panel spend + fleet spend slices) | no per-world spend ledger exists anywhere yet |

**Never fabricate data to fill a blocked connector.** A "not configured" state in the UI
is correct and expected; invented numbers are not. `ConnectorStatus` in
`packages/shared` exists specifically for this.

**Phase 3 voice (free mode) shipped 2026-08-14** — see `ARCHITECTURE.md` §4 for the
as-built pipeline. Summary: `sidecar/wake_listener.py` (openWakeWord "hey jarvis",
owns the mic, autostarted by jarvis-core) → Murmur server-mode STT on :8722 (lives in
the Murmur repo) → `src/voice/` (rules-first routing, Ollama fallback, deterministic
answers from cached panel state, SAPI TTS). Pipeline health renders as chips on the
core panel. Test any stage without a mic:
`sidecar/.venv/Scripts/python wake_listener.py --send-wav file.wav`.

**Phase 4 + 5 shipped 2026-08-14 — the roadmap is complete.** Pro mode routes
reasoning to Claude (official SDK, claude-opus-5, refusal fallbacks) and voice to
ElevenLabs, each failing closed to the free tier (Ollama/SAPI) with the reason on the
core panel's chips; no personal Anthropic/ElevenLabs/Spotify credentials exist yet, so
those tiers currently fall back (see `.env.example` + ARCHITECTURE.md §8). "Good
morning" post-wake triggers the ducked-AC/DC briefing (music skipped until Spotify
OAuth is set up); "that's enough" stops it. All spoken output uses the JARVIS butler
persona ("sir", composed diction — vernacular only, deliberately not a voice clone;
`src/voice/persona.ts`). Generative-UI v1: subagents set
`SectionDirectives.attention` and the renderer pulses that section.

**Interactive HUD shipped 2026-08-16 (ARCHITECTURE.md §9)** — the HUD stopped being
read-only:
- Every data section is condensed with a ⛶ expand → full-display overlay (Esc closes).
  Inbox expands to a reader (previews → full Graph message body, fetched on demand via
  the new `action` request/response WS messages).
- New `cacc-queue` subagent + section: HQ bug/feature queues (`hq.bug_reports`/
  `hq.feature_requests`) with per-ticket **dispatch to the AGENTS pipeline** (machine
  token `AGENTS_INGEST_TOKEN` from the CACC vault). Dispatch mirrors cacc-hq's own
  semantics — triage-blob task text, `agent_task_ref` write-back, **never writes
  `status`** (HQ's cron owns transitions + reporter emails). Dispatched tickets show
  the live agent status chip.
- `cacc-fleet` is live: the AGENTS 9-stage pipeline rail (`AGENT_PIPELINE` in shared),
  a 1:1 port of agents.cacadets.org's status reconciliation, tasks visibly flowing.
- Checks & deploys moved to the right display (second WS subscription to the left
  stream); failing rows get **▶ investigate** which files an AGENTS task against the
  site's repo (`testing.sites.repo`).
- The bottom of the left display embeds the **herdr terminal**: jarvis-core hosts a
  pty (`@lydell/node-pty`) running the herdr client, streamed to xterm.js in HUD
  colors. It is just another herdr attach — killing it loses nothing; never
  `herdr server stop`.

What remains is not phases but blockers: the three stubbed connectors (Momentum
fleet/mailbox, usage backend, spend ledger) — all listed in ARCHITECTURE.md §8.

### Running it

- **Autostart is installed on this machine**: scheduled tasks `JarvisCore` +
  `JarvisShell` (logon, hidden consoles, restart ×3 on failure) + a Murmur Startup
  shortcut. Re-register anytime with `scripts/install-autostart.ps1`; remove via
  `Unregister-ScheduledTask`.
- Manual: `pnpm dev:core` (WS :8721, voice events :8723, spawns the wake sidecar —
  one-time `sidecar/setup.ps1`) and `pnpm dev:shell` (fullscreen HUD; **Ctrl+Shift+J
  quits**; `JARVIS_WINDOWED=1` for plain windows). `scripts/start-shell.cmd` runs the
  production build instead of the dev server.
- Murmur (tray app) serves STT automatically while running; `Murmur --server` for
  headless.
- `apps/jarvis-core/jarvis.config.json` (gitignored) pins this machine's display IDs;
  without it the center-based geometry heuristic decides.

## Stack (already decided, don't re-litigate)

- pnpm workspaces: `apps/jarvis-core`, `apps/jarvis-shell`, `packages/shared`.
- `jarvis-core`: plain Node/TypeScript, `ws` for the WebSocket server.
- `jarvis-shell`: Electron + React, bundled with `electron-vite`.
- Both `package.json`s and `tsconfig.json`s already exist and are installable
  (`pnpm install` from repo root). Extend them; don't restructure the workspace.

## What's scaffolded vs. what's yours to build

Every file that exists right now is either a real contract (`packages/shared`) or a
scaffold stub with a `TODO` comment pointing at what belongs there (`apps/*/src/**`).
Nothing in `apps/` is a working feature yet — `jarvis-shell`'s main process opens one
plain window instead of the real multi-display fan-out, and every panel component
renders a placeholder `<div>`. That's the actual Phase 1 work.

Specifically still to build:
- `jarvis-shell`'s main process: the real multi-display window creation
  (`ARCHITECTURE.md` §2 — geometry heuristic + `jarvis.config.json` overrides), one
  fullscreen `BrowserWindow` per display instead of the current single dev window.
- A WS client hook in the renderer (subscribes by panel id, receives `ServerMessage`,
  updates state) — nothing like this exists yet.
- `jarvis-core`'s actual WS server, subagent registry, and poll loop — `src/index.ts` is
  currently just a doc comment.
- All four panel components' real UI, ported from the approved mockup.
- Copy `apps/jarvis-core/jarvis.config.example.json` to `jarvis.config.json` (gitignored,
  machine-specific) once you know this machine's real display IDs — don't guess at IDs
  in the example file itself.

## Secrets

Don't put credentials in this repo, ever — it's public. Read `ARCHITECTURE.md` §7 and
`.env.example` for where each credential actually comes from (CACC/Momentum vaults, or
personal secrets). If a subagent needs a credential that isn't documented there yet, that
means the documentation is incomplete — fix the doc, don't invent a new secrets path.

## Commit conventions

This is a personal repo (`aroach98/jarvis-ui`) — follow whatever personal-repo git
identity and workflow conventions your global instructions already define for
`aroach98` repos. Nothing jarvis-ui-specific here overrides those.
