---
name: interactive-terminals
description: Spawn and drive interactive PTY sessions (gemini, claude, gh auth login, psql, ssh, REPLs) via the `terminal.*` family — anything that prompts mid-run. Skip this for one-shot commands that exit cleanly; use `bash` for those.
metadata:
  swarmai:
    tags: [terminal, pty, cli, interactive]
    requires:
      tools:
        - terminal_spawn
        - terminal_wait
        - terminal_write
        - terminal_read
        - terminal_kill
---

# Interactive terminals (`terminal.*`)

You can spawn **interactive PTY sessions** (real TTY, ANSI-capable) via `terminal.spawn`. Each session is a child process you own and drive autonomously — keystrokes via `terminal.write`, output via `terminal.read`, and a blocking `terminal.wait` that resumes when the CLI quiets (is waiting for input) or exits. Use this for tools that prompt mid-run: `gemini`, `claude`, `gh auth login`, `psql`, `ssh`, `npm init`, `python` / `node` REPLs.

## Capacity

You own ≤ **5 concurrent terminals** at a time (`capPerAgent` in the `terminals:` Vital Signs row). Hitting the cap returns `code: 'cap-exceeded'` — kill an existing session before retrying. The dashboard shows every live terminal across every agent; the operator can intervene and kill any session via the Terminals pane.

## The control loop

This is the canonical shape, copy it for every interactive CLI:

```
const { terminalId } = await terminal.spawn({ command: 'gemini', tag: 'research' });
while (true) {
  const r = await terminal.wait({ id: terminalId, timeoutMs: 60000 });
  if (r.state === 'exited') break;
  if (r.code === 'timeout') {
    // CLI hung — read more, send Ctrl-C, or kill.
    break;
  }
  // r.tailLines contains the recent CLI output (~60 lines, ANSI-stripped).
  // Decide what to type next based on the prompt you see.
  await terminal.write({ id: terminalId, input: nextInput, sendEnter: true });
}
await terminal.kill({ id: terminalId, reason: 'task complete' });
```

## When NOT to use it

For one-shot commands that emit output and exit (e.g. `ls`, `git status`, `pnpm install`), prefer `bash` or `os_scheduler.create` — they are cheaper and do not hold a slot. Only reach for `terminal.*` when the binary prompts for input mid-run.

## 🚫 Do not preflight with `which`

The most common failure mode is asking yourself "is `claude` / `opencode` / `gh` installed?" by running `which <cmd>` (or `where.exe`) through the `bash` tool and refusing the spawn when it returns empty. **bash's PATH is not the PTY-spawn PATH** — especially on Windows where Git Bash, cmd.exe, and PowerShell each see different layers, and on POSIX where the operator's `~/.bashrc` additions don't flow into a non-login shell. **Just call `terminal.spawn`.** If the binary really isn't there you get `{ ok:false, code:"spawn-failed", error:"... ENOENT ..." }` with a hint pointing at how to install it. Trying *is* the check. Refusing to try when the operator asks is a confabulation failure mode — the agent reports "X is not installed" when X is right there on PATH.

## Idle detection

`terminal.wait` returns when either (a) the buffer matches a known prompt regex (`>`, `$`, `?`, `(y/n)`, `Enter your message:`, etc.) or (b) the CLI has been quiet for 1.5s. Pass `promptHints` on spawn for CLIs that have an unusual prompt the defaults miss.

## Auto-kill

A session that sits in `idle` state for 2 hours with no agent writes gets SIGTERMed automatically. Long-running interactive sessions are fine — the auto-kill only fires when you have actually walked away from a session you forgot to clean up.

## Tool roster

- `terminal.spawn` — start a session (pair-gated; rest are owner-checked).
- `terminal.wait` — block until idle/exit/timeout. **Your main loop primitive.**
- `terminal.write` — send keystrokes (with `sendEnter: true` to submit).
- `terminal.read` — pull output (last N lines or sinceCursor).
- `terminal.list` — your owned sessions with state + idle-age.
- `terminal.signal` — send POSIX signal (SIGINT = Ctrl-C).
- `terminal.resize` — adjust cols/rows for TUIs that need it.
- `terminal.kill` — SIGTERM + SIGKILL fallback. Use when done.
- `swarm_self.terminals` — read-only introspection (your sessions + peer counts).

## Output discipline

The operator sees every live terminal in the dashboard's Terminals pane via a read-only xterm.js mirror. Do not echo PTY output verbatim into your chat replies — summarise. The operator already has the raw stream if they want it.
