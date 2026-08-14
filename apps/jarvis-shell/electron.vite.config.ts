import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // @jarvis-ui/shared ships TS source, so it must be bundled, not
  // externalized — electron can't import .ts at runtime.
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@jarvis-ui/shared"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@jarvis-ui/shared"] })],
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
  },
});
