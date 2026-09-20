# JobPilot — Phase 1 frontend

React 18 + TypeScript + Vite + Tailwind implementation of the Phase 1 spec: resume builder,
JD-tailoring engine, application tracker, dashboard analytics, discovery agent and interview prep.

It runs **with or without the FastAPI backend**. In `mock` mode the entire product — including the
parsing, matching, tailoring, scoring and question-generation logic — runs in the browser against a
localStorage database, so the UI can be reviewed end to end today and pointed at real endpoints
later without touching a single component.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Sign in with **Open the demo account** (or `demo@jobpilot.app` / `demo1234`). That seeds ten weeks
of applications, a master resume, two tailored variants, six parsed job descriptions, two saved
searches and a discovery feed — enough history for the analytics to say something real.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then a production build (chunked: app / react / charts / dnd) |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Types only |
| `npm run smoke` | **Engine test suite** — 82 assertions over the whole pipeline, no browser needed |

`npm run smoke` is the fastest way to verify the product logic after a change. It parses a real
posting, matches it against the seeded resume, tailors, asserts the truthfulness contract, drafts a
cover letter, generates interview questions and a STAR answer, round-trips a resume import, renders
every template, and drives the analytics + write paths through the mock API.

## Switching to the real backend

```dotenv
# .env
VITE_API_MODE=http                       # mock | http
VITE_API_BASE_URL=/api                   # or an absolute URL
VITE_PROXY_TARGET=http://localhost:8000  # dev-server proxy target for /api
```

Both modes implement the same [`Api`](src/lib/apiTypes.ts) interface:

- [`src/lib/mock/handlers.ts`](src/lib/mock/handlers.ts) — localStorage implementation
- [`src/lib/httpApi.ts`](src/lib/httpApi.ts) — the FastAPI routes from §9 of the spec

`src/lib/api.ts` picks one at build time. Field names are deliberately `snake_case` end to end so
backend responses need no translation layer.

Two things genuinely cannot work in the browser and are honest about it in the UI:

- **JD fetch by URL** — blocked by CORS, and scraping authenticated job boards is out of scope by
  design. Paste the text, or run `http` mode.
- **PDF/DOCX text extraction** — the client does a best-effort pass and flags its own accuracy; the
  server pipeline (pdfplumber/docx2txt + an LLM pass) is the real one.

## What is where

```
src/
  types/index.ts            Domain model — mirrors the §8 tables
  lib/
    api.ts                  The single import every page uses
    apiTypes.ts             The Api contract, implemented twice
    httpApi.ts / http.ts    FastAPI client, JWT + one silent refresh
    mock/                   localStorage db, seed data, full API implementation
    ai/
      vocab.ts              Skill synonyms, action verbs, weak-opener list
      text.ts               Tokenising, skill detection, resume flattening w/ provenance
      jd.ts                 JD parsing → atomic requirements (§3)
      match.ts              Explainable match/gap scoring (§3)
      tailor.ts             Tailoring engine + cover letters + bullet rewriter (§3)
      truth.ts              The truthfulness validator (§3.1)
      score.ts              Resume rubric + ATS compatibility checker (§2)
      interview.ts          Question generation, STAR drafting, answer scoring (§7)
      resumeParse.ts        Resume import heuristics (§2.1)
    export/                 Template CSS, HTML/PDF/DOCX/text renderers, CSV
    viz.ts                  Validated chart tokens
    pipeline.ts             Statuses, sources, discovery channels
  components/
    ui/                     Buttons, inputs, overlays, tables, feedback states
    layout/AppShell.tsx     Sidebar, topbar, toasts
    resume/                 Section editors, constrained rich-text bullet, preview, versions
    jd/                     Match/gap and requirement views
    tailor/                 Change list, truth-guard panel, density panel
    tracker/KanbanBoard.tsx Drag-and-drop pipeline
    charts/dashboard.tsx    Funnel, volume, sources, skill gaps, time-in-stage
  pages/                    One file per route
```

## Feature coverage

**Module 1 — Resume builder** · structured model (contact, summary, experience, education, skills,
projects, certifications, languages) with `order_index` reordering and per-section visibility ·
multiple resumes with a master · version history with per-version line diffs and restore (restore
creates a new version rather than rewriting history) · constrained rich text (bold/italic only,
paste sanitised) · 4 ATS-safe + 2 designed templates, with the trade-off stated in the picker ·
import from PDF/DOCX/text with a confidence score, warnings and an unparsed-lines list · export to
PDF, DOCX, plain text, clipboard and JSON · ATS checker · rubric score as an actionable checklist ·
per-bullet AI rewrite shown as an accept/reject diff.

**Module 2 — JD tailoring** · paste-or-URL ingestion with boilerplate stripping · parsing into
atomic must-have / nice-to-have / responsibility requirements plus seniority, years, location and
comp · explainable match score with visible subscores, matched keywords **with evidence**, and gaps
framed as "add only if true" · tailoring that reorders and rephrases, never invents · a reviewable
change list with rationale and provenance, accept/reject per item, live rescoring · side-by-side
preview · cover letters in three tones with a "why this company" field that goes in verbatim ·
keyword-density guardrail · save as a variant linked to the posting.

**Module 3 — Tracker** · kanban with drag-and-drop and a filterable/sortable table · timestamped
stage transitions (which is what makes time-in-stage analysable) · JD snapshot stored per
application, because job URLs die · contacts, notes, follow-up due dates · frozen submission
snapshots · duplicate detection on company + role · CSV import with a template and a skip report,
and CSV export.

**Module 4 — Analytics** · funnel counting the *furthest* stage reached, so a later rejection does
not erase an interview · conversion **by resume sent**, with lift vs the master and a small-sample
warning · volume vs a weekly goal with streaks · response time and average time in stage · source
performance · skill-gap trends aggregated from the tailoring engine's missing-keyword output ·
CSV export.

**Module 5 — Discovery** · saved searches (keywords, seniority, locations, salary floor,
industries, company size, channels, fit threshold, digest) · scan producing ranked matches with
reasons · optional auto-draft above the threshold, queued for review · one-click "prepare
application" that tailors, drafts a letter and creates a tracker entry in `Saved` — and stops
there. Channels are restricted to sources with official APIs or public feeds; LinkedIn and Indeed
are absent as scrape targets by design.

**Module 6 — Interview prep** · questions derived from the specific posting's requirements, each
labelled with the requirement that produced it · STAR drafts assembled from the user's own bullets,
with sources listed · company brief built from the posting, with an explicit disclaimer about what
it cannot know · chat-based mock round scoring structure / specificity / length · reusable question
bank · markdown export.

## Design decisions worth knowing

- **The profile is the source of truth.** Every document — preview, PDF, DOCX, plain text — is a
  render of the same structured content through the same CSS, so the preview cannot drift from the
  export.
- **The truthfulness contract is enforced twice.** Generation is constrained, and then
  [`validateAgainstSource`](src/lib/ai/truth.ts) re-checks the output for any tool, employer,
  certification, title or metric that is not already in the source resume. Flags surface in the UI
  next to the change that produced them. The smoke test asserts both directions: fabrications are
  caught, and honest text passes clean.
- **Scores are never black boxes.** Match and resume scores expose their subscores, and matched
  keywords carry the resume line they were found in.
- **Charts are validated, not eyeballed.** The categorical trio and the ordinal funnel ramp in
  [`viz.ts`](src/lib/viz.ts) were run through a palette validator against this app's white chart
  surface (CVD separation, normal-vision floor, lightness band, contrast, ordinal step gaps). Every
  chart also ships a table view, and no chart uses two y-scales.
- **Loading states are real.** The mock API adds latency and records queue rows, mirroring the
  Celery-backed generation endpoints, so the UI is built against how it will actually behave.
- **Deleting is non-destructive to history.** Deleting a resume clears the live link but leaves the
  version an application was sent with, or the analytics would quietly lie.

## Known limits of this build

- Charts and drag-and-drop are the two heavy dependencies; everything else is hand-rolled to keep
  the bundle honest (app chunk ~94 kB gzipped).
- The in-browser "AI" is deterministic heuristics, not a model. It is good enough to exercise every
  screen and to encode the product rules (guardrails, provenance, explainability); in `http` mode
  the same endpoints are served by the real Claude-backed pipeline.
- No unit-test runner is wired up; `npm run smoke` covers the logic that matters and runs in about a
  second. Add Vitest when component-level tests start earning their keep.
- Light theme only, by decision — the resume templates are print-first, and a dark chart palette
  would need its own validation pass.
