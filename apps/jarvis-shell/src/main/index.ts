import { app, BrowserWindow, globalShortcut, screen } from "electron";
import type { Display } from "electron";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_WS_PORT } from "@jarvis-ui/shared";
import type { JarvisConfig, PanelId } from "@jarvis-ui/shared";

/**
 * Multi-display fan-out (ARCHITECTURE.md §2): one frameless, always-on-top,
 * fullscreen BrowserWindow per display, each loading `?panel=<id>`.
 * JARVIS_WINDOWED=1 opens plain windows instead — for working on the HUD
 * without surrendering every monitor to it.
 */

const PANELS: PanelId[] = ["top", "left", "core", "right"];

function loadConfig(): JarvisConfig {
  // jarvis.config.json lives in jarvis-core's package dir (CLAUDE.md); both
  // apps read the same file so display overrides and the WS port stay in step.
  const p =
    process.env.JARVIS_CONFIG ??
    path.join(app.getAppPath(), "..", "jarvis-core", "jarvis.config.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as JarvisConfig;
  } catch (err) {
    console.warn(`[shell] unreadable ${p}: ${(err as Error).message} — using heuristic only`);
    return {};
  }
}

/**
 * Geometry heuristic with config escape hatch: displayOverrides (keyed by
 * display.id) pin first; of the rest, topmost → top, then leftmost → left,
 * rightmost → right, remainder → core. Windows doesn't guarantee stable
 * display ordering across reboots, which is why position, not index.
 *
 * Positions compare display CENTERS, not top-left corners: on the real desk
 * the flanking monitors are tall portrait panels whose top edges sit higher
 * than the actual top monitor, so corner-y would hand "top" to a side
 * display. Centers reflect where a display physically is.
 */
function assignPanels(
  displays: Display[],
  overrides: Record<string, PanelId>,
): Map<Display, PanelId> {
  const assigned = new Map<Display, PanelId>();
  const remaining = new Set<PanelId>(PANELS);

  for (const d of displays) {
    const pinned = overrides[String(d.id)];
    if (pinned && remaining.has(pinned)) {
      assigned.set(d, pinned);
      remaining.delete(pinned);
    }
  }

  const cx = (d: Display) => d.bounds.x + d.bounds.width / 2;
  const cy = (d: Display) => d.bounds.y + d.bounds.height / 2;

  let free = displays.filter((d) => !assigned.has(d));
  const take = (panel: PanelId, pick: (ds: Display[]) => Display) => {
    if (!remaining.has(panel) || free.length === 0) return;
    const d = pick(free);
    assigned.set(d, panel);
    remaining.delete(panel);
    free = free.filter((x) => x !== d);
  };

  take("top", (ds) =>
    ds.reduce((a, b) => (cy(b) < cy(a) || (cy(b) === cy(a) && cx(b) < cx(a)) ? b : a)),
  );
  take("left", (ds) => ds.reduce((a, b) => (cx(b) < cx(a) ? b : a)));
  take("right", (ds) => ds.reduce((a, b) => (cx(b) > cx(a) ? b : a)));
  take("core", (ds) => ds[0]!);

  if (remaining.size > 0) {
    console.warn(
      `[shell] ${displays.length} display(s) < 4 panels — unplaced: ${[...remaining].join(", ")}`,
    );
  }
  return assigned;
}

function createPanelWindow(display: Display, panel: PanelId, wsPort: number): void {
  const windowed = process.env.JARVIS_WINDOWED === "1";
  const win = new BrowserWindow({
    x: display.bounds.x + (windowed ? 60 : 0),
    y: display.bounds.y + (windowed ? 60 : 0),
    width: windowed ? 1100 : display.bounds.width,
    height: windowed ? 750 : display.bounds.height,
    frame: windowed,
    fullscreen: !windowed,
    alwaysOnTop: !windowed,
    autoHideMenuBar: true,
    backgroundColor: "#05080a",
    // No preload: the renderer talks to jarvis-core over a plain WebSocket
    // (see src/preload/index.ts) — nothing needs a privileged bridge yet.
  });

  const query = { panel, ws: String(wsPort) };
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${new URLSearchParams(query)}`);
  } else {
    void win.loadFile(path.join(app.getAppPath(), "out", "renderer", "index.html"), { query });
  }
}

app.whenReady().then(() => {
  const config = loadConfig();
  const wsPort = config.ws?.port ?? DEFAULT_WS_PORT;
  const displays = screen.getAllDisplays();
  const layout = assignPanels(displays, config.displayOverrides ?? {});

  for (const [display, panel] of layout) {
    console.log(
      `[shell] ${panel} → display ${display.id} @ ${display.bounds.x},${display.bounds.y} ` +
        `${display.bounds.width}x${display.bounds.height}`,
    );
    createPanelWindow(display, panel, wsPort);
  }

  // Frameless fullscreen windows have no close affordance.
  globalShortcut.register("CommandOrControl+Shift+J", () => app.quit());
  console.log("[shell] Ctrl+Shift+J quits the HUD");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
