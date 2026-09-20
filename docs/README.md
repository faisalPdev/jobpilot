# JobPilot — Phase 1 Technical & Product Documentation

> An end‑to‑end job search operating system: build a resume once, tailor it
> automatically to every job description, track every application, and see what is actually
> working — with an AI layer doing the heavy lifting at each step.

**Stack:** FastAPI (Python 3.12) · PostgreSQL 16 (+ pgvector) · React 18 (TypeScript, Vite) · Redis + Celery · Claude API

---

## How to read this documentation

> **Status:** this index is the documentation plan. The individual documents below are
> not in the repository yet — the frontend was built directly against this spec. The
> sections further down (the one-paragraph version, the design principles) are the
> authoritative summary in the meantime.

| # | Document | Read it when |
|---|---|---|
| 00 | Product Overview | You want the *why*, personas, scope boundary, and the Phase 1 / Phase 2 line |
| 01 | System Architecture | You are setting up the repo, services, or request/job flows |
| 02 | Data Model | You are writing migrations or queries — full DDL lives here |
| 03 | Resume Builder & Editor | Building the profile → resume → render pipeline |
| 04 | JD Tailoring Engine | Building the core differentiator — read this twice |
| 05 | Application Tracker | Building pipeline, contacts, follow-ups, interviews, offers |
| 06 | Dashboard & Analytics | Building metrics, funnels, insights |
| 07 | Discovery Agent | Building job sourcing, ranking, scheduled scans |
| 08 | Interview Preparation | Building question banks, mock interviews, feedback |
| 09 | AI Layer | Any call to Claude — models, prompts, caching, cost, evals |
| 10 | API Reference | Implementing or consuming endpoints |
| 11 | Frontend Specification | Building the React app |
| 12 | Infrastructure & DevOps | Local setup, deploy, background jobs, observability |
| 13 | Security, Privacy & Compliance | Handling PII, ToS boundaries, the truthfulness contract |
| 14 | Roadmap & Build Order | Deciding what to build this week |

## The one-paragraph version

A user imports or writes their **master profile** once — every job, bullet, skill, project and
number they have, stored as structured data rather than a document. A **resume** is a *view* over
that profile. When a job description arrives (pasted, or found by the **discovery agent**), the
**tailoring engine** parses it into atomic requirements, matches each requirement against the
profile using hybrid retrieval, produces an explainable **match score** with a gap analysis, and
generates a tailored resume + cover letter + screening answers where **every claim is traceable to
something the user actually wrote**. The user reviews a diff, accepts or rejects each change, and
exports. The **tracker** records the application with an immutable snapshot of exactly what was
sent. The **analytics** layer then answers the question no job seeker can currently answer: *which
of my applications are working, and why*. **Interview prep** closes the loop with question banks
and mock interviews grounded in the specific JD and the specific resume that was sent.

## Non-negotiable design principles

1. **Structured data, not documents.** The profile is the source of truth; documents are renders.
2. **Never fabricate.** Every generated claim must trace to a user-authored source. Enforced by a
   validator pass, not by prompt politeness. See the truthfulness contract.
3. **Explainable, not magic.** Every score has visible subscores; every rewrite shows its provenance.
4. **Human owns the submit.** Phase 1 prepares everything and stops before submission. See
   platform boundaries.
5. **Immutable application snapshots.** What was sent is frozen forever, or analytics are worthless.
6. **AI cost is a first-class engineering concern.** Caching, effort tiers, and batch are designed
   in from day one, not bolted on. See AI layer.
