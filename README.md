<img src="bee.png" align="center" width="140" alt="SwarmAI" />

# SwarmAI

> Your personal multi-channel AI assistant — one autonomous agent that talks to you across WhatsApp, Telegram, email, and the dashboard, with secure local-first storage and operator-controlled autonomy.

SwarmAI runs on your own machine. It coordinates a swarm of specialised agents to handle messaging, scheduling, knowledge retrieval, and document workflows, talking to you through whatever channel you happen to be on.

This repository is the **bundled binary distribution**. The SwarmAI source is proprietary and not published here. Runtime dependencies (`nodemailer`, `imapflow`, `better-sqlite3`, etc.) are pulled from public npm at install time.

- 🐝 **Vendor:** [NorthPeak Malaysia](https://northpeak.app)
- 🐛 **Issues / support:** https://github.com/northpeakmalaysia/SwarmAI/issues
- 📜 **License:** [PolyForm Noncommercial 1.0.0](LICENSE) — **free for personal use, not for commercial use**

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Install](#install)
- [Quick start](#quick-start)
- [What you can do](#what-you-can-do)
- [Multi-account email](#multi-account-email)
- [Pair the dashboard](#pair-the-dashboard)
- [Common operations](#common-operations)
- [Where your data lives](#where-your-data-lives)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Support](#support)

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js ≥ 22** | [Download from nodejs.org](https://nodejs.org). LTS or current both work. |
| **Git** | For cloning this repo. |
| **C/C++ toolchain** | Needed by `better-sqlite3` + `sharp` during `npm install`. See per-OS below. |

**Per-OS toolchain:**
- **Windows:** Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the *"Desktop development with C++"* workload.
- **macOS:** `xcode-select --install` (Xcode Command Line Tools).
- **Linux (Debian/Ubuntu):** `sudo apt install build-essential`. RHEL/Fedora: `sudo dnf groupinstall "Development Tools"`.

---

## Install

```bash
git clone https://github.com/northpeakmalaysia/SwarmAI.git
cd SwarmAI
npm install
```

`npm install` will compile `better-sqlite3` and `sharp` against your local Node version + OS. First-run takes ~30–60 seconds depending on machine.

Verify the install:

```bash
node swarmai.js --version
node swarmai.js --help
```

---

## Quick start

Three commands and you're running:

```bash
node swarmai.js setup   # 1. Interactive bootstrap — picks providers, creates vault, sets your master password
node swarmai.js start   # 2. Launch the gateway (server + dashboard)
node swarmai.js status  # 3. Check it's alive
```

The dashboard becomes available at **http://localhost:18789**. The gateway API at **http://localhost:7910**.

To stop:

```bash
node swarmai.js stop
```

---

## What you can do

Once running, SwarmAI gives you:

- **A single AI assistant across all your channels** — message it via WhatsApp, Telegram, email, or the dashboard chat. Same context, same memory.
- **Self-hosted, local-first storage** — your conversations, vault, and credentials stay on your machine. Nothing leaves unless you configure a remote provider.
- **Multi-channel email** with reply-to-thread, structured replies, and per-account isolation (see below).
- **Operator-gated autonomy** — you decide what your agent can do unattended via standing approvals.
- **Dashboard for management** — channels, approvals, settings, logs, real-time status.

---

## Multi-account email

SwarmAI supports running multiple email accounts simultaneously — `email:primary`, `email:support`, `email:sales`, etc. Pairings are isolated per account: a sender paired with `support@` cannot reach the agent via `ceo@`.

**List accounts:**

```bash
node swarmai.js email list
```

**Add an account** (Gmail / Outlook / Yahoo / iCloud presets autofill SMTP/IMAP):

```bash
node swarmai.js email add-account support \
  --provider gmail \
  --address support@example.com \
  --app-password "xxxx xxxx xxxx xxxx"
```

For Gmail/Yahoo/iCloud you need an **App Password** (not your account password). Generate one at:
- [Gmail App Passwords](https://myaccount.google.com/apppasswords)
- [Outlook App Passwords](https://account.microsoft.com/security)
- [Yahoo App Passwords](https://login.yahoo.com/account/security)
- [iCloud App-Specific Passwords](https://support.apple.com/en-us/102654)

For other providers use `--provider custom` and supply `--smtp-host`, `--smtp-port`, `--imap-host`, `--imap-port`.

**Remove an account:**

```bash
node swarmai.js email remove-account support
```

Changes take effect on the next server restart (`stop` then `start`).

You can also manage accounts from the dashboard's **Settings → Channels → Email** tab — the multi-account UI lists each account with add/remove inline.

---

## Pair the dashboard

The first time you open `http://localhost:18789` the dashboard asks you to pair. Generate a code from the CLI:

```bash
node swarmai.js pair dashboard --master
```

Type the 6-digit code into the dashboard. It mints a token bound to your master scope.

To revoke all dashboard tokens:

```bash
node swarmai.js logout dashboard
```

---

## Common operations

| Command | Purpose |
|---------|---------|
| `node swarmai.js status` | Health snapshot of the gateway |
| `node swarmai.js doctor` | Diagnose config + provider + network issues |
| `node swarmai.js logs --tail 50` | Stream the event bus (like `docker logs -f`) |
| `node swarmai.js whoami` | Show your effective master scopes |
| `node swarmai.js master-unlock` | Push your master passphrase to the running server |
| `node swarmai.js mfa enable` | Enable TOTP / recovery codes |
| `node swarmai.js channel list` | List configured channel adapters |
| `node swarmai.js task list` | Show background tasks via the running server |

Run `node swarmai.js <command> --help` for any subcommand to see all flags.

---

## Where your data lives

| Path | Contents |
|------|----------|
| `~/.swarmai/` (default) | Workspace root — vault, ledgers, sessions, peer state, replays |
| `~/.swarmai/vault.json` | AES-256-GCM encrypted secret store (channel credentials, etc.) |
| `~/.swarmai/masters.yaml` | Identity registry — master + paired guests |
| `~/.swarmai/agents/` | Per-agent persona files (`CHARTER.md`, `MANDATE.md`, `LEDGER.md`, …) |
| `~/.swarmai/sessions.db` | SQLite — conversation transcripts |
| `~/.swarmai/journal/` | Audit trail of approvals, channel events, autonomy decisions |

To move the workspace, set the `SWARMAI_WORKSPACE` environment variable before running:

```bash
SWARMAI_WORKSPACE=/path/to/workspace node swarmai.js start
```

**Backups:** copy the workspace directory while the server is stopped.

---

## Updating

```bash
git pull
npm install        # picks up dependency updates and rebuilds native modules
node swarmai.js stop
node swarmai.js start
```

If `npm install` fails after a Node upgrade, force a native rebuild:

```bash
npm rebuild better-sqlite3 sharp
```

---

## Troubleshooting

**"Cannot find module 'better-sqlite3'" or similar after Node upgrade.**
Native modules are compiled against a specific Node major version. Run `npm rebuild` to recompile.

**Mac: "swarmai is damaged and can't be opened" (or similar Gatekeeper message).**
This distribution isn't yet code-signed for Mac. You can right-click the JS file and choose "Open" once to accept it, or run via `node swarmai.js` directly.

**Windows: SmartScreen blocks execution.**
Same root cause as above — distribution isn't yet Authenticode-signed. Click "More info → Run anyway" once.

**`npm install` fails on Windows with `node-gyp` errors.**
Make sure Visual Studio Build Tools is installed with the *Desktop development with C++* workload. Run `npm install` from a fresh terminal so PATH picks up the new tools.

**Gateway doesn't start — port already in use.**
Default ports are **7910** (server) and **18789** (dashboard). Set `SWARMAI_PORT` and `SWARMAI_DASHBOARD_PORT` to override, or `node swarmai.js stop` to clean up a stale process.

**Forgot the master password.**
```bash
node swarmai.js reset masterpass --forgot
```
This wipes the vault and requires re-pairing every channel.

**Email channel keeps disconnecting.**
Check `node swarmai.js doctor` — most common causes are a wrong app password (not the account password) or IMAP being disabled in your provider's account settings.

---

## License

This software is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

> **In plain English:**
> - ✅ **Free for personal use** — run it on your own machine, for your own correspondence, learning, hobby projects.
> - ✅ **Free for noncommercial research / education / charity / nonprofit work**.
> - ❌ **NOT free for commercial use** — selling SwarmAI as a service, deploying it inside a for-profit organisation's operations, integrating it into a commercial product, or using it to operate a business is **not permitted** under this license.
> - 📩 **Need a commercial license?** Contact NorthPeak Malaysia.

The full license text is in [`LICENSE`](LICENSE). Cloning this repository does **not** grant you any rights beyond what the license states.

Third-party dependencies installed via `npm install` ship under their own licenses (mostly MIT / Apache-2.0 / ISC) — see `node_modules/<pkg>/LICENSE` for each.

---

## Support

- **Issues:** https://github.com/northpeakmalaysia/SwarmAI/issues
- **Vendor / commercial inquiries:** https://northpeak.app
- **Maintainer:** NorthPeak Malaysia 🇲🇾
