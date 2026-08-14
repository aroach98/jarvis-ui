@echo off
rem jarvis-shell launcher: rebuild (fast, and keeps autostart current with the
rem repo) then run the production bundle fullscreen on every display.
cd /d "%~dp0..\apps\jarvis-shell"
call pnpm run build
call pnpm exec electron .
