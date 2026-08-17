@echo off
rem jarvis-core launcher (used directly or via the hidden autostart wrapper).
rem Output goes to %TEMP%\jarvis-core.log so the hidden autostart instance
rem stays debuggable.
rem
rem The restart loop is the real crash recovery: node can die from a native
rem fault (e.g. ConPTY) without a JS stack, and Task Scheduler's
rem restart-on-failure never sees it through the wscript->cmd->pnpm chain.
cd /d "%~dp0..\apps\jarvis-core"
:loop
echo [%date% %time%] start-core: launching jarvis-core >> "%TEMP%\jarvis-core.log"
call pnpm exec tsx src/index.ts >> "%TEMP%\jarvis-core.log" 2>&1
echo [%date% %time%] start-core: jarvis-core exited (%errorlevel%) - restarting in 5s >> "%TEMP%\jarvis-core.log"
timeout /t 5 /nobreak > nul
goto loop
