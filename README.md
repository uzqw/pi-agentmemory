# pi-agentmemory

Our own pi extension for [agentmemory](https://github.com/rohitg00/agentmemory).

Forked from `integrations/pi` in the upstream repo and rearchitected. The
upstream plugin loses observations silently when the server is down, fires
one unqueued POST per tool call, caches health only at session start, and
can block a prompt for minutes on a busy iii worker. This rewrite replaces
that with an outbox-first design: **nothing is captured that isn't already
on disk, and the session never waits on the server.**

## Architecture

Three small modules, one thin `index.ts` wiring them into pi events:

- **`src/outbox.ts` — `LocalOutbox`.** Append-only JSONL buffer at
  `~/.pi/agent/agentmemory/outbox.jsonl`. Every capture is written
  synchronously before delivery is attempted, so a dead server or a
  mid-flight process crash cannot silently drop it. Confirmed deliveries are
  removed by atomic temp-file + rename; torn lines from a crash mid-append
  are repaired/skipped on read.
- **`src/sender.ts` — `Sender`.** Persists each observation via the outbox,
  then delivers in the background (bounded HTTP timeout); confirmed records
  are removed, failures stay queued. `flush()` delivers pending records in
  order — called when the server transitions back to up, at `session_start`
  when healthy, and at `session_shutdown` for a last chance before exit.
- **`src/health.ts` — `HealthMonitor`.** State machine (`unknown → up/down`)
  fed by health checks; requires 2 consecutive failures before declaring
  `down` so one flaky request doesn't flap the status line. A transition to
  `up` doubles as the flush trigger.
- **`index.ts`** — event wiring and the tools/command below. Capture paths
  (`tool_result`, `agent_end`, `prompt_submit`) never await the server;
  recall (`before_agent_start`) is a single bounded call (3 s cap).

## Behavior guarantees

1. **Never silently loses a captured memory** — every observation is on disk
   before delivery is attempted; queued records are delivered once the
   server is reachable again.
2. **Never blocks or degrades the session** — capture is fire-and-forget with
   durable fallback; `session_start` doesn't wait on agentmemory at all;
   server calls carry a 3 s timeout cap.
3. **Health and failures are visible** — a status line (`🧠 agentmemory down ·
   3 queued`) and the `/agentmemory-status` command show state, last failure
   reason, and outbox queue depth. While the server is down, health is
   re-checked every 15 s so recovery is detected mid-session.

## Tools and command

- `memory_health` — is the local agentmemory server reachable and healthy
- `memory_search` — search prior decisions, bugs, workflows, preferences
- `memory_save` — write durable facts to long-term memory
- `/agentmemory-status` — health state, last failure, queued observations

Events: `session_start`, `before_agent_start` recall injection, `tool_result`
capture, `agent_end` capture, `session_shutdown`.

## Install

```bash
mkdir -p ~/.pi/agent/extensions/agentmemory
cp index.ts security.ts ~/.pi/agent/extensions/agentmemory/
cp -r src ~/.pi/agent/extensions/agentmemory/src
```

`index.ts` imports `./src/outbox.js`, `./src/sender.js`, and `./src/health.js`
at load time, so `src/` must be copied too or the extension fails to load.

pi auto-discovers `~/.pi/agent/extensions/*/`; `/reload` hot-reloads.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENTMEMORY_URL` | `http://localhost:3111` | agentmemory server URL |
| `AGENTMEMORY_SECRET` | (none) | Bearer token for protected instances |
| `AGENTMEMORY_PROJECT_NAME` | git toplevel basename | Override project bucket |
| `AGENTMEMORY_TOOL_OBSERVE` | `1` | Set `0` to disable per-tool observe posts |
| `AGENTMEMORY_REQUIRE_HTTPS` | off | `1` = refuse bearer token over plaintext non-loopback |

## Development

Requires Node 22 and pnpm.

```bash
pnpm install && pnpm test   # full verification on a clean checkout
pnpm typecheck              # tsc, noEmit, covers src/
```

Tests live next to the modules they cover (`src/*.test.ts`, vitest).
