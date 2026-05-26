---
name: research
description: Investigate a topic by triangulating across sources, then deliver a tight written summary with citations.
metadata:
  swarmai:
    tags: [research, summarisation, web]
    requires:
      tools: [web_search, web_fetch, memory_write]
    related_skills: [brainstorm, planning]
---

# Research

Use when the user asks "what is X", "how does Y work", "find me Z" — anything that needs gathering external information and condensing it.

## Process

1. **Frame the question.** Before searching, restate the user's question in your own words. If it's vague, ask one clarifying question — don't search blindly.
2. **First-pass scan.** Run `web_search` with 2–3 different query phrasings. Skim the titles/snippets — don't fetch yet.
3. **Triangulate.** Pick 3–5 sources that look authoritative AND span perspectives (an official doc + a critic + a recent blog post is better than three official docs).
4. **Fetch & extract.** Call `web_fetch` on each. Pull the 1–2 sentences that *answer* the question, not the framing.
5. **Synthesise.** Write a 3–6 paragraph summary that:
   - Opens with the answer in one sentence.
   - Names the open disagreements (if any) — readers spot bias when you don't.
   - Cites each claim with a numbered footnote linking to the source URL.
6. **Persist.** If the topic is likely to come up again, call `memory_write` with a 1-line note + the canonical source URL.

## What to avoid

- **Confirmation bias.** If your first 2 sources agree, deliberately search for a counterargument.
- **Paywalled sources** as the *only* citation — readers can't verify.
- **Time-bombed claims.** Date anything that depends on "current" state ("As of 2026-04-…").
- **Unattributed numbers.** If you cite a stat, the source URL must back it up *with the same number*.

## Done when

The user can copy the summary into Slack/email and answer follow-ups confidently — without re-doing your search.
