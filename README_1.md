# special-ed-doc-intelligence

AI-powered document intelligence service that extracts structured data from
Israeli special-education documents (IEPs / inclusion-committee decisions —
תח"י / ועדת שילוב) using Google Vertex AI (Gemini) Structured Output, with a
built-in PII redaction layer and Pydantic schema validation.

Built as the final capstone project for the TovTech AI Engineer course.

## What it does

Upload a PDF of an inclusion-committee decision → the service extracts
structured fields (disability category, placement type, weekly support
hours, goals, accommodations, review date) as validated JSON, ready to feed
a dashboard or downstream system — without ever sending a real student name
to the external AI provider.

```
PDF upload
  → Cloudflare R2 (file storage)
  → text extraction (pypdf)
  → PII redaction (names / national ID / phone / email stripped)
  → Vertex AI / Gemini (Structured Output)
  → Pydantic validation
  → Supabase (structured result)
  → outgoing webhook (HMAC-signed, on completion)
```

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

## Project structure

```
/app                      → Next.js app (Dashboard + API Routes)
  /api/upload/route.ts    → upload endpoint (R2 + Supabase + triggers worker)
/processing
  process_document.py     → background worker: download, extract, validate, persist
  iep_schema.py           → Pydantic schema (IEPExtraction) + extraction pipeline
  redaction.py            → PII redaction layer (names, national ID, phone, email)
/supabase
  schema.sql              → documents / extractions / student_identity_map tables + RLS
SPEC.md                   → full data model, domain-field mapping, security requirements
CLAUDE.md                 → tech stack + coding conventions for Claude Code
README.md                 → this file
```

## Setup

### Prerequisites
- Node.js 18+, Python 3.11+
- A Google Cloud project with the Vertex AI API enabled and billing active
- A Supabase project
- A Cloudflare R2 bucket

### Environment variables (`.env.local` — never commit this file)

```
# Google Cloud / Vertex AI
GCP_PROJECT_ID=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# REST API auth
DOCUMENTS_API_KEY=

# Outgoing webhook
WEBHOOK_SECRET=
```

### Install

```bash
# Node side
npm install

# Python side
pip install -r requirements.txt   # pydantic, pypdf, google-genai, boto3, supabase
```

### Google Cloud auth (local development)

```bash
gcloud auth application-default login
gcloud services enable aiplatform.googleapis.com
```

### Database setup

Run `supabase/schema.sql` in the Supabase SQL editor (or `supabase db push`).

### Run the extraction pipeline directly (no web server needed)

```bash
python processing/iep_schema.py path/to/document.pdf
```

## Privacy & security notes

- Full names and national ID numbers are stripped from document text
  **before** it is sent to Vertex AI (an external provider) — see
  `processing/redaction.py`.
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
- [ ] Outgoing webhook (HMAC-signed completion notification)
- [ ] Dashboard UI
- [ ] REST API read endpoints (`GET /api/documents`, `GET /api/documents/{id}`)
- [ ] Deploy to Cloudflare Pages

## License

Course capstone project — TovTech AI Engineer program, 2026.
