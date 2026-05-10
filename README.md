# SwarmAI

> Multi-agent messaging gateway — CEO Agent distribution.

SwarmAI runs an autonomous **CEO Agent** that coordinates a swarm of
specialised agents to handle messaging, scheduling, knowledge retrieval,
and document workflows across channels (WhatsApp, Telegram, email, and
more). This repository hosts the **bundled binary distribution** — the
SwarmAI source is proprietary and not published here. Runtime
dependencies are pulled from public npm at install time.

- **Homepage:** https://hub.northpeak.app
- **Issues / support:** https://github.com/northpeakmalaysia/SwarmAI/issues
- **Vendor:** NorthPeak Malaysia

## Prerequisites

- **Node.js ≥ 22**
- A C/C++ toolchain for native modules (`better-sqlite3`, `sharp`):
  - **Windows:** Visual Studio Build Tools with the "Desktop development with C++" workload
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** `build-essential` (Debian/Ubuntu) or equivalent
- Git (for cloning)

## Installation

```bash
git clone https://github.com/northpeakmalaysia/SwarmAI.git
cd SwarmAI
npm install        # pulls runtime deps; native modules compile here
node swarmai.js --help
```

`npm install` will compile `better-sqlite3` and `sharp` against your
local Node version and OS — this can take a minute or two on first run.

## Running

First-run interactive bootstrap, then bring up the gateway:

```bash
node swarmai.js setup     # configure channels, accounts, storage
node swarmai.js start     # start the gateway
```

The gateway server is bundled separately as `server.js` and is normally
spawned by the CLI. To run it standalone:

```bash
node server.js
```

Run `node swarmai.js --help` for the full command list.

## Layout

```
swarmai.js                          Bundled CLI entry
server.js                           Bundled gateway server
plugins/
  channel-whatsapp-personal.js      Loaded when WhatsApp channel is configured
  channel-telegram-client.js        Loaded when Telegram channel is configured
package.json                        Runtime dependencies (npm install)
README.md                           This file
```

## Distribution notes

- Source paths and identifier names are minified — the original package
  layout is not recoverable from the bundled artifacts.
- Sourcemaps are not shipped.
- Third-party dependencies are public on npm and are installed unmodified
  into `node_modules/`. The proprietary protection covers the SwarmAI
  source only.
- Native modules (`better-sqlite3`, `sharp`) compile during
  `npm install` so the binary matches your Node version + OS.

## Updating

```bash
git pull
npm install        # picks up dependency updates and rebuilds native modules
```

## Licensing

Use of this software is governed by proprietary license terms issued by
NorthPeak Malaysia. Cloning this repository does **not** grant a
license to use, modify, or redistribute the bundled artifacts. Contact
your vendor for terms.

## Support

Bug reports and questions: open an issue at
https://github.com/northpeakmalaysia/SwarmAI/issues or contact NorthPeak
Malaysia directly.
