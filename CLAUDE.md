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

## What to build this pass

**Phase 1 + Phase 2 together**: a working Electron shell rendering the real 4-panel
layout on this machine's actual displays, wired to real data sources where those exist.

Four subagents are **known-blocked** going in — don't let any of them stall the rest of
the build:

| Subagent | Why it's blocked | What to do instead |
|---|---|---|
| `cacc-fleet` / `momentum-fleet` | the `agents` schema (ex-opsdeck) has no per-GitHub-org filter yet | build the subagent interface and query shape now; return `{ connected: false, reason: "agents schema has no org filter yet" }` until that filter exists |
| `momentum-comms` | no mailbox/address identified yet | same pattern — `connected: false`, reason explaining what's missing |
| `subscriptions-usage` | usage.andrewroach.xyz's backend/API is unexplored (Google-auth gated, nothing documented — see the `usage-andrewroach-stack` memory if you have memory access) | same pattern; this one needs someone to actually go open that codebase before it can be real, don't guess at its API |

**Never fabricate data to fill a blocked connector.** A "not configured" state in the UI
is correct and expected; invented numbers are not. `ConnectorStatus` in
`packages/shared` exists specifically for this.

Everything else — `cacc-comms`, `cacc-checks`, `momentum-crm`, `personal-tasks` — has a
real, reachable data source per `ARCHITECTURE.md` §3 and should be wired for real.

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
