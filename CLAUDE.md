# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AI document-intelligence service that extracts structured data from Israeli
special-education documents (IEP / ועדת שילוב decisions) using the Gemini
API's Structured Output. Capstone project for the TovTech AI Engineer
course.

The course template is "Domain 1: legal/contract documents." This project
adapts that template to IEP decisions rather than using the generic
contract fields — see the field-mapping table in `SPEC.md` before adding or
renaming schema fields, so the domain adaptation stays intentional and
documented rather than drifting back toward generic contract terms.

`SPEC.md` is the source of truth for the data model, field list, and
security requirements. `README.md` covers stack/setup. This file is
conventions only — don't duplicate the schema or checklist here; point to
`SPEC.md` instead and keep it updated as the single place field definitions
live.

## Status

Done: `IEPExtraction` schema + validation, PII redaction layer, and
end-to-end extraction tested against a sample document — all in the
Python reference scripts (`iep_schema.py`, `redaction.py`), plus the
Supabase schema (`supabase/schema.sql`). Not yet built: the Next.js app
itself (no `package.json` exists yet), upload endpoint, webhook, dashboard,
REST API, deploy. See the `## Status` checklist in `README.md` and the
`## Checklist` in `SPEC.md` — keep both in sync rather than tracking
progress in only one.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend / Dashboard | Next.js + Tailwind |
| API | Next.js API Routes, API-Key auth |
| Deploy | Cloudflare Pages (`@cloudflare/next-on-pages`) |
| File storage | Cloudflare R2 (native binding, not access keys) |
| Database | Supabase (Postgres) |
| AI extraction | Google Gemini API — gemini-2.5-flash, Structured Output (Developer API key; see note below) |
| Validation | Zod (production) / Pydantic (local reference scripts) |
| Processing | TypeScript, inside Next.js API routes (Cloudflare Workers runtime) |

**Gemini Developer API, not Vertex AI:** Vertex AI's service-account OAuth
doesn't run natively on the Workers edge runtime, so production auth is a
Gemini API key instead. Same model, same Structured Output support,
different product/billing line than the course brief's Vertex AI example —
intentional, documented trade-off, not an oversight.

## Architecture

```
POST /api/upload (PDF)
  → Cloudflare R2 (file storage), create document row (status=processing), return immediately
  → context.waitUntil(...) continues processing in the same Worker invocation:
      1. text extraction (unpdf)
      2. PII redaction (regex: names, national ID, phone, email) — BEFORE any Gemini call
      3. Gemini API (gemini-2.5-flash), Structured Output → IEPExtraction (Zod)
      4. persist to Supabase `extractions`, set status=done (or failed + error_message)
  → outgoing webhook (HMAC-signed) to WEBHOOK_URL if configured, with confidence score
```

There is no separate backend service — everything above runs inside the
Cloudflare Worker behind the Next.js API route. `iep_schema.py` and
`redaction.py` at the repo root are the local reference implementation
(used to prototype the schema/prompt without deploying); the production
path is a TypeScript port of that same logic, not a call into Python.

Planned layout (per `README.md`):

```
/app/api/upload/route.ts   upload endpoint (R2 + Supabase + triggers processing)
/lib/redact.ts             PII redaction layer (TS port of redaction.py)
/lib/extraction.ts         Zod schema (IEPExtraction) + Gemini call + validation
/lib/webhook.ts            HMAC-signed outgoing webhook
/supabase/schema.sql       documents / extractions / student_identity_map + RLS
```

## Security & privacy conventions

These are hard requirements from `SPEC.md`, not stylistic preferences:

- Redaction (`lib/redact.ts` in production, `redaction.py` for local
  reference) must run on extracted text **before** it is sent to the
  Gemini API — an external provider that must never see a real name or
  national ID.
- `student_id` is the only identifier written to `extractions`. Real-identity
  mapping lives only in `student_identity_map`, a separate table with
  restricted access (no open RLS policy). Never join or denormalize real
  names into `extractions`.
- The `IEPExtraction` schema should reject a `student_id` that looks like a
  real name (second line of defense beyond redaction).
- REST API requires an `X-API-Key` header; outgoing webhooks are HMAC-signed.
  Any new endpoint or outgoing call follows the same pattern.

## Environment variables (`.env.local`, never committed)

```
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DOCUMENTS_API_KEY=
WEBHOOK_URL=
WEBHOOK_SECRET=
```

R2 is configured as a binding in `wrangler.toml`, not via env vars.

## Commands

```bash
# install
npm install

# optional, only for the local reference scripts (iep_schema.py, redaction.py)
pip install -r requirements.txt

# database
# run supabase/schema.sql in the Supabase SQL editor, or: supabase db push

# run the local reference pipeline directly (no web server needed)
python iep_schema.py path/to/document.pdf
```

No test suite, lint config, or CI build step exists yet beyond the Claude
Code GitHub Action in `.github/workflows/claude.yml`. Add the actual
commands here once a test/lint setup exists — don't invent them.
