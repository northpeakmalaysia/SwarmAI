---
name: browser-autonomy
description: Drive a paired browser through real actions (post, comment, send, fill, click submit) end-to-end on modern SPAs — read action feedback correctly, fall back across engines when blocked, and respect each platform's automation/ban risk. Use when the operator asks for a browser action, not a draft.
metadata:
  swarmai:
    tags: [browser, automation, web, spa, safety]
    requires:
      tools:
        - browser_navigate
        - browser_read_page
        - browser_click
        - browser_fill
        - browser_submit
        - browser_wait_for
        - browser_scroll
        - browser_run_script
        - playwright_navigate
        - playwright_fill
        - playwright_click
        - playwright_evaluate
---

# Browser autonomy

When the operator asks you to perform an action on a webpage — *post*, *comment*, *send*, *reply*, *fill the form*, *click submit* — **drive the browser to completion**. Don't generate copy and ask the operator to paste it. That is a failure mode, not help. (The one exception is high-ban-risk platforms — see *Platform risk* below — where the safe play is sometimes to stage, not send.)

## The execution loop

1. `browser_navigate` to the destination (or `browser_list_tabs` first if a tab may already be open).
2. `browser_read_page` to snapshot visible elements. Identify inputs by `aria-label`, `text`, and `label`.
3. `browser_click` the input/composer. **Modern SPAs (Facebook, X, LinkedIn, Gmail) render a placeholder that expands into the real input only after the first click** — so click, then `browser_read_page` again to see the expanded form.
4. `browser_fill` the content.
5. `browser_click` the submit/post/send button — identify by visible text or `aria-label` ("Post", "Send", "Submit").
6. `browser_wait_for` a confirmation cue, then report the outcome in one line.

## Reading whether an action actually worked (do not misread failure)

`browser_click` / `browser_submit` return more than `navigated`. **`navigated:false` is NOT failure** — opening a modal, menu, or composer causes no navigation. Judge success from:

- **`dialogOpened: true`** → a modal/composer appeared (e.g. "Start a post"). The click worked — `browser_read_page` again to see it.
- **`domChanged: true`** → the page reacted. Likely worked; re-read to confirm.
- **both false** → the click probably missed. The target may be the wrong element, or inside an iframe — re-read and pick a better id.

`browser_read_page` already captures **portals/modals, open shadow-DOM, and iframe content** (iframe elements carry a `frameId`; pass their `id` back verbatim — it routes to the right frame). So after any click that should reveal new UI, re-read before concluding anything.

## When a step fails — fall back across engines

The paired extension drives the operator's *real* browser (their session). Some modern composers refuse it. Escalate in this order:

1. **Selector miss** → `browser_read_page` again (DOM may have changed) + try another id. At least twice before giving up.
2. **Off-screen / not clickable** → `browser_scroll` to it, retry.
3. **`browser_fill` returns `not-fillable`** → it's a contenteditable / Lexical / ProseMirror / Slate editor. Switch to `playwright_fill` with `strategy: "type"`.
4. **`browser_run_script` returns `csp-blocked`** → the page forbids in-page eval. Switch to `playwright_evaluate` (CDP bypasses page CSP).
5. **Modal in the way** (cookie banner, login prompt) → dismiss it, then resume.

Only after the loop genuinely cannot complete (≈3 retries, an auth wall, a CAPTCHA) do you tell the operator what blocked you — name the blocker concretely.

> **Engine note:** `playwright_*` is a *separate isolated* browser, not the operator's. It does NOT share their login by default, and replaying their session into it raises ban risk (see below). Prefer the extension for "act as me"; use Playwright for hostile editors / CSP-blocked eval / public-site scraping.

## Platform risk — automation can get the operator's account banned

Automation is automation even on a real browser. Match your approach to the target:

- 🔴 **High-risk (LinkedIn, Facebook/Instagram, X, TikTok):** these actively detect and **ban/restrict accounts** for automated posting/engagement.
  - **Prefer an official API tool** if one is installed for the platform — it's ban-safe by design. Use it before touching the browser.
  - If you must use the browser: **go human-paced** (don't burst; one action, not twenty), and for *posting / connecting / messaging* either proceed only when the operator explicitly said "post/send it", **or** open + fill the composer and **stop before the final submit** so the operator clicks publish. Don't silently auto-blast.
  - Never replay their session into Playwright against these sites (session-anomaly + automation fingerprint → security checkpoint).
- 🟢 **Low-risk (the operator's own apps, internal admin panels, B2B SaaS they pay for, read-only/scraping):** drive to completion normally — this is the default and drafting-and-bailing is the failure mode.

When unsure of the tier, say so and ask before taking an irreversible action on a 🔴 platform.

## Safety

Never auto-submit destructive actions (delete account, transfer money, send to "All Contacts") without explicit operator confirmation in the same turn. For everyday content on 🟢 targets the operator's request *is* the confirmation — proceed.

## Token budget

`browser_read_page` (default `maxElements: 100`) is cheap but don't spam it — once per page state. After every `click`/`navigate` that changes the page, expect one more read.

## Done when

The action landed (confirmation toast / posted entry visible / URL changed) — or, on a 🔴 platform staged for the operator — AND you've reported the outcome in one line, not a wall of step-by-step narration.
