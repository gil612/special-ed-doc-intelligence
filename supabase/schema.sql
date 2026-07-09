-- Document Intelligence Service — Supabase schema
-- See SPEC.md "מודל נתונים (Supabase)" for the access-model rationale:
-- all access goes through the Next.js server using SUPABASE_SERVICE_ROLE_KEY
-- (which bypasses RLS). RLS is enabled on every table with NO policies, so
-- anon/authenticated roles are default-denied — a defense-in-depth backstop,
-- not the primary access control.

create extension if not exists pgcrypto;

-- One row per uploaded document.
create table documents (
    id uuid primary key default gen_random_uuid(),
    storage_path text not null,
    original_filename text not null,
    status text not null default 'processing'
        check (status in ('processing', 'done', 'failed')),
    error_message text,
    uploaded_at timestamptz not null default now()
);

create index documents_status_idx on documents (status);
create index documents_uploaded_at_idx on documents (uploaded_at);

alter table documents enable row level security;

-- One row per completed extraction. Mirrors IEPExtraction (iep_schema.py) field-for-field.
create table extractions (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references documents (id) on delete cascade,
    student_id text,
    school_year text not null,
    disability_category text,
    placement_type text not null
        check (placement_type in (
            'הכלה מלאה',
            'הכלה חלקית',
            'כיתה מיוחדת בבי"ס רגיל',
            'חינוך מיוחד נפרד'
        )),
    weekly_support_hours numeric check (weekly_support_hours >= 0 and weekly_support_hours <= 40),
    goals jsonb not null default '[]'::jsonb,
    review_date date,
    accommodations jsonb not null default '[]'::jsonb,
    confidence numeric not null check (confidence >= 0 and confidence <= 1),
    created_at timestamptz not null default now()
);

create index extractions_document_id_idx on extractions (document_id);

alter table extractions enable row level security;

-- Placeholder only, per SPEC.md: nothing in this project writes to this table.
-- Documents the separation-of-identity requirement without implementing
-- real-name lookup, which is out of scope for this course project.
create table student_identity_map (
    student_id text primary key,
    real_name_encrypted bytea,
    created_at timestamptz not null default now()
);

alter table student_identity_map enable row level security;
