# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AI document-intelligence service that extracts structured data from Israeli
special-education documents (IEP / ועדת שילוב decisions) using Vertex AI
(Gemini) Structured Output. Capstone project for the TovTech AI Engineer
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

Nothing is implemented yet (see the `## Status` checklist in `README.md`
and the `## Checklist` in `SPEC.md`). Both checklists describe the same
build; keep them in sync rather than tracking progress in only one.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend / Dashboard | Next.js + Tailwind |
| API | Next.js API Routes, API-Key auth |
| File storage | Cloudflare R2 |
| Database | Supabase (Postgres) |
| AI extraction | Google Vertex AI — Gemini 2.5 Flash, Structured Output |
| Validation | Pydantic |
| Processing worker | Python |
| Deploy target | Cloudflare Pages |

## Architecture

```
POST /api/upload (PDF)
  → Cloudflare R2 (file storage), create document row (status=processing), return immediately
  → background worker:
      1. text extraction (pypdf)
      2. PII redaction (regex/NER: names, national ID, phone, email) — BEFORE any Vertex AI call
      3. Vertex AI (gemini-2.5-flash), Structured Output → IEPExtraction (Pydantic)
      4. persist to Supabase `extractions`, set status=done
  → outgoing webhook (HMAC-signed): notifies dashboard/Telegram with confidence score
```

Planned layout (per `README.md`):

```
/app/api/upload/route.ts   upload endpoint (R2 + Supabase + triggers worker)
/processing/process_document.py   background worker: download, extract, validate, persist
/processing/iep_schema.py         Pydantic schema (IEPExtraction) + extraction pipeline
/processing/redaction.py          PII redaction layer
/supabase/schema.sql              documents / extractions / student_identity_map + RLS
```

## Security & privacy conventions

These are hard requirements from `SPEC.md`, not stylistic preferences:

- Redaction (`processing/redaction.py`) must run on extracted text **before**
  it is sent to Vertex AI — Vertex AI is an external provider and must never
  see a real name or national ID.
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
GCP_PROJECT_ID=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DOCUMENTS_API_KEY=
WEBHOOK_SECRET=
```

## Commands

```bash
# install
npm install
pip install -r requirements.txt   # pydantic, pypdf, google-genai, boto3, supabase

# Google Cloud auth (local dev)
gcloud auth application-default login
gcloud services enable aiplatform.googleapis.com

# database
# run supabase/schema.sql in the Supabase SQL editor, or: supabase db push

# run the extraction pipeline directly (no web server needed)
python processing/iep_schema.py path/to/document.pdf
```

No test suite, lint config, or CI build step exists yet beyond the Claude
Code GitHub Action in `.github/workflows/claude.yml`. Add the actual
commands here once a test/lint setup exists — don't invent them.
