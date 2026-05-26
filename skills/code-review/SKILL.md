---
name: code-review
description: Review a diff or pull request for correctness, security, and adherence to project conventions. Output prioritised, actionable comments.
metadata:
  swarmai:
    tags: [code, review, quality, security]
    requires:
      tools: [bash, read, grep, glob]
    related_skills: [security-review, refactor]
  hermes:
    tags: [code-review]
---

# Code Review

Use when the user pastes a diff / commit / PR URL or asks "review this code". Goal: surface what would matter to the author, not exhaustively comment on every line.

## Process

1. **Read context first.** Before opening the diff, `read` the surrounding file(s) and `grep` for callers of changed symbols. Reviewing diff hunks without context is how you miss real bugs.
2. **Three-pass scan:**
   - **Pass 1: correctness.** Off-by-one, null-handling, error paths, race conditions, resource leaks. Run the test suite if `bash` is available — failing tests beat any opinion.
   - **Pass 2: security.** Input validation at boundaries, SQL/shell injection, secret leakage, auth bypass, unbounded allocations. Treat *every* user input and external response as hostile.
   - **Pass 3: convention.** Naming, file layout, comments, tests, types. This is the lightest pass — only flag things that violate the codebase's existing patterns.
3. **Prioritise.** Group findings into three buckets:
   - **Must-fix:** correctness + security issues. Block the merge.
   - **Should-fix:** convention drifts, missing tests, brittle abstractions.
   - **Nit:** style, naming. Mark each `(nit)` so the author can ignore them safely.
4. **Cite exact lines** as `path/to/file.ts:42`. Quote the smallest snippet that makes the comment understandable.
5. **Suggest, don't dictate.** "Consider X because Y" beats "use X". Offer the rewrite if it's small (<5 lines).

## What to avoid

- **Bikeshedding.** If two equally-valid approaches exist, leave it. The author chose; respect it unless there's a reason rooted in correctness or convention.
- **Drive-by refactors.** "While you're in here…" expands the PR and burns goodwill.
- **Silent approvals.** If you find no issues, say so explicitly — "I read X, Y, Z and can't find a problem" is more useful than 👍.

## Done when

Every must-fix has a concrete suggested change and a 1-line rationale. The author can act on each comment without coming back to ask "what did you mean?"
