@echo off
rem jarvis-core launcher (used directly or via the hidden autostart wrapper).
rem Output goes to %TEMP%\jarvis-core.log so the hidden autostart instance
rem stays debuggable.
cd /d "%~dp0..\apps\jarvis-core"
call pnpm exec tsx src/index.ts >> "%TEMP%\jarvis-core.log" 2>&1
