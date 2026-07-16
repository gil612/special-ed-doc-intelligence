# special-ed-doc-intelligence

**Live:** https://special-ed-doc-intelligence.gil612.workers.dev

AI-powered document intelligence service that extracts structured data from
Israeli special-education documents (IEPs / inclusion-committee decisions —
תח"י / ועדת שילוב) using the Gemini API's Structured Output, with a
built-in PII redaction layer and schema validation.

Built as the final capstone project for the TovTech AI Engineer course.

## What it does

Upload a PDF of an inclusion-committee decision → the service extracts
structured fields (disability category, placement type, weekly support
hours, goals, accommodations, review date) as validated JSON, ready to feed
a dashboard or downstream system — without ever sending a real student name
to the external AI provider.

```
PDF upload
  → Cloudflare R2 (file storage, native Worker binding)
  → text extraction (unpdf)
  → PII redaction (names / national ID / phone / email stripped)
  → Gemini API (gemini-flash-latest, Structured Output)
  → Zod validation
  → Supabase (structured result)
  → outgoing webhook (HMAC-signed, on completion)
```

Processing runs inside the same Next.js API route (Cloudflare Workers
runtime, via `context.waitUntil`) — there is no separate backend service.
Workers can't run Python, so this is a TypeScript port of the logic
originally prototyped in `iep_schema.py`/`redaction.py`; those two files
stay in the repo as the local reference implementation (schema/prompt
design, quick iteration without deploying), not as what runs in production.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend / Dashboard | Next.js + Tailwind |
| API | Next.js API Routes, API-Key auth |
| Deploy | Cloudflare Workers (`@opennextjs/cloudflare`) |
| File storage | Cloudflare R2 (native binding) |
| Database | Supabase (Postgres) |
| AI extraction | Google Gemini API — gemini-flash-latest, Structured Output (Developer API key, not Vertex AI — see note below) |
| Validation | Zod (production) / Pydantic (local reference scripts) |
| Processing | TypeScript, inside Next.js API routes (Cloudflare Workers runtime) |

**Why Gemini Developer API and not Vertex AI:** Vertex AI's auth is
service-account OAuth, which doesn't run natively on the Workers edge
runtime. The Gemini Developer API (an API key in a header) gives the same
model and Structured Output support and is trivially edge-compatible, at
the cost of a different billing/product line than the course brief's
Vertex AI example.

**Why `@opennextjs/cloudflare` and not `@cloudflare/next-on-pages`:** the
project initially used `@cloudflare/next-on-pages` (a Cloudflare Pages
adapter), but hit a real bug in its Request-wrapping layer — calling
`request.formData()` threw `TypeError: Illegal invocation` in production,
reproducible only under the actual Workers runtime, not in local
tests. `@cloudflare/next-on-pages` is itself deprecated by Cloudflare in
favor of `@opennextjs/cloudflare`, which deploys as a plain Cloudflare
Worker (not Pages) and doesn't have this issue. `gemini-2.5-flash` was also
found to be rejected by the live API (listed but not servable) during this
same debugging pass and was swapped for `gemini-flash-latest`, Google's
stable alias for the current recommended flash-tier model.

## Project structure

```
/app                      → Next.js app (Dashboard + API Routes)
  /api/upload/route.ts    → upload endpoint (R2 + Supabase + triggers processing)
/lib
  redact.ts               → PII redaction layer (TS port of redaction.py)
  extraction.ts           → Zod schema (IEPExtraction) + Gemini call + validation
  webhook.ts              → HMAC-signed outgoing webhook
/supabase
  schema.sql              → documents / extractions / student_identity_map tables + RLS
iep_schema.py              → local reference implementation (schema/prompt prototyping only)
redaction.py               → local reference implementation (schema/prompt prototyping only)
SPEC.md                   → full data model, domain-field mapping, security requirements
CLAUDE.md                 → tech stack + coding conventions for Claude Code
README.md                 → this file
```

## Setup

### Prerequisites
- Node.js 18+ (Python 3.11+ only if running the local reference scripts)
- A Cloudflare account (Pages + R2 bucket)
- A Gemini API key ([AI Studio](https://aistudio.google.com/apikey))
- A Supabase project

### Environment variables (`.env.local` — never commit this file)

```
# Gemini API
GEMINI_API_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# REST API auth
DOCUMENTS_API_KEY=

# Outgoing webhook (WEBHOOK_URL optional — skipped if unset)
WEBHOOK_URL=
WEBHOOK_SECRET=
```

R2 is accessed via a native Wrangler binding, not access keys — configure
the bucket name in `wrangler.toml`, not `.env.local`.

### Install

```bash
npm install

# optional, only for running the local reference scripts (iep_schema.py, redaction.py)
pip install -r requirements.txt
```

### Database setup

Run `supabase/schema.sql` in the Supabase SQL editor (or `supabase db push`).

### Deploy

```bash
npm run preview   # local Workers runtime preview (opennextjs-cloudflare build + preview)
npm run deploy    # build + wrangler deploy to production
```

Runtime secrets (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DOCUMENTS_API_KEY`) are
set via `wrangler secret put <NAME>`, not `.env.local` — that file is for local dev only.
`SUPABASE_URL` is a plain (non-sensitive) var declared directly in `wrangler.toml`.

### Run the local reference pipeline directly (no web server needed)

```bash
python iep_schema.py path/to/document.pdf
```

## Privacy & security notes

- Full names and national ID numbers are stripped from document text
  **before** it is sent to the Gemini API (an external provider) — see
  `lib/redact.ts` (production) / `redaction.py` (local reference).
- `student_id` is the only identifier stored in `extractions`; any mapping
  back to a real identity lives in a separate, access-restricted
  `student_identity_map` table with no open Row Level Security policy.
- The `IEPExtraction` schema rejects any `student_id` value that looks like
  a real name, as a second line of defense.
- REST API access requires an `X-API-Key` header; outgoing webhooks are
  HMAC-signed.

See `SPEC.md` for the full data model and the mapping from the course's
"legal/contract document" domain template to this project's actual fields.

## Status

- [x] Schema + validation (`iep_schema.py`)
- [x] PII redaction layer (`redaction.py`)
- [x] End-to-end extraction tested against a real sample document
- [x] Supabase schema
- [x] Upload endpoint (`app/api/upload/route.ts`)
- [x] Outgoing webhook (HMAC-signed completion notification)
- [x] Dashboard UI
- [x] REST API read endpoints (`GET /api/documents`, `GET /api/documents/{id}`)
- [x] Deploy to production (Cloudflare Workers)

## License

Course capstone project — TovTech AI Engineer program, 2026.
