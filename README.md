<p align="center">
  <img src="https://raw.githubusercontent.com/northpeakmalaysia/SwarmAI/main/assets/logo.png" alt="SwarmAI" width="104" height="104" />
</p>

<h1 align="center">SwarmAI&nbsp;—&nbsp;CEO Agent</h1>

<p align="center">
  <strong>Your AI workforce that thinks, collaborates, and acts.</strong><br/>
  A self-hosted runtime where one primary agent runs your operation — spawning
  department peers, watching your inboxes, driving a real browser, and reporting
  back across every channel you live in.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-what-you-get">Features</a> &bull;
  <a href="#-the-console">The Console</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="#-security">Security</a> &bull;
  <a href="#-support-the-project">Sponsor</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@northpeak/swarmai"><img src="https://img.shields.io/npm/v/@northpeak/swarmai?color=%23f5a623&label=npm&logo=npm" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522-43853d?logo=node.js&logoColor=white" alt="Node >= 22" />
  <img src="https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue" alt="License: PolyForm Noncommercial 1.0.0" />
  <img src="https://img.shields.io/badge/status-Beta%20%C2%B7%20Pre--1.0-orange" alt="Status: Beta" />
  <img src="https://img.shields.io/badge/tests-1%2C200%2B%20passing-brightgreen" alt="1,200+ tests" />
  <img src="https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-lightgrey" alt="Cross-platform" />
  <a href="#-support-the-project"><img src="https://img.shields.io/badge/%E2%9D%A4%20sponsor-SwarmAI-ff69b4" alt="Sponsor" /></a>
</p>

---

> **Your Main Agent is born here.** During setup you give it a name — by
> default we call it *Athena*. From that moment it runs as your **CEO Agent**:
> it fields the messages you'd normally answer, spins up specialist peers when
> a task is bigger than one mind, drives long-running plans, and learns from
> every session through the Playtime loop.

<p align="center">
  <img src="https://raw.githubusercontent.com/northpeakmalaysia/SwarmAI/main/assets/console-hero.png" alt="SwarmAI Console — desktop with the CEO Agent chat and 27 operational modules" width="900" />
  <br/>
  <em>The SwarmAI Console — a full desktop-style workspace running entirely on your machine.</em>
</p>

## Why SwarmAI

Most "AI assistants" are a chat box. SwarmAI is an **operation**.

- **It's a team, not a bot.** One CEO Agent delegates to department peers
  (Ops, Tech, HR, Research, Marketing…) and coordinates them over a live
  peer-bus — the way a real org delegates work.
- **It's always on.** Install it as an OS service and it keeps watching your
  email, webhooks, and RSS feeds, acting on what matters and briefing you on
  the rest.
- **It's yours.** Fully self-hosted. Your data, conversations, and credentials
  stay on your infrastructure. The platform is free — you only pay for the LLM
  calls, with **your own provider key**.
- **It's accountable.** Every action is gated by a master, every secret lives
  in a hardware-keyed vault, and every step lands in a tamper-evident audit
  ledger you can replay turn by turn.

## ✨ What You Get

| | |
|---|---|
| 🧠 **Multi-agent runtime** | A primary CEO Agent that spawns and supervises specialist peers, with live inter-agent messaging on the peer-bus. |
| 💬 **6 channels** | WhatsApp & Telegram (personal accounts), Email (IMAP/SMTP, multi-account), Discord, Slack, and HTTP webhooks. |
| 🌐 **Real browser control** | Pair a real, authenticated browser so agents can act on the live web — not a sandboxed scrape. |
| 🛠️ **65+ tools** | File ops, web, documents (PDF/DOCX/XLSX/PPTX), code execution, and an extensible Hub of plugins. |
| 🔌 **6 LLM providers** | Bring your own key — route across providers with an explainable model-routing tree. |
| 👁️ **Always-on watchers** | Email / webhook / RSS / channel sources feed a Source → Match → Action trigger engine. |
| ⏪ **Replay & time-travel** | Inspect any recorded session, scrub the timeline, branch from any turn, and export. |
| 🔐 **Hardware-key auth + MFA** | ed25519 hardware keys, TOTP, a master-gated approvals queue, and a sealed audit ledger. |
| 🤝 **Meeting rooms** | Multi-party rooms with agents, peers, and human guests — live chat, agent-driven presentations, file sharing. |
| 🖥️ **Remote & device agents** | Pair worker hosts and editors/CLIs to put agents to work across multiple machines. |

## 🚀 Quick Start

**Prerequisites:** Node **≥ 22**. (Optional, for vector memory & queues: Docker with Qdrant + Redis.)

```bash
# Install the CLI globally
npm install -g @northpeak/swarmai

# First-run onboarding — workspace, master account, secrets vault, channels
swarmai setup

# Launch the gateway (server + console)
swarmai start
```

Then open the console and pair this browser:

```bash
swarmai pair dashboard            # prints a 6-digit code
# Visit http://localhost:18789 and enter the code
```

| Endpoint | URL |
|----------|-----|
| **Console (dashboard)** | http://localhost:18789 |
| **Gateway API** | http://localhost:7910 |

> 💡 Run `swarmai` with no arguments to drop into an interactive REPL, or
> `swarmai --help` for the full command list.

### Run it as a service

Keep your CEO Agent online across reboots:

```bash
swarmai daemon install     # systemd · launchd · Windows Service
swarmai daemon status
```

## 🖥️ The Console

The console is a **desktop shell** — every module opens in its own floating,
resizable window, searchable from the Start Menu (`Ctrl/Cmd + K`).

<p align="center">
  <img src="https://raw.githubusercontent.com/northpeakmalaysia/SwarmAI/main/assets/console-agents.png" alt="Agents roster — the CEO Agent and its department peers" width="48%" />
  &nbsp;
  <img src="https://raw.githubusercontent.com/northpeakmalaysia/SwarmAI/main/assets/console-channels.png" alt="Channels health — Telegram, Email, WhatsApp, and webhook adapters" width="48%" />
</p>
<p align="center">
  <em>Left: the agent roster with department peers. Right: live channel health across Telegram, Email, WhatsApp, and webhooks.</em>
</p>

A few of the panes you'll use daily:

| Pane | What it's for |
|------|---------------|
| **Athena** | Primary chat with your CEO Agent. |
| **Agents** | Roster of every agent + one-click spawn. |
| **Peer-bus** | Live animated view of inter-agent message flow. |
| **Meeting Room** | Multi-party rooms with agents, peers, and external guests. |
| **Playtime** | Scheduled background sweeps — Free Play / Practice / Make-Believe. |
| **Sources & Triggers** | Watchers and a Source → Match → Action automation flow. |
| **Approvals** | Master-gated queue for persona edits, spawns, and tool calls. |
| **Replay** | Session timeline with scrub, branch, and export. |
| **Ledger** | Sealed, tamper-evident audit log. |
| **Hub** | Marketplace for plugins and channel adapters. |

…plus Channels, Tasks, Browsers, Logs, Doctor, MFA, Hardware Keys, Body Map,
Remotes, Devices, MCP, Autonomy, and Model Tree — **27 modules in all.**

## 🗂️ CLI Cheat Sheet

```bash
swarmai setup                     # First-run onboarding
swarmai start | stop | status     # Lifecycle
swarmai doctor                    # Diagnostics (config, network, providers)
swarmai logs --tail 100           # Stream the event bus

swarmai whatsapp pair             # Pair the WhatsApp personal channel
swarmai telegram-client pair      # Pair the Telegram personal channel
swarmai channel list              # All configured channel adapters
swarmai email add-account         # Add an email account

swarmai spawn ops --persona ops   # Spawn a peer agent
swarmai peer list                 # Inspect running peers

swarmai daemon install            # Run as an OS service
swarmai mfa enable                # Turn on TOTP
swarmai key enroll                # Enroll a hardware key
```

Every subcommand supports `swarmai <subcommand> --help`.

## 🏗️ Architecture

```
                         ┌──────────────────────────────┐
   Telegram · WhatsApp   │        CEO Agent (Athena)     │
   Email · Discord       │   reasoning loop · planning   │
   Slack · Webhooks ────▶│   delegation · self-healing   │
                         └───────────────┬──────────────┘
                                         │ peer-bus
                ┌────────────────┬───────┴────────┬────────────────┐
                ▼                ▼                ▼                ▼
            Ops Peer        Tech Peer        HR Peer         Research Peer
                │                │                │                │
                └────────────────┴───────┬───────┴────────────────┘
                                         ▼
            ┌────────────────────────────────────────────────────┐
            │  Gateway (:7910)  ·  Console (:18789)               │
            │  Tools · Triggers · Browser control · Approvals     │
            │  Secrets vault (hardware-keyed) · Audit ledger      │
            └───────────────┬───────────────────┬────────────────┘
                            ▼                   ▼
                      Qdrant (vectors)     Redis (queues/cache)
```

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js ≥ 22, ESM |
| **Console** | React 18 desktop-shell UI |
| **Storage** | SQLite (better-sqlite3) · Qdrant (vector memory) · Redis (queues/cache) |
| **Real-time** | WebSocket event bus |
| **Channels** | whatsapp-web.js · Telegram MTProto · IMAP/SMTP · Discord · Slack · webhooks |
| **Security** | ed25519 hardware keys · TOTP · OS keyring vault · sealed audit ledger |
| **Packaging** | Single-binary bundle, cross-platform daemon |

## 🔐 Security

Security isn't a feature here — it's the foundation.

- **Loopback by default.** The gateway binds to `127.0.0.1`. Network binding
  (`HOST=0.0.0.0`) is opt-in, logs a loud warning, and **refuses to start**
  without an audit token — so the ledger is never served unauthenticated.
- **Hardware-keyed vault.** Secrets are encrypted with a key held in your OS
  keyring; optional master passphrase and machine-key rotation.
- **Master-gated actions.** Sensitive operations (persona edits, spawns, tool
  calls) wait in an approvals queue until a master signs off.
- **MFA + hardware keys.** TOTP and per-master ed25519 keys with challenge
  signing and an audit trail.
- **Tamper-evident ledger.** Every action is sealed into a replayable audit log.

Found a vulnerability? See [SECURITY.md](SECURITY.md) — please report it
privately first.

## 📊 Project Status

SwarmAI is in **active development** — **Beta · Pre-1.0**, built deliberately
and shipped in phases.

| | |
|---|---|
| Development phases shipped | **14** |
| Automated tests passing | **1,200+** |
| Built-in tools | **65+** |
| LLM providers | **6** |
| Communication channels | **6** |
| Console modules | **27** |

This is real, working software in daily use — not a prototype or a promise.

## 🤝 Support the Project

SwarmAI is built and maintained by a small, independent team at **NorthPeak
Malaysia**. The platform is **free to self-host**, and we intend to keep it
that way — your sponsorship is what makes that sustainable.

**Your support directly funds:**

- 🚀 New channels, tools, and Hub plugins
- 🛡️ Security hardening and the road to a stable 1.0
- 📚 Documentation, guides, and onboarding
- 🐛 Faster issue response and community support

### How to sponsor

| Where | Link |
|-------|------|
| ❤️ **GitHub Sponsors** | Use the **Sponsor** button at the top of this repository |
| 🌐 **NorthPeak (web)** | <https://northpeak.app/swarmai/index.html> |
| ☕ **Ko-fi** | *coming soon* |

> **Sponsoring on behalf of a company?** Sponsorship and **commercial
> licensing** go hand in hand — see below. Reach us through
> <https://northpeak.app> and we'll set you up with the right tier and an
> invoice.

If you can't sponsor, a ⭐ on this repo and sharing SwarmAI still helps more
than you'd think. Thank you. 🙏

## 📄 License & Commercial Use

This distribution is licensed under **[PolyForm Noncommercial 1.0.0](LICENSE)**.

- ✅ **Free** for personal, educational, research, and other noncommercial use.
- 💼 **Commercial use requires a license.** If you (or your organization) use
  SwarmAI to make money, get in touch — commercial licensing keeps the project
  funded and gives you support, terms, and an invoice your finance team will
  accept.

For commercial licensing, partnerships, or anything else, reach us at
<https://northpeak.app>.

---

<p align="center">
  Built with care by <a href="https://northpeak.app"><strong>NorthPeak Malaysia</strong></a> 🇲🇾<br/>
  <sub>A swarm of agents, working for you.</sub>
</p>
