---
name: incident-postmortem
description: Draft a blameless post-mortem after an incident — timeline, root cause, contributing factors, action items.
metadata:
  swarmai:
    tags: [incident, ops, retrospective, blameless]
    requires:
      tools: [read, grep, web_fetch, memory_write]
    related_skills: [code-review, research]
  openclaw:
    tags: [postmortem]
---

# Incident Post-Mortem

Use after the user reports an incident has been resolved and asks for a write-up. Goal: a document that helps the team learn — not one that assigns fault.

## Process

1. **Establish the facts before opinions.** Ask the user for:
   - Detection time (UTC) and how it was detected (alert / customer report / scheduled job).
   - Resolution time and what action stopped the bleeding.
   - Customer impact — number of users, requests, dollars, or "internal only".
   - Logs / traces / dashboard links if available — `web_fetch` them now.
2. **Build the timeline first.** A bullet list with absolute UTC timestamps. Don't editorialise. Each line is "who/what observed/did what". When timestamps are uncertain, mark them `~`.
3. **Identify the *root cause* — and the contributing factors.** A single root cause is usually wrong: there's the technical trigger, the path that let it propagate, and the defence-in-depth gaps that should have caught it. Name all three.
4. **Action items must be:**
   - **Owned** — name a specific person/team, not "the team".
   - **Dated** — a target date, not "soon".
   - **Trackable** — links to an issue ticket, not a Slack thread.
5. **Blameless framing.** Replace "X did Y" with "Y happened because Z". The behaviour was rational given the information available; the *system* let the behaviour cause harm.
6. **Persist.** Call `memory_write` with the incident date + 1-line summary so future you can `memory_search "outage"` and find it.

## Output template

```
# Incident: <one-line summary> (<date UTC>)

## Impact
- Users affected: …
- Duration: HH:MM (detected HH:MM → resolved HH:MM)
- Severity: SEV-N

## Timeline (UTC)
- HH:MM …
- HH:MM …

## Root cause
…

## Contributing factors
1. …
2. …

## What went well
- …

## Action items
- [ ] OWNER, DATE — short description (link to ticket)
```

## What to avoid

- **Hindsight bias** ("they should have known X"). At the time of the incident they didn't. Frame around what *signal* was missing or what *check* didn't fire.
- **"Add more monitoring"** as the only action item. That's a symptom of avoiding the harder question of *why* the thing failed.
- **Promises you can't track.** If the action item won't have a ticket within 24h, drop it.

## Done when

The doc would be safe to share publicly with customers (after redacting names) AND useful to the team in 6 months when someone greps the wiki for "outages".
