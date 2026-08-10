/**
 * Empty for now. Nothing renderer-side needs a privileged bridge yet — the
 * renderer talks to jarvis-core over a plain WebSocket, not IPC. Add a
 * contextBridge API here only if something later needs main-process access
 * (e.g. mic capture permissions) that a webpage-level API can't provide.
 */
export {};
