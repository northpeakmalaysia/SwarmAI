# Security Policy

We take the security of SwarmAI seriously. It runs on your own infrastructure,
handles your credentials, and acts on your behalf across messaging channels —
so we treat security as a first-class concern, not an afterthought.

## Supported Versions

SwarmAI is in active development (Beta · Pre-1.0). Security fixes target the
**latest published release** of [`@northpeak/swarmai`](https://www.npmjs.com/package/@northpeak/swarmai).
Please make sure you're on the latest version before reporting an issue.

## Reporting a Vulnerability

**Please report security issues privately — do not open a public GitHub issue.**

Preferred channels:

1. **GitHub Security Advisories** — use the **"Report a vulnerability"** button
   under the repository's **Security** tab (this opens a private advisory).
2. **NorthPeak** — reach us via <https://northpeak.app>.

When reporting, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version(s) and your environment (OS, Node version)
- Any suggested remediation

## What to Expect

- **Acknowledgement** within **3 business days**.
- An initial assessment and severity rating shortly after.
- Coordinated disclosure: we'll work with you on a fix and a disclosure
  timeline, and credit you in the release notes if you'd like.

Please give us a reasonable window to remediate before any public disclosure.

## Security Design Highlights

For context, SwarmAI ships with these protections by default:

- **Loopback-only by default** — the gateway binds to `127.0.0.1`. Network
  exposure (`HOST=0.0.0.0`) is opt-in, logs a loud warning, and refuses to
  start without an audit token configured.
- **Hardware-keyed secrets vault** — credentials are encrypted with a key held
  in the OS keyring, with optional master passphrase and machine-key rotation.
- **Master-gated approvals** — sensitive actions wait for explicit master
  sign-off.
- **MFA + hardware keys** — TOTP and per-master ed25519 keys with challenge
  signing.
- **Tamper-evident audit ledger** — every action is sealed and replayable.

Thank you for helping keep SwarmAI and its users safe.
