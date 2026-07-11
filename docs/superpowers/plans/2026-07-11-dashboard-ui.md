# Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder homepage with a working dashboard — a document list (with status), a click-through detail panel showing extracted fields, client-side filters (date range, min confidence), auto-refresh while any document is still processing, and an upload form — closing out the "Dashboard UI" checklist item.

**Architecture:** `app/page.tsx` is a Server Component that queries Supabase directly (no separate REST API dependency) and renders a client-side `<DocumentTable>` that owns selection/filter/polling state and an inline `<DocumentDetailPanel>`. Uploads go through a Server Action (`app/actions.ts`), which — like the existing `/api/upload` route — calls a new shared helper (`lib/upload-document.ts`) so the R2-put → insert-document → kick-off-processing logic isn't duplicated between the two entry points.

**Tech Stack:** Next.js 15 (App Router, Server Components, Server Actions), React 18.3, Tailwind, `@opennextjs/cloudflare` (`getCloudflareContext`), Supabase, Vitest.

## Global Constraints

- Dashboard has no login/auth — consistent with the rest of this project, which has no user-auth system anywhere.
- The `X-API-Key` check stays **only** inside `app/api/upload/route.ts`, before it calls the shared upload helper. The helper itself never checks a key, and the Server Action doesn't check one either (trusted server-side call, not a network request).
- All Supabase access (list queries and writes) goes through the server (Server Components / Server Actions), using `SUPABASE_SERVICE_ROLE_KEY` — the browser never talks to Supabase directly. This matches the existing RLS-default-deny model (`SPEC.md`).
- The detail panel renders labeled Hebrew fields, not raw JSON.
- Filtering (date range, min confidence) is applied client-side over the already-fetched list — no server-side query params or pagination for this course-project scale.
- Auto-refresh: while any document has `status === "processing"`, poll every ~3 seconds via `router.refresh()`; stop automatically once nothing is processing.
- No automated tests for React components (no React-testing infra in this project, matching the established pattern from the upload-endpoint plan) — verified manually via `npm run dev`. Pure logic extracted into `lib/*.ts` (the upload helper, the filter function) **does** get Vitest tests, same as the rest of this codebase.
- `lib/supabase.ts` additions follow the existing convention there: no dedicated test (thin Supabase query wrapper, no live project in this sandbox) — this is a settled decision from the upload-endpoint plan, not a new gap.
- RTL Hebrew UI throughout, consistent with the existing `dir="rtl"` root layout (`app/layout.tsx`).

---

### Task 1: Shared upload helper + local dev Cloudflare bindings

**Files:**
- Create: `lib/cloudflare-env.ts`
- Create: `lib/upload-document.ts`
- Test: `lib/upload-document.test.ts`
- Modify: `app/api/upload/route.ts`
- Modify: `next.config.mjs`
- Modify: `.gitignore` (add `.dev.vars`)

**Interfaces:**
- Produces: `export interface Env { DOCS_BUCKET: R2Bucket; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; GEMINI_API_KEY: string; DOCUMENTS_API_KEY: string; WEBHOOK_URL?: string; WEBHOOK_SECRET?: string; }` from `lib/cloudflare-env.ts`, plus the `declare global { interface CloudflareEnv extends Env {} }` augmentation (once, project-wide — no other file needs to redeclare this).
- Produces: `export interface UploadDocumentDeps { putObject: (storagePath: string, fileBuffer: ArrayBuffer) => Promise<void>; insertDocument: (storagePath: string, originalFilename: string) => Promise<string>; geminiApiKey: string; insertExtraction: (documentId: string, extraction: IEPExtraction) => Promise<void>; updateDocumentStatus: (documentId: string, status: "done" | "failed", errorMessage?: string | null) => Promise<void>; webhookUrl: string | undefined; webhookSecret: string | undefined; waitUntil: (promise: Promise<unknown>) => void; }` and `export async function handleUpload(fileBuffer: ArrayBuffer, originalFilename: string, deps: UploadDocumentDeps): Promise<{ documentId: string }>` from `lib/upload-document.ts`. Consumed by `app/api/upload/route.ts` (this task) and `app/actions.ts` (Task 6).

This task also fixes a real gap: `app/page.tsx` (Task 3 onward) will call `getCloudflareContext()` to reach Supabase — which doesn't work under plain `next dev` without `initOpenNextCloudflareForDev()` wired into `next.config.mjs`. Without this, every later task's manual verification would be blocked from running locally (deploy-only testing, which is slow). Fixing it here, first, unblocks local dev for the rest of this plan.

- [ ] **Step 1: Write `lib/cloudflare-env.ts`**

```ts
export interface Env {
  DOCS_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  DOCUMENTS_API_KEY: string;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
}

// `getCloudflareContext`'s `env` is typed via the ambient `CloudflareEnv`
// interface (declared by @opennextjs/cloudflare). Augment it here, once,
// so every caller of getCloudflareContext() across the app gets `env`
// typed as `Env` without redeclaring this interface in every file.
declare global {
  interface CloudflareEnv extends Env {}
}
```

- [ ] **Step 2: Write the failing test — `lib/upload-document.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { handleUpload, type UploadDocumentDeps } from "./upload-document";

function buildDeps(overrides: Partial<UploadDocumentDeps> = {}): UploadDocumentDeps {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    insertDocument: vi.fn().mockResolvedValue("doc-1"),
    geminiApiKey: "test-key",
    insertExtraction: vi.fn().mockResolvedValue(undefined),
    updateDocumentStatus: vi.fn().mockResolvedValue(undefined),
    webhookUrl: undefined,
    webhookSecret: undefined,
    waitUntil: vi.fn(),
    ...overrides,
  };
}

describe("handleUpload", () => {
  it("stores the file, inserts the document row, and kicks off background processing", async () => {
    const deps = buildDeps();
    const fileBuffer = new TextEncoder().encode("fake pdf bytes").buffer;

    const result = await handleUpload(fileBuffer, "sample.pdf", deps);

    expect(result).toEqual({ documentId: "doc-1" });
    expect(deps.putObject).toHaveBeenCalledTimes(1);
    const [storagePath, body] = (deps.putObject as any).mock.calls[0];
    expect(storagePath).toMatch(/^documents\/[0-9a-f-]+\.pdf$/);
    expect(body).toBe(fileBuffer);
    expect(deps.insertDocument).toHaveBeenCalledWith(storagePath, "sample.pdf");
    expect(deps.waitUntil).toHaveBeenCalledTimes(1);
  });

  it("propagates a storage failure without inserting a document row or starting processing", async () => {
    const deps = buildDeps({ putObject: vi.fn().mockRejectedValue(new Error("R2 unavailable")) });

    await expect(handleUpload(new ArrayBuffer(0), "sample.pdf", deps)).rejects.toThrow("R2 unavailable");
    expect(deps.insertDocument).not.toHaveBeenCalled();
    expect(deps.waitUntil).not.toHaveBeenCalled();
  });

  it("propagates a database failure without starting processing", async () => {
    const deps = buildDeps({ insertDocument: vi.fn().mockRejectedValue(new Error("DB unavailable")) });

    await expect(handleUpload(new ArrayBuffer(0), "sample.pdf", deps)).rejects.toThrow("DB unavailable");
    expect(deps.waitUntil).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- lib/upload-document.test.ts`
Expected: FAIL — `Cannot find module './upload-document'`.

- [ ] **Step 4: Write `lib/upload-document.ts`**

```ts
import { createGeminiClient } from "./gemini";
import { extractPdfText } from "./pdf";
import { processDocument } from "./process-document";
import { sendWebhook } from "./webhook";
import type { IEPExtraction } from "./extraction-schema";

export interface UploadDocumentDeps {
  putObject: (storagePath: string, fileBuffer: ArrayBuffer) => Promise<void>;
  insertDocument: (storagePath: string, originalFilename: string) => Promise<string>;
  geminiApiKey: string;
  insertExtraction: (documentId: string, extraction: IEPExtraction) => Promise<void>;
  updateDocumentStatus: (
    documentId: string,
    status: "done" | "failed",
    errorMessage?: string | null
  ) => Promise<void>;
  webhookUrl: string | undefined;
  webhookSecret: string | undefined;
  waitUntil: (promise: Promise<unknown>) => void;
}

// Shared by app/api/upload/route.ts (the public, API-key-checked endpoint)
// and app/actions.ts (the dashboard's own upload Server Action) so the
// store-then-kick-off-processing logic isn't duplicated between them.
// Auth (the X-API-Key check) is deliberately NOT here - it belongs to
// whichever entry point actually crosses the network (route.ts), not to
// this shared internal helper.
export async function handleUpload(
  fileBuffer: ArrayBuffer,
  originalFilename: string,
  deps: UploadDocumentDeps
): Promise<{ documentId: string }> {
  const storagePath = `documents/${crypto.randomUUID()}.pdf`;
  await deps.putObject(storagePath, fileBuffer);
  const documentId = await deps.insertDocument(storagePath, originalFilename);

  deps.waitUntil(
    processDocument(documentId, {
      fetchDocumentText: () => extractPdfText(fileBuffer),
      geminiClient: createGeminiClient(deps.geminiApiKey),
      supabase: {
        insertExtraction: (extraction) => deps.insertExtraction(documentId, extraction),
        updateDocumentStatus: (status, errorMessage) =>
          deps.updateDocumentStatus(documentId, status, errorMessage ?? null),
      },
      sendWebhook,
      webhookUrl: deps.webhookUrl,
      webhookSecret: deps.webhookSecret,
    })
  );

  return { documentId };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- lib/upload-document.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 6: Refactor `app/api/upload/route.ts` to use the shared helper**

Replace the full file with:

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/cloudflare-env";
import "@/lib/cloudflare-env";
import { handleUpload } from "@/lib/upload-document";
import {
  createSupabaseClient,
  insertDocument,
  insertExtraction,
  updateDocumentStatus,
} from "@/lib/supabase";

export async function POST(request: Request): Promise<Response> {
  const { env, ctx } = getCloudflareContext();

  // SPEC.md/CLAUDE.md: "REST API requires an X-API-Key header" is a stated
  // hard requirement covering every endpoint, not just the read endpoints —
  // upload triggers billable Gemini calls and storage writes, so it must
  // not be left open on a public deployment. The `!env.DOCUMENTS_API_KEY`
  // check matters on its own: without it, a misconfigured empty-string env
  // var would make an equally-empty `X-API-Key` header pass the `!==` check,
  // bypassing auth entirely rather than failing closed.
  if (!env.DOCUMENTS_API_KEY || request.headers.get("X-API-Key") !== env.DOCUMENTS_API_KEY) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.type !== "application/pdf") {
    return Response.json({ error: "multipart field 'file' (application/pdf) is required" }, { status: 400 });
  }

  const fileBuffer = await file.arrayBuffer();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  let documentId: string;
  try {
    ({ documentId } = await handleUpload(fileBuffer, file.name, {
      putObject: (key, body) => env.DOCS_BUCKET.put(key, body).then(() => undefined),
      insertDocument: (storagePath, originalFilename) =>
        insertDocument(supabase, storagePath, originalFilename),
      geminiApiKey: env.GEMINI_API_KEY,
      insertExtraction: (documentId, extraction) => insertExtraction(supabase, documentId, extraction),
      updateDocumentStatus: (documentId, status, errorMessage) =>
        updateDocumentStatus(supabase, documentId, status, errorMessage ?? null),
      webhookUrl: env.WEBHOOK_URL,
      webhookSecret: env.WEBHOOK_SECRET,
      waitUntil: ctx.waitUntil.bind(ctx),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `failed to store document: ${message}` }, { status: 503 });
  }

  return Response.json({ document_id: documentId, status: "processing" }, { status: 202 });
}
```

Note: the `Env` interface and the `declare global { interface CloudflareEnv extends Env {} }` augmentation that used to live directly in this file now live in `lib/cloudflare-env.ts` (Step 1) — this file only imports the type it names explicitly (`Env` isn't actually referenced by name here since `env`'s type comes through automatically once the global augmentation is in scope, but the plain `import "@/lib/cloudflare-env"` line ensures the file is part of the compiled program so the augmentation reliably applies).

- [ ] **Step 7: Verify the project still builds and all tests pass**

Run: `npm run build`
Expected: `Compiled successfully`, `/api/upload` still listed as a route, no type errors.

Run: `npm test`
Expected: all pre-existing tests plus the 3 new `upload-document.test.ts` tests pass.

- [ ] **Step 8: Wire up local dev Cloudflare bindings**

Write `next.config.mjs`:

```js
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

Add to `.gitignore` (alongside the existing `.env*.local` entry):

```
.dev.vars
```

Create `.dev.vars` (gitignored, never committed — this is Wrangler's local-secrets file, separate from `.env.local`, needed because `initOpenNextCloudflareForDev()`'s local binding proxy reads secrets from here, not from `.env.local`):

```
GEMINI_API_KEY=<same value as in .env.local>
SUPABASE_SERVICE_ROLE_KEY=<same value as in .env.local>
DOCUMENTS_API_KEY=<same value as in .env.local>
```

- [ ] **Step 9: Verify local dev works with real bindings**

Run: `npm run dev`

In another terminal:

```bash
curl -i -X POST http://localhost:3000/api/upload \
  -H "X-API-Key: <value from .dev.vars>" \
  -F "file=@sample_iep_decision.pdf;type=application/pdf"
```

Expected: HTTP `202` with `{"document_id":"...","status":"processing"}` — confirms `getCloudflareContext()` resolves real bindings under `next dev` now, not just under a full deploy. If this doesn't work (e.g. `getCloudflareContext()` throws or returns empty bindings), STOP and report BLOCKED with the exact error — don't guess at workarounds, this blocks manual verification for every later task in this plan.

- [ ] **Step 10: Commit**

```bash
git add lib/cloudflare-env.ts lib/upload-document.ts lib/upload-document.test.ts app/api/upload/route.ts next.config.mjs .gitignore
git commit -m "Extract shared upload helper (lib/upload-document.ts), wire up local dev Cloudflare bindings"
```

(`.dev.vars` is gitignored and must NOT be committed — verify with `git status` that it doesn't appear staged.)

---

### Task 2: Supabase list query for the dashboard

**Files:**
- Modify: `lib/supabase.ts`

**Interfaces:**
- Consumes: `type { IEPExtraction } from "./extraction-schema"` (already imported in this file).
- Produces: `export interface DocumentRow { id: string; storage_path: string; original_filename: string; status: "processing" | "done" | "failed"; error_message: string | null; uploaded_at: string; extraction: IEPExtraction | null; }` and `export async function listDocumentsWithExtractions(client: SupabaseClient): Promise<DocumentRow[]>`. Consumed by `app/page.tsx` (Task 3) and `lib/document-filters.ts`/`document-filters.test.ts` (Task 5).

No dedicated test for this function — consistent with this file's existing convention (see the plan for the upload endpoint: "`lib/supabase.ts` has no dedicated test... thin wrapper, no live Supabase project in this sandbox").

- [ ] **Step 1: Add `DocumentRow` and `listDocumentsWithExtractions` to `lib/supabase.ts`**

Append to the end of the file:

```ts
export interface DocumentRow {
  id: string;
  storage_path: string;
  original_filename: string;
  status: "processing" | "done" | "failed";
  error_message: string | null;
  uploaded_at: string;
  extraction: IEPExtraction | null;
}

// `extractions` is embedded via Supabase's relationship detection (the FK
// extractions.document_id -> documents.id in supabase/schema.sql). Since
// that FK isn't marked UNIQUE, PostgREST returns it as an array even
// though there's at most one extraction per document in practice - take
// the first element explicitly rather than relying on any single-object
// embedding syntax.
export async function listDocumentsWithExtractions(client: SupabaseClient): Promise<DocumentRow[]> {
  const { data, error } = await client
    .from("documents")
    .select("id, storage_path, original_filename, status, error_message, uploaded_at, extractions(*)")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const rawExtraction = Array.isArray(row.extractions) && row.extractions.length > 0 ? row.extractions[0] : null;
    const extraction: IEPExtraction | null = rawExtraction
      ? {
          student_id: rawExtraction.student_id,
          school_year: rawExtraction.school_year,
          disability_category: rawExtraction.disability_category,
          placement_type: rawExtraction.placement_type,
          weekly_support_hours: rawExtraction.weekly_support_hours,
          goals: rawExtraction.goals,
          review_date: rawExtraction.review_date,
          accommodations: rawExtraction.accommodations,
          confidence: rawExtraction.confidence,
        }
      : null;

    return {
      id: row.id,
      storage_path: row.storage_path,
      original_filename: row.original_filename,
      status: row.status,
      error_message: row.error_message,
      uploaded_at: row.uploaded_at,
      extraction,
    };
  });
}
```

- [ ] **Step 2: Verify the project still builds**

Run: `npm run build`
Expected: `Compiled successfully`, no type errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase.ts
git commit -m "Add listDocumentsWithExtractions query for the dashboard"
```

---

### Task 3: Dashboard page, document table, and detail panel

**Files:**
- Modify: `app/page.tsx`
- Create: `components/dashboard/document-table.tsx`
- Create: `components/dashboard/document-detail-panel.tsx`

**Interfaces:**
- Consumes: `type { DocumentRow } from "@/lib/supabase"`, `listDocumentsWithExtractions`, `createSupabaseClient` (Task 2), `getCloudflareContext` + `type { Env } from "@/lib/cloudflare-env"` (Task 1).
- Produces: `DocumentTable({ documents }: { documents: DocumentRow[] })` and `DocumentDetailPanel({ document }: { document: DocumentRow })`. `DocumentTable` is consumed by `app/page.tsx`; both are modified further in Tasks 4-5.

This task delivers a working master-detail view with real data — no polling or filtering yet (those are Tasks 4-5, kept separate so each can be independently verified: a reviewer can confirm the base view works before checking that polling/filtering behave correctly on top of it).

- [ ] **Step 1: Write `components/dashboard/document-detail-panel.tsx`**

```tsx
import type { DocumentRow } from "@/lib/supabase";

const FIELD_LABELS = {
  student_id: "מזהה תלמיד",
  school_year: "שנת לימודים",
  disability_category: "קטגוריית ליקוי",
  placement_type: "סוג שיבוץ",
  weekly_support_hours: "שעות תמיכה שבועיות",
  review_date: "תאריך עדכון הבא",
} as const;

export function DocumentDetailPanel({ document }: { document: DocumentRow }) {
  return (
    <aside className="w-96 shrink-0 rounded border bg-white p-4">
      <h2 className="mb-3 font-semibold">{document.original_filename}</h2>

      {document.status === "processing" && <p className="text-slate-500">המסמך בעיבוד…</p>}

      {document.status === "failed" && (
        <p className="text-red-600">כשל בעיבוד: {document.error_message}</p>
      )}

      {document.status === "done" && document.extraction && (
        <dl className="space-y-2 text-sm">
          {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).map((field) => (
            <div key={field}>
              <dt className="font-medium text-slate-600">{FIELD_LABELS[field]}</dt>
              <dd>{document.extraction![field] ?? "—"}</dd>
            </div>
          ))}
          <div>
            <dt className="font-medium text-slate-600">יעדים</dt>
            <dd>
              <ul className="list-inside list-disc">
                {document.extraction.goals.map((goal, i) => (
                  <li key={i}>{goal}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">התאמות</dt>
            <dd>
              <ul className="list-inside list-disc">
                {document.extraction.accommodations.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">ביטחון</dt>
            <dd>{Math.round(document.extraction.confidence * 100)}%</dd>
          </div>
        </dl>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Write `components/dashboard/document-table.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { DocumentRow } from "@/lib/supabase";
import { DocumentDetailPanel } from "./document-detail-panel";

const STATUS_LABELS: Record<DocumentRow["status"], string> = {
  processing: "בעיבוד",
  done: "הושלם",
  failed: "נכשל",
};

export function DocumentTable({ documents }: { documents: DocumentRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = documents.find((doc) => doc.id === selectedId) ?? null;

  return (
    <div className="flex gap-6">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-right">
            <th className="p-2">קובץ</th>
            <th className="p-2">סטטוס</th>
            <th className="p-2">ביטחון</th>
            <th className="p-2">הועלה</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              onClick={() => setSelectedId(doc.id)}
              className={`cursor-pointer border-b hover:bg-slate-100 ${
                doc.id === selectedId ? "bg-slate-100" : ""
              }`}
            >
              <td className="p-2">{doc.original_filename}</td>
              <td className="p-2">{STATUS_LABELS[doc.status]}</td>
              <td className="p-2">
                {doc.extraction ? `${Math.round(doc.extraction.confidence * 100)}%` : "—"}
              </td>
              <td className="p-2">{new Date(doc.uploaded_at).toLocaleString("he-IL")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && <DocumentDetailPanel document={selected} />}
    </div>
  );
}
```

- [ ] **Step 3: Update `app/page.tsx`**

Replace the full file with:

```tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { createSupabaseClient, listDocumentsWithExtractions } from "@/lib/supabase";
import { DocumentTable } from "@/components/dashboard/document-table";

export default async function HomePage() {
  const { env } = getCloudflareContext();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const documents = await listDocumentsWithExtractions(supabase);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">מסמכי תח&quot;י שהועלו</h1>
      <DocumentTable documents={documents} />
    </main>
  );
}
```

- [ ] **Step 4: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`, no type errors.

- [ ] **Step 5 (manual verification): Confirm the dashboard renders real data**

Run: `npm run dev` (requires Task 1's `.dev.vars` to be in place)

Open `http://localhost:3000` in a browser. Expected: a table listing whatever documents already exist in Supabase (from earlier manual testing of the upload endpoint), with status/confidence/upload-date columns. Click a row — expected: the detail panel appears on the side, showing labeled fields for a `done` document, an error message for a `failed` one, or "המסמך בעיבוד…" for one still `processing`.

If the table is empty, that's expected if no documents exist yet in this Supabase project — not a bug in this task.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx components/dashboard/document-table.tsx components/dashboard/document-detail-panel.tsx
git commit -m "Add dashboard: document list + click-through detail panel"
```

---

### Task 4: Auto-refresh while a document is processing

**Files:**
- Modify: `components/dashboard/document-table.tsx`

**Interfaces:** No new exports — this only changes `DocumentTable`'s internal behavior.

- [ ] **Step 1: Add polling to `components/dashboard/document-table.tsx`**

Change the imports and component body:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentRow } from "@/lib/supabase";
import { DocumentDetailPanel } from "./document-detail-panel";

const STATUS_LABELS: Record<DocumentRow["status"], string> = {
  processing: "בעיבוד",
  done: "הושלם",
  failed: "נכשל",
};

export function DocumentTable({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = documents.find((doc) => doc.id === selectedId) ?? null;

  const hasProcessing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const intervalId = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(intervalId);
  }, [hasProcessing, router]);

  return (
    <div className="flex gap-6">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-right">
            <th className="p-2">קובץ</th>
            <th className="p-2">סטטוס</th>
            <th className="p-2">ביטחון</th>
            <th className="p-2">הועלה</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              onClick={() => setSelectedId(doc.id)}
              className={`cursor-pointer border-b hover:bg-slate-100 ${
                doc.id === selectedId ? "bg-slate-100" : ""
              }`}
            >
              <td className="p-2">{doc.original_filename}</td>
              <td className="p-2">{STATUS_LABELS[doc.status]}</td>
              <td className="p-2">
                {doc.extraction ? `${Math.round(doc.extraction.confidence * 100)}%` : "—"}
              </td>
              <td className="p-2">{new Date(doc.uploaded_at).toLocaleString("he-IL")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && <DocumentDetailPanel document={selected} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3 (manual verification): Confirm polling actually starts and stops**

With `npm run dev` running and the dashboard open, use `curl` (per Task 1 Step 9) to upload a new document while watching the dashboard tab. Expected: the new row appears within ~3 seconds without a manual reload, showing `processing`, then flips to `done`/`failed` on its own once the background extraction finishes — no further network activity in the browser dev tools' Network tab once every row is settled (confirms the interval actually clears).

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/document-table.tsx
git commit -m "Auto-refresh the dashboard while any document is still processing"
```

---

### Task 5: Client-side filters (date range, min confidence)

**Files:**
- Create: `lib/document-filters.ts`
- Test: `lib/document-filters.test.ts`
- Create: `components/dashboard/document-filters.tsx`
- Modify: `components/dashboard/document-table.tsx`

**Interfaces:**
- Consumes: `type { DocumentRow } from "@/lib/supabase"` (Task 2).
- Produces: `export interface Filters { dateFrom: string; dateTo: string; minConfidence: number; }`, `export const DEFAULT_FILTERS: Filters`, `export function applyFilters(documents: DocumentRow[], filters: Filters): DocumentRow[]` from `lib/document-filters.ts`. Consumed by `components/dashboard/document-filters.tsx` and `document-table.tsx`.

- [ ] **Step 1: Write the failing test — `lib/document-filters.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "./document-filters";
import type { DocumentRow } from "./supabase";

function buildDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: "doc-1",
    storage_path: "documents/doc-1.pdf",
    original_filename: "sample.pdf",
    status: "done",
    error_message: null,
    uploaded_at: "2028-03-14T10:00:00.000Z",
    extraction: {
      student_id: null,
      school_year: 'תשפ"ח',
      disability_category: null,
      placement_type: "הכלה חלקית",
      weekly_support_hours: null,
      goals: [],
      review_date: null,
      accommodations: [],
      confidence: 0.9,
    },
    ...overrides,
  };
}

describe("applyFilters", () => {
  it("returns all documents when filters are at defaults", () => {
    const docs = [buildDoc()];
    expect(applyFilters(docs, DEFAULT_FILTERS)).toEqual(docs);
  });

  it("excludes documents uploaded before dateFrom", () => {
    const docs = [buildDoc({ uploaded_at: "2028-01-01T00:00:00.000Z" })];
    const filters: Filters = { ...DEFAULT_FILTERS, dateFrom: "2028-02-01" };
    expect(applyFilters(docs, filters)).toEqual([]);
  });

  it("excludes documents uploaded after dateTo", () => {
    const docs = [buildDoc({ uploaded_at: "2028-05-01T00:00:00.000Z" })];
    const filters: Filters = { ...DEFAULT_FILTERS, dateTo: "2028-02-01" };
    expect(applyFilters(docs, filters)).toEqual([]);
  });

  it("excludes documents below the minimum confidence", () => {
    const doc = buildDoc();
    const docs = [{ ...doc, extraction: { ...doc.extraction!, confidence: 0.5 } }];
    const filters: Filters = { ...DEFAULT_FILTERS, minConfidence: 60 };
    expect(applyFilters(docs, filters)).toEqual([]);
  });

  it("treats a document with no extraction yet as 0% confidence", () => {
    const docs = [buildDoc({ status: "processing", extraction: null })];
    const filters: Filters = { ...DEFAULT_FILTERS, minConfidence: 1 };
    expect(applyFilters(docs, filters)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/document-filters.test.ts`
Expected: FAIL — `Cannot find module './document-filters'`.

- [ ] **Step 3: Write `lib/document-filters.ts`**

```ts
import type { DocumentRow } from "./supabase";

export interface Filters {
  dateFrom: string; // "YYYY-MM-DD", "" = no lower bound
  dateTo: string; // "YYYY-MM-DD", "" = no upper bound
  minConfidence: number; // 0-100, 0 = no filter
}

export const DEFAULT_FILTERS: Filters = { dateFrom: "", dateTo: "", minConfidence: 0 };

export function applyFilters(documents: DocumentRow[], filters: Filters): DocumentRow[] {
  return documents.filter((doc) => {
    const uploadedDate = doc.uploaded_at.slice(0, 10);
    if (filters.dateFrom && uploadedDate < filters.dateFrom) return false;
    if (filters.dateTo && uploadedDate > filters.dateTo) return false;

    const confidencePercent = doc.extraction ? doc.extraction.confidence * 100 : 0;
    if (filters.minConfidence > 0 && confidencePercent < filters.minConfidence) return false;

    return true;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/document-filters.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Write `components/dashboard/document-filters.tsx`**

```tsx
"use client";

import type { Filters } from "@/lib/document-filters";

export function DocumentFilters({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (filters: Filters) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-4 text-sm">
      <label className="flex flex-col gap-1">
        מתאריך
        <input
          type="date"
          value={value.dateFrom}
          onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
          className="rounded border p-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        עד תאריך
        <input
          type="date"
          value={value.dateTo}
          onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
          className="rounded border p-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        ביטחון מינימלי ({value.minConfidence}%)
        <input
          type="range"
          min={0}
          max={100}
          value={value.minConfidence}
          onChange={(e) => onChange({ ...value, minConfidence: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 6: Wire filters into `components/dashboard/document-table.tsx`**

Change the imports and component body:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentRow } from "@/lib/supabase";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "@/lib/document-filters";
import { DocumentDetailPanel } from "./document-detail-panel";
import { DocumentFilters } from "./document-filters";

const STATUS_LABELS: Record<DocumentRow["status"], string> = {
  processing: "בעיבוד",
  done: "הושלם",
  failed: "נכשל",
};

export function DocumentTable({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const hasProcessing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const intervalId = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(intervalId);
  }, [hasProcessing, router]);

  const filteredDocuments = applyFilters(documents, filters);
  const selected = filteredDocuments.find((doc) => doc.id === selectedId) ?? null;

  return (
    <div>
      <DocumentFilters value={filters} onChange={setFilters} />
      <div className="flex gap-6">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-right">
              <th className="p-2">קובץ</th>
              <th className="p-2">סטטוס</th>
              <th className="p-2">ביטחון</th>
              <th className="p-2">הועלה</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map((doc) => (
              <tr
                key={doc.id}
                onClick={() => setSelectedId(doc.id)}
                className={`cursor-pointer border-b hover:bg-slate-100 ${
                  doc.id === selectedId ? "bg-slate-100" : ""
                }`}
              >
                <td className="p-2">{doc.original_filename}</td>
                <td className="p-2">{STATUS_LABELS[doc.status]}</td>
                <td className="p-2">
                  {doc.extraction ? `${Math.round(doc.extraction.confidence * 100)}%` : "—"}
                </td>
                <td className="p-2">{new Date(doc.uploaded_at).toLocaleString("he-IL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {selected && <DocumentDetailPanel document={selected} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the full test suite and verify the build**

Run: `npm test`
Expected: all pre-existing tests plus the 5 new `document-filters.test.ts` tests pass.

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 8 (manual verification): Confirm filters actually filter**

With `npm run dev` running, open the dashboard. Set "מתאריך" (from-date) to tomorrow's date — expected: the list becomes empty (assuming existing documents were uploaded before today). Reset it, then drag the confidence slider above an existing document's confidence — expected: that document disappears from the list; dragging back down brings it back.

- [ ] **Step 9: Commit**

```bash
git add lib/document-filters.ts lib/document-filters.test.ts components/dashboard/document-filters.tsx components/dashboard/document-table.tsx
git commit -m "Add client-side filters (date range, min confidence) to the dashboard"
```

---

### Task 6: Upload form wired to a Server Action

**Files:**
- Create: `app/actions.ts`
- Create: `components/dashboard/upload-form.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `handleUpload`, `type { UploadDocumentDeps }` (Task 1), `createSupabaseClient`, `insertDocument`, `insertExtraction`, `updateDocumentStatus` (`lib/supabase.ts`), `type { Env }` (`lib/cloudflare-env.ts`, Task 1).
- Produces: `export type UploadActionResult = { success: true; documentId: string } | { success: false; error: string }` and `export async function uploadDocument(formData: FormData): Promise<UploadActionResult>` from `app/actions.ts`. Consumed by `components/dashboard/upload-form.tsx`.

No automated test for the Server Action itself — like `app/api/upload/route.ts`, it depends on live Cloudflare bindings (`getCloudflareContext()`) that only resolve under a real dev/deployed environment, not Vitest. This is the same, already-accepted gap as the route handler; `lib/upload-document.ts`'s tests (Task 1) already cover the actual upload logic this action delegates to.

- [ ] **Step 1: Write `app/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { handleUpload } from "@/lib/upload-document";
import {
  createSupabaseClient,
  insertDocument,
  insertExtraction,
  updateDocumentStatus,
} from "@/lib/supabase";

export type UploadActionResult =
  | { success: true; documentId: string }
  | { success: false; error: string };

export async function uploadDocument(formData: FormData): Promise<UploadActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return { success: false, error: "יש לבחור קובץ PDF בלבד" };
  }

  const { env, ctx } = getCloudflareContext();
  const fileBuffer = await file.arrayBuffer();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { documentId } = await handleUpload(fileBuffer, file.name, {
      putObject: (key, body) => env.DOCS_BUCKET.put(key, body).then(() => undefined),
      insertDocument: (storagePath, originalFilename) =>
        insertDocument(supabase, storagePath, originalFilename),
      geminiApiKey: env.GEMINI_API_KEY,
      insertExtraction: (documentId, extraction) => insertExtraction(supabase, documentId, extraction),
      updateDocumentStatus: (documentId, status, errorMessage) =>
        updateDocumentStatus(supabase, documentId, status, errorMessage ?? null),
      webhookUrl: env.WEBHOOK_URL,
      webhookSecret: env.WEBHOOK_SECRET,
      waitUntil: ctx.waitUntil.bind(ctx),
    });
    revalidatePath("/");
    return { success: true, documentId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `העלאה נכשלה: ${message}` };
  }
}
```

- [ ] **Step 2: Write `components/dashboard/upload-form.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/app/actions";

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("pending");
    setError(null);
    const result = await uploadDocument(formData);
    if (result.success) {
      setStatus("idle");
      formRef.current?.reset();
      router.refresh();
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="mb-6 flex items-center gap-3">
      <input type="file" name="file" accept="application/pdf" required className="text-sm" />
      <button
        type="submit"
        disabled={status === "pending"}
        className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {status === "pending" ? "מעלה…" : "העלאת מסמך"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Wire the upload form into `app/page.tsx`**

```tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { createSupabaseClient, listDocumentsWithExtractions } from "@/lib/supabase";
import { DocumentTable } from "@/components/dashboard/document-table";
import { UploadForm } from "@/components/dashboard/upload-form";

export default async function HomePage() {
  const { env } = getCloudflareContext();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const documents = await listDocumentsWithExtractions(supabase);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">מסמכי תח&quot;י שהועלו</h1>
      <UploadForm />
      <DocumentTable documents={documents} />
    </main>
  );
}
```

- [ ] **Step 4: Verify the project builds and tests pass**

Run: `npm run build`
Expected: `Compiled successfully`.

Run: `npm test`
Expected: all tests still pass (no new ones added this task).

- [ ] **Step 5 (manual verification): Confirm the upload button actually works**

With `npm run dev` running (Task 1's `.dev.vars` in place), open the dashboard and use the file input to select `sample_iep_decision.pdf`, then click "העלאת מסמך". Expected: the button shows "מעלה…" while pending, then the form resets and a new row appears in the table with status `processing`, which (per Task 4's polling) flips to `done`/`failed` on its own within a few seconds.

**This is the step that verifies the design phase's biggest open assumption** — that `getCloudflareContext()` actually works inside a Server Action under `@opennextjs/cloudflare`, the same way it works in Route Handlers and Server Components. If the upload button throws an error instead (check the terminal running `npm run dev` and the browser console), STOP and report BLOCKED with the exact error — this would mean Server Actions need a different binding-access approach than route handlers do, which is a design-level question, not a small fix to guess at.

- [ ] **Step 6: Commit**

```bash
git add app/actions.ts components/dashboard/upload-form.tsx app/page.tsx
git commit -m "Add upload form wired to a Server Action"
```

---

### Task 7: Update status docs

**Files:**
- Modify: `README.md`
- Modify: `SPEC.md`
- Modify: `CLAUDE.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Check off the completed item in `README.md`'s `## Status`**

Change:

```markdown
- [ ] Dashboard UI
```

to:

```markdown
- [x] Dashboard UI
```

Leave `REST API read endpoints` unchecked — this plan doesn't build it (per the design spec, it's explicitly out of scope: the dashboard reads Supabase directly, not through a REST API).

- [ ] **Step 2: Check off the corresponding line in `SPEC.md`'s checklist**

Change:

```markdown
- [ ] Dashboard: רשימה + פנל + Upload UI
```

to:

```markdown
- [x] Dashboard: רשימה + פנל + Upload UI
```

- [ ] **Step 3: Update `CLAUDE.md`'s Status section**

Find the sentence listing what's not yet built (currently something like "Not yet built: ... dashboard, REST API, deploy.") and remove "dashboard" from that list, since it's now done. Keep "REST API" in the not-yet-built list.

- [ ] **Step 4: Commit**

```bash
git add README.md SPEC.md CLAUDE.md
git commit -m "Update status checklists: Dashboard UI done"
```
