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
| `cacc-fleet` / `momentum-fleet` | the `agents` schema (ex-opsdeck) has no per-GitHub-org filter yet |
| `momentum-comms` | no mailbox/address identified yet |
| `subscriptions-usage` | usage.andrewroach.xyz's backend/API is unexplored — open that codebase before building, don't guess at its API |
| token-spend ledger (Top panel spend + fleet spend slices) | no per-world spend ledger exists anywhere yet |

**Never fabricate data to fill a blocked connector.** A "not configured" state in the UI
is correct and expected; invented numbers are not. `ConnectorStatus` in
`packages/shared` exists specifically for this.

Next pass: **Phase 3** (wake word, Murmur server-mode STT, local reasoning) — see
`ROADMAP.md`. Murmur's server mode is a prerequisite that lives in the Murmur repo,
not here.

### Running it

- `pnpm dev:core` (from repo root) — headless service, WS on 127.0.0.1:8721.
- `pnpm dev:shell` — fullscreen HUD on every display; **Ctrl+Shift+J quits**.
  `JARVIS_WINDOWED=1` opens plain windows instead (dev/testing).
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
