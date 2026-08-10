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

## 2. Display layout

Electron's `screen.getAllDisplays()` enumerates the 4 monitors at startup. Each gets one
frameless, always-on-top, fullscreen `BrowserWindow` positioned at that display's bounds.
Which panel renders on which physical display is configurable in `jarvis.config.json`
(display index → panel id) rather than hardcoded, since monitor arrangement varies and
Windows doesn't guarantee stable display ordering across reboots — jarvis-core resolves
the mapping by matching each display's reported position/resolution against the saved
config, and falls back to left-to-right order with a warning if a display goes missing.

Default panel assignment (a straight 4-monitor row has no true "center," so Jarvis Core
lives on whichever display is marked primary in Windows display settings):

| Panel | Subagent(s) | Content |
|---|---|---|
| **Jarvis Core** | voice/orchestrator | Arc-reactor voice visualizer, current intent being routed, global status ticker, cost-mode indicator |
| **Fleet & Spend** | `agents-fleet`, `token-usage` | Live AGENTS fleet runs, per-world Claude token spend/cost meters |
| **CACC** | `cacc-comms` | andrew.roach@cacadets.org inbox triage, flagged/urgent threads |
| **Momentum** | `momentum-clients`, `personal-tasks` | Client pipeline from clients.momentumsystems.dev, taskers due today from tracking.andrewroach.xyz |

Every panel keeps refreshing on its own polling interval (default 60s) whether or not
Jarvis is actively being talked to — voice interaction triggers on-demand refreshes and
actions on top of that baseline, it doesn't gate the baseline.

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

Subagents:
- `agents-fleet` — reads the `agents` schema (ex-opsdeck), summarizes running/queued/failed tasks
- `token-usage` — aggregates Claude API spend across CACC/Momentum/personal contexts
- `cacc-comms` — Microsoft Graph read/draft/send on andrew.roach@cacadets.org (see `graph-mailbox-access` memory: draft by default, never auto-send without confirmation)
- `momentum-clients` — reads clients.momentumsystems.dev (`mscrm` schema)
- `personal-tasks` — reads tracking.andrewroach.xyz ("Andrew OS")

v1 subagents only *report*; v2 stretch goal is letting a subagent also emit UI directives
(highlight urgent items, reorder its panel) rather than a fixed template — the
"generative UI" pattern real HUD/JARVIS design writeups converge on, deferred until the
static version is proven out.

## 4. Voice pipeline

- **Wake word**: always-on local wake-word detector (openWakeWord — free, open source,
  matches the free-mode philosophy) listening for "Jarvis", plus a distinct trained
  phrase for "Good morning Jarvis" (see §5).
- **STT**: your existing **Murmur** app. Murmur today is hold-to-dictate-into-focused-window
  only (see `murmur-project` memory); jarvis-core needs Murmur's Whisper.net pipeline
  exposed as a small local service (HTTP or named pipe) it can call after wake-word
  trigger, instead of typing into a focused window. That's a scoped addition to Murmur,
  not a fork — tracked as an open build item, not assumed to exist yet.
- **TTS**: two tiers, switchable live (§6). We will **not** attempt to literally clone a
  film character's voice — that's a personality-rights/IP problem for a public repo.
  Instead pick/tune a voice with similar qualities (calm, precise, slightly formal).
- **NLU/reasoning**: Claude Agent SDK in pro mode; a small local model (via your Ollama
  box, see `local-ai-coding-3060` memory) in free mode for intent classification and
  canned responses.

## 5. "Good morning Jarvis" briefing

Trigger phrase, handled specially rather than routed through general intent
classification:

1. Start music quietly in the background. Preferred: control your existing Spotify
   session via the Spotify Web API (start/resume playback on your active device at a
   low volume, e.g. 15%) so no audio file needs to live in this repo. Local-file
   fallback if Spotify isn't reachable.
2. Jarvis then delivers a flash briefing: one line per subagent, **15 words or less
   each**, in a fixed order — fleet/spend, CACC, Momentum, personal taskers. Each
   subagent must return a briefing-mode summary (not its full report) for this to work;
   that's a distinct "brief" call each subagent implements alongside its normal fetch.
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

- Murmur needs a "server mode" to serve STT to jarvis-core instead of typing into a
  focused window.
- Token-usage subagent needs an actual spend-tracking source — Claude API usage isn't
  currently metered anywhere per-world; this needs a small ledger, not scraping.
- Wake-word model needs training/tuning for the custom "Good morning Jarvis" phrase.
- Voice choice for Pro-mode TTS is unpicked — needs a short shortlist + listen-through.
- Multi-display config resolution (matching saved panel assignments to physical
  displays across reboots) needs real-world testing on this machine's 4-monitor setup.
