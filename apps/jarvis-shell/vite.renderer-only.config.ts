import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Renderer-only dev server for headless visual verification (puppeteer
 * against http://localhost:5173/?panel=X&ws=8721) — lets screenshots run
 * without electron-vite spawning HUD windows over the live desktop.
 * Not used by the real app; `pnpm dev:shell` / `pnpm build` stay on
 * electron.vite.config.ts.
 */
export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
});
