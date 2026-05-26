---
name: document-authoring
description: Generate polished docx, xlsx, pptx, pdf and markdown files — Word reports, Excel spreadsheets, PowerPoint decks, branded PDFs, invoices. Use whenever the task involves creating a document, report, spreadsheet, presentation, deck, or exporting content to a file.
metadata:
  swarmai:
    tags: [document, docx, xlsx, pptx, pdf, report, spreadsheet, presentation, deck, export, invoice]
    requires:
      tools:
        - document_create
---

# Document authoring

You create real, well-structured files with the **`document_create`** tool — never paste a big blob and tell the operator to "save it as .docx yourself". One call produces the finished file in the workspace.

## Pick the format from the deliverable

| Deliverable | `format` | Primary input |
| --- | --- | --- |
| Word report / memo / letter | `docx` | `content` (Markdown) |
| Spreadsheet / data table / budget | `xlsx` | `sheets` (preferred) |
| Slide deck / pitch | `pptx` | `slides` |
| Branded PDF / invoice / printable | `pdf` | `content` (Markdown) or `html` |
| Plain notes / handoff | `md` | `content` |

Always match the file extension in `path` to `format` (e.g. `format:"docx"` → `path:"report.docx"`), or the tool returns `extension-mismatch`.

## docx / md / pdf — Markdown content

Pass `content` as Markdown. Supported: headings, ordered/unordered lists, tables, **bold**/_italic_/`code`, fenced code blocks, blockquotes, horizontal rules. Pass `title` for a cover page (docx renders one when title + content is long; footer page numbers are automatic).

```
document_create({ format:"docx", path:"reports/Q3-review.docx",
  title:"Q3 Business Review",
  content:"## Summary\n\n- Revenue up 18%\n\n| Metric | Q2 | Q3 |\n|---|---|---|\n| MRR | 12k | 14k |" })
```

## xlsx — use `sheets`, not a markdown table

Prefer the structured `sheets` form (array of `{ name, rows }`). Currency/percentage columns auto-format and column widths size from content. A markdown table in `content` works but gives you less control.

```
document_create({ format:"xlsx", path:"data/pipeline.xlsx",
  sheets:[{ name:"Deals", rows:[["Company","Stage","Value"],["Acme","Won",50000]] }] })
```

## pptx — use `slides`

Each slide takes `title`, `bullets` (array) and/or `body`, plus optional `notes` (speaker notes).

```
document_create({ format:"pptx", path:"decks/launch.pptx",
  slides:[
    { title:"GateKeeper Cloud", bullets:["CI quality gates","Self-serve setup"], notes:"Open with the pain." },
    { title:"Why now", body:"Quality infra is the missing DevOps layer." } ]})
```

## PDF works out of the box

Just call `document_create({ format:"pdf", ... })`. **Do NOT** probe the host for pandoc / LaTeX / wkhtmltopdf / weasyprint / libreoffice first — the tool uses pandoc when present and falls back to headless Chrome/Edge (every Windows host ships Edge). For pixel-perfect output (invoices, branded reports) pass `html` instead of `content`. Only use a Python fallback if the tool actually returns `ok:false, code:"pdf-renderer-unavailable"`.

## House style

- Pass `theme` to override brand colours/fonts per call when the operator has a brand.
- Lead with a one-line summary / TL;DR; use headings and tables over walls of prose.
- After creating the file, tell the operator the **path** and a one-line summary of what's inside — don't dump the whole content back into chat.
- Multi-deliverable asks (e.g. "report + spreadsheet + deck"): make **one `document_create` call per file**, not one giant call.
