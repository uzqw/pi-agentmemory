# pi-agentmemory

Our own pi extension for [agentmemory](https://github.com/rohitg00/agentmemory).

Forked from `integrations/pi` in the upstream repo because the upstream plugin
is unreliable: silent failures, no timeouts, stale health caching, and it feels
AI-generated rather than written by a heavy pi user. We iterate here.

## Differences from upstream (v0.1.0 baseline)

Baseline is upstream `index.ts` plus two local patches:

- `DEFAULT_TIMEOUT_MS = 3_000` — every call to the agentmemory server times out
  in 3s. Upstream only timed out `session/end`; a busy iii worker (compress LLM
  timeout is 120s) could block `before_agent_start` for two minutes per prompt.
- `session_start` is fire-and-forget — pi startup never waits on agentmemory.

## Install

```bash
mkdir -p ~/.pi/agent/extensions/pi-agentmemory
cp index.ts security.ts ~/.pi/agent/extensions/pi-agentmemory/
```

pi auto-discovers `~/.pi/agent/extensions/*/`; `/reload` hot-reloads.

## What it adds

- `memory_health` — is the local agentmemory server reachable
- `memory_search` — search prior decisions, bugs, workflows, preferences
- `memory_save` — write durable facts to long-term memory
- `/agentmemory-status` — health check command
- `before_agent_start` recall — injects relevant memories into the prompt
- `tool_result` / `agent_end` capture — observes turns back to agentmemory

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENTMEMORY_URL` | `http://localhost:3111` | agentmemory server URL |
| `AGENTMEMORY_SECRET` | (none) | Bearer token for protected instances |
| `AGENTMEMORY_PROJECT_NAME` | git toplevel basename | Override project bucket |
| `AGENTMEMORY_TOOL_OBSERVE` | `1` | Set `0` to disable per-tool observe posts |
| `AGENTMEMORY_REQUIRE_HTTPS` | off | `1` = refuse bearer token over plaintext non-loopback |

## Known upstream problems (TODO)

- Fail-silent everywhere: `callAgentMemory` catches all errors to `null`. If the
  engine dies mid-session, all captures silently drop.
- `lastHealthOk` only refreshed on session start / prompt submit — no recovery
  detection, no mid-session failure signal.
- `tool_result` fires one unqueued POST per tool call — hundreds of unordered
  requests on long sessions.
- `execFileSync git` on the prompt hot path for project resolution.
- `sessionId` fixed at session_start; resume/fork semantics are wrong.
