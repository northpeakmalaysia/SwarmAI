---
name: humans-on-call
description: Reach a registered human (operator, expert, stakeholder) via the `human.*` tool family for judgment / authority / domain context a peer agent cannot supply. Use sparingly — human attention is the most expensive resource on call.
metadata:
  swarmai:
    tags: [humans, escalation, judgment]
    requires:
      tools:
        - human_ask
        - human_notify
        - human_assign_task
        - human_poll_task
        - human_find
        - swarm_self_humans
---

# Humans on call

In addition to peer agents, the operator may have registered **humans** you can reach for help (`humans:` row in Vital Signs). Each one has an `id`, a `bio` describing when to ask them, and one or more channels (email / Telegram / WhatsApp / Slack / Discord) you reach them through.

## When to ask a human (vs a peer)

A peer's answer is advisory — useful when you need synthesis, drafting, code review. Reach for a human only when the call genuinely needs human *judgment*, *authority*, or *domain context* the peers don't have. Examples: final approval on a contract, a policy call only the operator can make, sensitive-stakes domain expertise (legal / finance / safety).

**Cost asymmetry**: asking a peer is essentially free; asking a human costs their attention and an interrupt. If a peer can plausibly answer, ask the peer first.

## How to frame the ask

One sentence of context, one specific question, the deadline, what "done" looks like. Humans don't want a wall of transcript — they want to know what you actually need from them.

## Routing

Read each human's `bio` / `tags` / `capabilities` to pick the right person. A `bio` of "senior legal counsel, contract review" is the wrong shoulder to tap for a database question.

If you don't know who to ask, call `human.find` first; if you have a `taskId`, use `human.poll_task`; if you don't, use `human.tasks.list { status: 'pending' }` to catch up. Don't guess at ids.

## Synchronous vs durable

- `human.ask` — sync question, blocks for reply. Use when you can plausibly wait (minutes-to-hours).
- `human.notify` — one-way FYI, no reply expected, no task row. Use for status updates.
- `human.assign_task` — durable async with optional `dueBy`. Use for fire-and-forget work that can come back later; check status with `human.poll_task`.

## Full `human.*` tool roster

- **Roster** — `human.list` (paginated roster), `human.get` (single record), `human.find` (rank the roster by a topic query — use BEFORE asking to pick the right person).
- **CRUD** — `human.register` (add), `human.update` (modify), `human.remove` (archive; pass `hard:true` for permanent delete).
- **Dispatch** — `human.ask`, `human.notify`, `human.assign_task` (see above).
- **Task ops** — `human.tasks.list` (discover outstanding tasks without a taskId), `human.poll_task` (status detail), `human.nudge_task` (re-send the prompt as a reminder; keeps the same taskId), `human.cancel_task` (drop a pending task).
- **Introspection** — `swarm_self.humans` (read-only roster summary; no PII; safe to reason over in prompt).

## Discipline

- **Don't spam.** Don't ask the same person twice in the same day for the same thing. If you're tempted to re-ping, surface to the operator first.
- **PII discipline.** `swarm_self.humans` gives you the roster (ids, roles, bios) — that's safe to reason over in prompt. Specific addresses (email / phone / chat ids) come from `human.get` and are master-gated; don't echo them back into chat.
- **Audit.** Every outbound + every reply is logged to LEDGER. The dashboard's Humans pane shows the recent-activity tail.

## Done when

The human has responded (sync) OR the task is dispatched with a `taskId` you can poll later (async) — AND the operator can see in the dashboard what was asked of whom.
