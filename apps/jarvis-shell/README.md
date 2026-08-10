# jarvis-shell

Electron renderer shell. Opens one fullscreen `BrowserWindow` per physical display and
renders whatever panel state `jarvis-core` publishes over the local WS/IPC channel. No
agent logic lives here. See the repo root `ARCHITECTURE.md` §1 and §2. Not yet
implemented — Phase 1 of `ROADMAP.md`.
