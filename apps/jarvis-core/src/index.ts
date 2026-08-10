/**
 * jarvis-core entry point — not yet implemented.
 *
 * This is a scaffold, not a stub implementation: the package.json deps (ws,
 * @jarvis-ui/shared) and tsconfig are real and installable, but the actual
 * WS server, subagent registry, and voice pipeline described in
 * ../../ARCHITECTURE.md haven't been written. See ../../CLAUDE.md for the
 * build brief this repo was set up for.
 *
 * Shape to build toward (§3 of ARCHITECTURE.md):
 *   - a `ws` server on config.ws.port (see jarvis.config.example.json)
 *   - one module per subagent under ./subagents (cacc-comms, cacc-fleet,
 *     cacc-checks, momentum-comms, momentum-fleet, momentum-crm,
 *     personal-tasks, subscriptions-usage), each returning a ConnectorStatus
 *     alongside its data so a not-yet-wired connector renders as
 *     "not configured" instead of fabricated data — four of these are
 *     currently blocked, see ARCHITECTURE.md §8, and must degrade this way
 *     rather than stall the rest of the build
 *   - a poll loop (default 60s) broadcasting `ServerMessage` (panel-state)
 *     to subscribed clients, per packages/shared's WS protocol
 */
