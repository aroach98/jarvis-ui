@echo off
rem jarvis-core launcher (used directly or via the hidden autostart wrapper)
cd /d "%~dp0..\apps\jarvis-core"
call pnpm exec tsx src/index.ts
