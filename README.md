# JobPilot

**An end-to-end job search operating system.** Build a resume once, tailor it automatically to every
job description, track every application, and see what is actually working — with an AI layer doing
the heavy lifting at each step.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Sign in with **Open the demo account** (or `demo@jobpilot.app` / `demo1234`). That seeds ten weeks of
applications, a master resume, two tailored variants, six parsed job descriptions, two saved searches
and a discovery feed — enough history for the analytics to say something real.

No backend required. In the default `mock` mode the entire product — parsing, matching, tailoring,
scoring, question generation — runs in the browser against a localStorage database.

---

## The one-paragraph version

A user imports or writes their **master profile** once — every job, bullet, skill, project and number
they have, stored as structured data rather than a document. A **resume** is a *view* over that
profile. When a job description arrives (pasted, or found by the **discovery agent**), the
**tailoring engine** parses it into atomic requirements, matches each requirement against the profile
using hybrid retrieval, produces an explainable **match score** with a gap analysis, and generates a
tailored resume + cover letter + screening answers where **every claim is traceable to something the
user actually wrote**. The user reviews a diff, accepts or rejects each change, and exports. The
**tracker** records the application with an immutable snapshot of exactly what was sent. The
**analytics** layer then answers the question no job seeker can currently answer: *which of my
applications are working, and why*. **Interview prep** closes the loop with question banks and mock
interviews grounded in the specific JD and the specific resume that was sent.

## Modules

| Module | What it does |
|---|---|
| **Resume builder** | Structured profile model, multiple resumes with a master, version history with line diffs and restore, 4 ATS-safe + 2 designed templates, import from PDF/DOCX/text, export to PDF/DOCX/text/JSON, ATS checker, per-bullet AI rewrite as an accept/reject diff |
| **JD tailoring** | Paste-or-URL ingestion, parsing into atomic must-have / nice-to-have requirements, explainable match score with matched keywords *and evidence*, a reviewable change list with rationale and provenance, live rescoring, cover letters in three tones, keyword-density guardrail |
| **Tracker** | Kanban with drag-and-drop plus a filterable table, timestamped stage transitions, JD snapshot per application, contacts, notes, follow-ups, frozen submission snapshots, duplicate detection, CSV import/export |
| **Analytics** | Funnel counting the *furthest* stage reached, conversion by resume sent with lift vs the master, volume vs a weekly goal, response time, time in stage, source performance, skill-gap trends |
| **Discovery** | Saved searches, scans producing ranked matches with reasons, optional auto-draft above a fit threshold, one-click "prepare application" that stops short of submitting |
| **Interview prep** | Questions derived from the specific posting, STAR drafts assembled from the user's own bullets with sources listed, company brief, chat-based mock round with scoring, reusable question bank |

## Design principles

1. **Structured data, not documents.** The profile is the source of truth; documents are renders.
2. **Never fabricate.** Every generated claim must trace to a user-authored source — enforced by a
   validator pass, not by prompt politeness.
3. **Explainable, not magic.** Every score has visible subscores; every rewrite shows its provenance.
4. **Human owns the submit.** The app prepares everything and stops before submission.
5. **Immutable application snapshots.** What was sent is frozen forever, or analytics are worthless.
6. **AI cost is a first-class engineering concern.** Caching, effort tiers and batching are designed
   in from day one.

## Repository layout

```
frontend/        React 18 + TypeScript + Vite + Tailwind app  (see frontend/README.md)
docs/            Product & technical documentation
```

## Stack

React 18 · TypeScript · Vite · Tailwind · Recharts · dnd-kit · zustand

The planned backend is FastAPI (Python 3.12) · PostgreSQL 16 (+ pgvector) · Redis + Celery · Claude
API. The frontend already implements that contract: `src/lib/httpApi.ts` speaks the real routes, and
flipping `VITE_API_MODE=http` points the same components at a live server without touching one of
them.

## Status

The frontend is complete and runs end to end in `mock` mode. The backend is specified but not yet
implemented. `npm run smoke` in `frontend/` runs 82 assertions over the whole pipeline in about a
second, no browser needed.

## License

[MIT](LICENSE)
