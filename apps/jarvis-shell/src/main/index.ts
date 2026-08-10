import { app, BrowserWindow } from "electron";

/**
 * Minimal single-window entry point — enough to prove the electron-vite
 * pipeline works end to end. The real Phase 1 task (ARCHITECTURE.md §2) is
 * NOT done here yet: enumerate screen.getAllDisplays(), apply the
 * geometry heuristic + jarvis.config.json's displayOverrides, and open one
 * frameless fullscreen BrowserWindow per display loading `?panel=<id>`.
 * See ../../../CLAUDE.md for the build brief.
 */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: new URL("../preload/index.js", import.meta.url).pathname,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?panel=core`);
  } else {
    win.loadFile("out/renderer/index.html", { query: { panel: "core" } });
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
