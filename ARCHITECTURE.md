# jarvis-ui — Architecture

A voice-driven, always-on HUD that spreads across all 4 physical displays, styled after
Iron Man's JARVIS. It surfaces *real* data about your life — running agents, token spend,
CACC email, Momentum clients, personal taskers — and is fully voice-controllable.

This repo is **public**. It contains zero secrets, zero credentials, and zero API keys.
Every credential jarvis-core needs is fetched at runtime from the CACC vault, the
Momentum vault, or `Secrets.xlsx`, exactly like every other agent on this machine — see
the "Secrets" section below. Nothing here should ever change that.

## 1. Two processes, not one

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│  jarvis-core (Node/TS)      │  WS/IPC │  jarvis-shell (Electron)         │
│  - Jarvis master agent      │◄───────►│  - 1 BrowserWindow per display   │
│  - 5 domain subagents       │        │  - each window = one panel        │
│  - wake word + STT + TTS    │        │  - renders live panel state       │
│  - vault/API connectors     │        │  - captures mic, plays audio      │
└─────────────────────────────┘        └──────────────────────────────────┘
```

`jarvis-core` is a headless local service — it owns the agent loop, the always-on voice
pipeline, and every data connector. It has no UI of its own. `jarvis-shell` is a thin
Electron renderer layer that does nothing but display whatever state `jarvis-core`
publishes, and forward voice/mic events back to it. Splitting them means the agent loop
can run (and be restarted, logged, tested) independently of whether any window is open —
same pattern as the existing AGENTS fleet worker (see `fleet-worker-autostart` memory).

**Stack**: pnpm workspaces (`apps/jarvis-core`, `apps/jarvis-shell`, `packages/shared`).
`jarvis-core` is plain Node/TypeScript talking WebSocket (the `ws` package). `jarvis-shell`
is Electron + React, bundled with `electron-vite`. `packages/shared` holds every type both
apps depend on — panel state shapes, the WS message envelope, `JarvisConfig` — so the two
apps can't silently drift out of sync on what a message looks like. Full contract lives in
`packages/shared/src/index.ts`; treat it as the source of truth over this document if the
two ever disagree.

## 2. Display layout — per-workstream, not per-domain

The physical desk is a plus/cross arrangement, not a row: one monitor above, one below-
center (arm-mounted lower, directly ahead), and one flanking each side. Panels are
assigned by **workstream**, not by data type — each side monitor is "everything about
that world," so glancing left or right answers "how's CACC/Momentum doing" in one look
instead of needing to check a fleet panel *and* a comms panel *and* a spend panel.

`jarvis-shell`'s Electron **main process** enumerates the 4 monitors at startup via
`screen.getAllDisplays()` — this resolution is a `jarvis-shell` concern, not
`jarvis-core`'s, since only the Electron process has display access. Each display gets
one frameless, always-on-top, fullscreen `BrowserWindow` positioned at that display's
bounds, loading the renderer with `?panel=<id>` so it knows which panel to render.

Default resolution is a **geometry heuristic**, since Windows doesn't guarantee stable
display ordering across reboots and hardcoding indices would break the first time a
cable gets reseated: the topmost display → `top`; of the remaining three, leftmost →
`left`, rightmost → `right`, the one left over → `core`. Positions compare display
**centers**, not top-left corners — on the real desk the flanking monitors are tall
portrait panels whose top *edges* sit higher than the top monitor itself, so corner-y
would misassign `top` to a side display (found in live testing 2026-08-14). `jarvis.config.json`'s `displayOverrides` (keyed by Electron's `display.id`) can
pin a specific display to a specific panel when the heuristic gets it wrong — see
`packages/shared`'s `JarvisConfig` type for the exact shape.

| Position | Panel | Subagent(s) | Content |
|---|---|---|---|
| **Left** | CACC | `cacc-comms`, `cacc-fleet`, `cacc-checks` | Inbox triage, CACC-scoped agent runs, test/deploy verdicts (Proving Ground gate, Vercel deploys), CACC's slice of today's token spend |
| **Right** | Momentum | `momentum-comms`, `momentum-fleet`, `momentum-crm` | Inbox triage, Momentum-scoped agent runs, CRM pipeline (clients.momentumsystems.dev), Momentum's slice of today's token spend. Later: autonomous demo-outreach status to nearby businesses (v2, not designed yet) |
| **Bottom-middle** (primary) | Jarvis Core | voice/orchestrator | Arc-reactor voice visualizer, current intent being routed, cost-mode toggle, global status ticker |
| **Top** | Subscriptions & Today — **partially decided** | `subscriptions-usage`, `personal-tasks` | Usage bars for every Claude subscription across all payers (usage.andrewroach.xyz), today's to-do list + taskers due (tracking.andrewroach.xyz), overall API spend across all worlds. Subscriptions section is locked in; the rest of the panel (to-do list vs. a broader personal snapshot) is still open — revisit before Phase 1 locks it in |

Every panel keeps refreshing on its own polling interval (default 60s) whether or not
Jarvis is actively being talked to — voice interaction triggers on-demand refreshes and
actions on top of that baseline, it doesn't gate the baseline.

**Subscriptions are the one deliberate exception to "panels = workstream."** A Claude
subscription seat might be paid for by Momentum Systems, but it's still fundamentally
*your* usage across whatever you're doing with it — it doesn't belong to a single
workstream the way an inbox or a CRM does. It lives on the Top panel as an open-ended,
growing list (more seats will be added over time), each entry showing: subscription
name, who pays for it (personal vs. Momentum Systems — shown as a plain label, not
color-coded, so it doesn't collide with the cyan/amber = CACC/Momentum accent meaning
used everywhere else), percent of its usage window consumed, and when that window
resets. Fill color on each bar is semantic (green/amber/red by how close to the limit),
independent of who's paying.

## 3. Jarvis: master agent + subagents

Built on the **Claude Agent SDK**. Jarvis itself is a thin router: it takes a transcribed
utterance, classifies intent, and either answers directly from cached panel state (no
API call needed for "what's my inbox look like") or dispatches to the subagent that owns
the relevant domain and relays its response back through TTS.

Each subagent is scoped to one domain, with its own system prompt and a narrow toolset —
read-only fetchers plus a small number of explicit write actions (e.g. "archive that
email", "mark that tasker done"). A subagent is the *only* thing that talks to its
upstream data source; Jarvis never calls CACC Graph or the Momentum CRM directly. This
keeps blast radius small — a bug in the CACC subagent can't touch Momentum client data.

```
voice utterance → Jarvis (intent routing)
                     ├─ answer from cached panel state (free, no API call)
                     └─ dispatch → subagent (fetch/act) → result → TTS
```

Subagents, grouped by the panel they feed:
- `cacc-comms` — Microsoft Graph read/draft/send on andrew.roach@cacadets.org (see `graph-mailbox-access` memory: draft by default, never auto-send without confirmation)
- `cacc-fleet` — reads the `agents` schema (ex-opsdeck) filtered to California-Cadet-Corps-org repos
- `cacc-checks` — test/deploy verdicts: Proving Ground gate (`testing` subdomain), Vercel deploy status across cacc-* sites
- `momentum-comms` — Momentum inbox triage; mailbox/address not yet identified, open item
- `momentum-fleet` — reads the `agents` schema filtered to Momentum-Systems-Dev-org repos
- `momentum-crm` — reads clients.momentumsystems.dev (`mscrm` schema) for pipeline stage
- `personal-tasks` — reads tracking.andrewroach.xyz ("Andrew OS")
- `subscriptions-usage` — reads usage.andrewroach.xyz for Claude subscription usage
  (percent of window consumed, reset time) across every seat regardless of who pays for
  it; the list is expected to grow as more Momentum-funded seats are added, so the data
  shape is an open array of subscriptions, not a fixed set
- `token-usage` — cross-cutting: aggregates Claude API spend per world, but its output is *split* across panels (each world's slice renders on that world's own monitor via `cacc-fleet`/`momentum-fleet`, with the cross-world total on the Top panel) rather than getting a dedicated panel of its own

`cacc-fleet` and `momentum-fleet` both read the same underlying `agents` schema, just
filtered differently — that filter (by source repo's GitHub org) doesn't exist yet and is
called out again in §8.

v1 subagents only *report*; v2 stretch goal is letting a subagent also emit UI directives
(highlight urgent items, reorder its panel) rather than a fixed template — the
"generative UI" pattern real HUD/JARVIS design writeups converge on, deferred until the
static version is proven out.

## 4. Voice pipeline (Phase 3 — built 2026-08-14, free mode)

- **Wake word**: a small Python **sidecar** (`apps/jarvis-core/sidecar/`) owns the
  microphone: openWakeWord's pretrained **"hey jarvis"** model → on trigger it POSTs
  `/voice/wake` to jarvis-core, records the utterance (energy endpointing), and ships
  the WAV to `/voice/utterance`. jarvis-core autostarts it (config `voice.sidecar`)
  and shows a wake chip from its heartbeat. *Deviation from the original §1 sketch:*
  the sidecar owns mic capture, not jarvis-shell — openWakeWord is Python, and giving
  the detector the mic directly beats streaming PCM through Electron. A distinct
  trained "Good morning Jarvis" phrase is still Phase 4 (§5).
- **STT**: **Murmur server mode** (shipped in the Murmur repo, 2026-08-14): the tray
  app serves its Whisper.net pipeline at `http://127.0.0.1:8722` (`GET /health`,
  `POST /transcribe` WAV → text), loopback only; `Murmur --server` runs it headless.
  jarvis-core's `src/voice/stt.ts` is the client.
- **NLU/routing** (`src/voice/nlu.ts`): deterministic rules catch the canned intents
  (inbox / checks / crm / tasks / mode toggle) with zero model calls; everything else
  goes to the local Ollama box (default `huihui_ai/qwen2.5-coder-abliterate:14b` at
  192.168.1.62:11434) — classification first, and free-form answers grounded in a
  context block built from cached panel state only. Claude Agent SDK reasoning is the
  pro path, Phase 4.
- **Answers** (`src/voice/answers.ts`): canned intents are answered deterministically
  from cached panel state — no model, no API, no fabrication; disconnected connectors
  are said out loud.
- **TTS** (`src/voice/tts.ts`): free tier = Windows SAPI (local, $0), voice/rate
  configurable. Cloud TTS is Phase 4; we will **not** literally clone a film
  character's voice — personality-rights/IP problem for a public repo.
- Every stage reports health (`CorePanelState.pipeline`) and the core panel renders
  wake/stt/nlu/tts chips; a dead stage degrades that chip, never the HUD.

## 5. "Good morning Jarvis" briefing (built 2026-08-14)

Trigger: any post-wake utterance containing "good morning" — handled specially
in the orchestrator, never routed through intent classification. (A dedicated
trained wake phrase remains open in §8; today it's "hey jarvis… good
morning".) As built:

1. Start music quietly in the background. Preferred: control your existing Spotify
   session via the Spotify Web API (start/resume playback on your active device at a
   low volume, e.g. 15%) so no audio file needs to live in this repo. Local-file
   fallback if Spotify isn't reachable.
2. Jarvis then delivers a flash briefing: one line per panel, **15 words or less
   each**, in a fixed order — CACC (comms + fleet + checks combined into one line),
   Momentum (comms + fleet + CRM combined), Personal/Today. Each subagent must return a
   briefing-mode summary (not its full report) for this to work; that's a distinct
   "brief" call each subagent implements alongside its normal fetch, and the panel-owning
   subagent (`cacc-comms`, `momentum-comms`) is responsible for merging its sibling
   subagents' briefs into one line rather than Jarvis doing the merging itself.
3. Music keeps playing quietly under/after the briefing until you say "Jarvis, that's
   enough" or a timeout.

## 6. Free vs. Pro cost toggle

Explicit, always-visible, user-controlled — never silently spend money. Surfaced on the
Jarvis Core panel as a status indicator (cyan = free, gold = pro) and toggleable by
voice ("Jarvis, go premium" / "Jarvis, save mode") or a HUD control.

| | Free mode | Pro mode |
|---|---|---|
| STT | Murmur (local Whisper) | Murmur (local Whisper) — same either way |
| Reasoning/routing | Local model via Ollama | Claude Agent SDK (Sonnet/Opus) |
| TTS | Local (Piper or Windows SAPI) | Cloud (e.g. ElevenLabs), higher quality |
| Marginal cost | $0 | per-request API cost |

Panel data refresh (polling subagents) is always free-tier local logic regardless of
mode — only the *voice reasoning and voice quality* are gated by the toggle, since
those are what actually cost money per interaction.

## 7. Secrets (this repo has none)

jarvis-core reads credentials the same way every other agent on this machine does — by
world, not by copying keys into this repo:

- CACC data (Graph mailbox) → `vault.cacadets.org`, `$env:CACC_VAULT_TOKEN`
- Momentum data (CRM) → `vault.momentumsystems.dev`, `$env:MOMENTUM_VAULT_TOKEN`
- Personal data (tracking.andrewroach.xyz, Spotify) → `Secrets.xlsx` locally, or a
  `.env.local` (gitignored) for anything that isn't in the spreadsheet
- Claude API key (pro mode only) → personal secrets source

If a required credential is missing, jarvis-core fails closed on that one subagent (its
panel shows "disconnected") rather than crashing the whole HUD or inventing placeholder
data.

## 8. Open build items (not yet solved, called out on purpose)

- ~~Murmur needs a "server mode" to serve STT to jarvis-core~~ — shipped in the Murmur
  repo 2026-08-14 (loopback HTTP, tray-hosted + `--server` headless).
- Token-usage subagent needs an actual spend-tracking source — Claude API usage isn't
  currently metered anywhere per-world; this needs a small ledger, not scraping.
- `agents` schema (ex-opsdeck) has no per-repo/per-org filter today — `cacc-fleet` and
  `momentum-fleet` both need one to split fleet runs by workstream instead of showing
  everything on both panels.
- Momentum inbox/mailbox for `momentum-comms` isn't identified yet (CACC has a known
  Graph mailbox; Momentum's equivalent needs to be picked).
- Momentum panel's future "autonomous demo-outreach to nearby businesses" section is a
  stated direction, not a designed feature — needs its own design pass once the
  outreach system itself exists.
- Top panel's non-subscription content is still open — leaning personal to-do/taskers,
  but confirm before Phase 1 locks the layout in.
- `subscriptions-usage` connector to usage.andrewroach.xyz isn't designed yet — that
  site is Google-auth-gated and its API/data model isn't documented anywhere jarvis-ui
  can currently see. Needs a look at that codebase (or a service-account/API-key path
  into it) before this subagent can be built for real.
- Wake-word model needs training/tuning for custom phrases (bare "Jarvis",
  "Good morning Jarvis") — today both ride the pretrained "hey jarvis" model,
  with "good morning" detected in the utterance that follows.
- ~~Voice choice for Pro-mode TTS~~ — defaulted to ElevenLabs' prebuilt
  "Daniel" (configurable via `ELEVENLABS_VOICE_ID`); do a listen-through when
  the key is filed.
- ~~Pending personal credentials~~ — all filed and verified live 2026-08-14
  (`ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `SPOTIFY_*` in the personal
  secrets sheet + this machine's `.env.local`): pro-mode Claude reasoning,
  the ElevenLabs voice, and the ducked-AC/DC briefing all exercised for real.
  A new machine re-copies them from the sheet into `.env.local`.
- ~~Multi-display config resolution needs real-world testing on the plus-shaped
  4-monitor arrangement~~ — done 2026-08-14: corner-based "topmost" misassigned the
  portrait flanks, fixed by comparing display centers (see §2); this machine's IDs are
  additionally pinned in its gitignored `jarvis.config.json`.
