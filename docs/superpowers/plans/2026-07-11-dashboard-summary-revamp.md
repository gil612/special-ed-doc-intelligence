# Dashboard Summary Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gemini-written one/two-sentence `summary` to every extraction, replace the dashboard's table+side-panel layout with a compact list that expands inline on click, and let the upload form accept multiple files at once, each progressing independently.

**Architecture:** `summary` is added to `IEPExtraction` (Python reference schema, TypeScript production schema, Gemini prompt + `responseSchema`) and generated in the same Gemini call already being made — no new API call, no added cost. `DocumentDetailPanel` becomes layout-agnostic content (no more outer `<aside>`/heading) so it can be embedded inline. A new `DocumentList` component replaces `DocumentTable`, carrying over the existing polling (Task 4 of the prior plan) and filtering (Task 5) logic unchanged, just with a single-column list container instead of a table+aside. `UploadForm` gets a `multiple` file input and loops over selected files client-side, calling the existing (unchanged) `uploadDocument` Server Action once per file.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Pydantic, `@google/genai`, Supabase, Tailwind — same stack as the rest of the project, no new dependencies.

## Global Constraints

- `summary` must be nullable everywhere (Python `Optional[str]`, TypeScript `.nullish()`) — Gemini can fail to produce one, and the pipeline must not hard-fail an otherwise-valid extraction over a missing summary, per the same graceful-degradation principle already applied to `school_year`/`review_date`.
- The Gemini call must not be duplicated or added to — `summary` is one more field in the *existing* `buildExtractionPrompt`/`RESPONSE_SCHEMA` in `lib/gemini.ts`, not a second API call.
- `summary` is generated from already-redacted text (same as every other field) — no new PII exposure path. The prompt should ask for a summary that reads naturally rather than quoting redaction placeholder tokens (e.g. `[REDACTED_NAME]`) verbatim.
- No automated tests for React components (`document-list.tsx`, `upload-form.tsx`) — consistent with the rest of the dashboard, verified manually against a real `npm run dev` instance instead. Pure schema/logic changes (the `summary` field itself) do get a test, same as every other field in `lib/extraction-schema.test.ts`.
- The existing polling (`hasProcessing` computed from the raw `documents` prop, not the filtered set) and filtering (`applyFilters`) logic must carry over to `DocumentList` unchanged — this plan only changes the rendering, not that logic.
- `app/actions.ts`'s `uploadDocument` Server Action signature must not change — multi-file support is entirely a client-side loop calling it once per file, per the design spec's explicit decision to avoid touching the Server Action.

---

### Task 1: Add `summary` to the extraction schema, Gemini prompt/responseSchema, and Supabase mapping

**Files:**
- Modify: `iep_schema.py`
- Modify: `lib/extraction-schema.ts`
- Modify: `lib/extraction-schema.test.ts`
- Modify: `lib/gemini.ts`
- Modify: `lib/supabase.ts`
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `IEPExtraction.summary: string | null` (both Python and TypeScript), consumed by Task 2 (`DocumentDetailPanel`).
- No other signature changes — `insertExtraction(client, documentId, extraction)` already spreads `...extraction` into the insert payload, so it picks up `summary` automatically once it's part of the `IEPExtraction` type. Only the explicit field-by-field reconstruction in `listDocumentsWithExtractions` needs a new line.

- [ ] **Step 1: Add the field to `iep_schema.py`**

In `iep_schema.py`, inside the `IEPExtraction` class, add this field after `confidence` (the last field currently in the class):

```python
    summary: Optional[str] = Field(
        default=None,
        description="סיכום קצר (1-2 משפטים) של המקרה — שיבוץ, היקף תמיכה, ונקודה מרכזית אחת",
    )
```

- [ ] **Step 2: Write the failing test — `lib/extraction-schema.test.ts`**

Add this test right after the existing `"accepts a null school_year instead of failing the whole extraction"` test (around line 87):

```ts
  it("accepts a null summary", () => {
    const result = IEPExtractionSchema.parse(validExtraction({ summary: null }));
    expect(result.summary).toBeNull();
  });

  it("defaults summary to null when the model omits it entirely", () => {
    const result = IEPExtractionSchema.parse(validExtraction());
    expect(result.summary).toBeNull();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- lib/extraction-schema.test.ts`
Expected: FAIL — `result.summary` is `undefined` (Zod strips unknown keys by default, so accessing `.summary` on the parsed object is a TypeScript error until the schema declares it, and at runtime `undefined !== null`).

- [ ] **Step 4: Add the field to `lib/extraction-schema.ts`**

In the `IEPExtractionSchema` object, add this line right after `confidence: z.number().min(0).max(1),` (the last field):

```ts
  confidence: z.number().min(0).max(1),
  summary: z.string().nullish().transform((value) => value ?? null),
});
```

(This replaces the existing closing `});` — the new `summary` line goes between `confidence` and the closing brace.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- lib/extraction-schema.test.ts`
Expected: all tests PASS (20 tests: 18 existing + 2 new).

- [ ] **Step 6: Add `summary` to the Gemini prompt and response schema — `lib/gemini.ts`**

Change `RESPONSE_SCHEMA`'s `properties` object to add `summary` right after `confidence`:

```ts
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    student_id: { type: Type.STRING, nullable: true },
    school_year: { type: Type.STRING, nullable: true },
    disability_category: { type: Type.STRING, nullable: true },
    placement_type: { type: Type.STRING, format: "enum", enum: [...PlacementType.options] },
    weekly_support_hours: { type: Type.NUMBER, nullable: true },
    goals: { type: Type.ARRAY, items: { type: Type.STRING } },
    review_date: { type: Type.STRING, nullable: true },
    accommodations: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: { type: Type.NUMBER },
    summary: { type: Type.STRING, nullable: true },
  },
  required: ["placement_type", "confidence"],
};
```

And change `buildExtractionPrompt`'s field list to add a `summary` bullet right after the `confidence` bullet, and before the closing `אם שדה לא מופיע...` line:

```ts
export function buildExtractionPrompt(redactedDocumentText: string): string {
  return `חלץ מהמסמך הבא נתונים לפי השדות הבאים, והחזר JSON תקין בלבד (בלי הסברים):

- student_id: מזהה תלמיד פנימי בלבד (למשל STU-0001) — לעולם לא שם מלא. null אם לא ניתן לזהות.
- school_year: שנת לימודים, למשל תשפ"ז
- disability_category: קטגוריית הליקוי כפי שמופיע במסמך, או null
- placement_type: אחת מהערכים: "הכלה מלאה", "הכלה חלקית", "כיתה מיוחדת בבי\"ס רגיל", "חינוך מיוחד נפרד"
- weekly_support_hours: שעות תמיכה שבועיות שהוקצו (מספר), או null
- goals: מערך של יעדים חינוכיים/טיפוליים (מחרוזות)
- review_date: תאריך הוועדה/עדכון הבא, בפורמט שמופיע במסמך
- accommodations: מערך של התאמות נדרשות (מחרוזות)
- confidence: שדה חובה, 0-1, עד כמה החילוץ הכולל מלא ואמין
- summary: סיכום קצר בעברית (1-2 משפטים) של המקרה — שיבוץ, היקף תמיכה עיקרי,
  ונקודה מרכזית אחת. התייחס לתלמיד/ה באופן כללי, בלי לצטט placeholder-ים
  כמו [REDACTED_NAME] במפורש. null אם אין מספיק מידע לסיכום משמעותי.

אם שדה לא מופיע במסמך במפורש, החזר null עבורו — אל תמציא ערך.

מסמך:
${redactedDocumentText}`;
}
```

- [ ] **Step 7: Add `summary` to the Supabase mapping — `lib/supabase.ts`**

In `DocumentRow`'s embedded extraction type is `IEPExtraction`, which already picked up `summary` from Task 1 Step 4 — no interface change needed there. But `listDocumentsWithExtractions`'s manual field reconstruction needs the new field. Change:

```ts
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
```

to:

```ts
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
          summary: rawExtraction.summary,
        }
      : null;
```

- [ ] **Step 8: Add the column to `supabase/schema.sql`**

In the `extractions` table definition, add `summary text,` right after the `confidence` column line:

```sql
    confidence numeric not null check (confidence >= 0 and confidence <= 1),
    summary text,
    created_at timestamptz not null default now()
```

- [ ] **Step 9: Run the full test suite and verify the build**

Run: `npm test`
Expected: all tests pass (55 existing + 2 new from Step 2 = 57... but note Step 2 added 2 tests to a file that already had 18, so expect 20 in that file, 57 total across the suite).

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 10: Commit**

```bash
git add iep_schema.py lib/extraction-schema.ts lib/extraction-schema.test.ts lib/gemini.ts lib/supabase.ts supabase/schema.sql
git commit -m "Add Gemini-written summary field to the extraction schema"
```

**Important — manual database migration required.** The live Supabase database already has the `extractions` table created without a `summary` column. Adding it to `supabase/schema.sql` only affects *fresh* installs. Before any later task's manual verification can succeed end-to-end (an insert with a `summary` value will otherwise fail with "column does not exist"), this must be run once in the Supabase SQL editor:

```sql
alter table extractions add column summary text;
```

Flag this to the user; do not attempt to run it yourself (no direct Postgres connection is available, only the Supabase REST API via the service-role key, which cannot execute DDL).

---

### Task 2: Show the summary in `DocumentDetailPanel`, and make it layout-agnostic

**Files:**
- Modify: `components/dashboard/document-detail-panel.tsx`

**Interfaces:**
- Consumes: `DocumentRow` (`lib/supabase.ts`, now including `extraction.summary`).
- Produces: `DocumentDetailPanel({ document })` — same props as before, but no longer renders its own outer `<aside>`/width/border/heading. Consumed by Task 3's `DocumentList`, which will own the surrounding layout chrome (border, background, spacing) since the panel is now embedded inline under a list row instead of standing alone as a side panel.

- [ ] **Step 1: Replace `components/dashboard/document-detail-panel.tsx`**

Replace the entire file with:

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
    <div className="w-full text-sm">
      {document.status === "processing" && <p className="text-slate-500">המסמך בעיבוד…</p>}

      {document.status === "failed" && (
        <p className="text-red-600">כשל בעיבוד: {document.error_message}</p>
      )}

      {document.status === "done" && document.extraction && (
        <div className="space-y-4">
          <p className="text-slate-800">{document.extraction.summary ?? "אין סיכום זמין"}</p>

          <dl className="space-y-2">
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
        </div>
      )}
    </div>
  );
}
```

Note what changed from the previous version: the outer `<aside className="w-96 shrink-0 rounded border bg-white p-4">` became a plain `<div className="w-full text-sm">`, the `<h2>{document.original_filename}</h2>` heading was removed (Task 3's list row already shows the filename in its collapsed header, so repeating it in the expanded content would be redundant), and a summary paragraph was added at the top of the "done" branch with a fallback string when `summary` is null.

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`. (This will show a type error / unused-import warning if `document-table.tsx` still imports this component in a way incompatible with the new props — it doesn't; the props themselves haven't changed, only the internal rendering. If Task 3 hasn't run yet, `document-table.tsx` still renders `<DocumentDetailPanel document={selected} />` inside its own `<aside>`-less `flex gap-6` layout, which will now look visually different — narrower/unstyled — until Task 3 replaces that layout entirely. This is expected and temporary; Task 3 fixes the container.)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/document-detail-panel.tsx
git commit -m "Show Gemini-written summary in DocumentDetailPanel; make it layout-agnostic"
```

---

### Task 3: Replace `DocumentTable` with a compact `DocumentList` (inline expansion)

**Files:**
- Create: `components/dashboard/document-list.tsx`
- Delete: `components/dashboard/document-table.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `DocumentRow` (`lib/supabase.ts`), `applyFilters`/`DEFAULT_FILTERS`/`Filters` (`lib/document-filters.ts`), `DocumentFilters` (`components/dashboard/document-filters.tsx`), `DocumentDetailPanel` (Task 2).
- Produces: `DocumentList({ documents }: { documents: DocumentRow[] })`, consumed by `app/page.tsx`.

- [ ] **Step 1: Create `components/dashboard/document-list.tsx`**

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

export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Deliberately computed from the raw `documents` prop, not the filtered
  // set: a processing row hidden by an active filter must still keep
  // polling, or it would never learn it settled to done/failed. Unchanged
  // from the previous DocumentTable.
  const hasProcessing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const intervalId = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(intervalId);
  }, [hasProcessing, router]);

  const filteredDocuments = applyFilters(documents, filters);

  return (
    <div>
      <DocumentFilters value={filters} onChange={setFilters} />
      <ul className="divide-y rounded border">
        {filteredDocuments.map((doc) => {
          const isSelected = doc.id === selectedId;
          return (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => setSelectedId(isSelected ? null : doc.id)}
                className="flex w-full items-center justify-between gap-4 p-3 text-right text-sm hover:bg-slate-50"
              >
                <span className="truncate">{doc.original_filename}</span>
                <span className="flex shrink-0 items-center gap-4 text-slate-600">
                  <span>{STATUS_LABELS[doc.status]}</span>
                  <span>{doc.extraction ? `${Math.round(doc.extraction.confidence * 100)}%` : "—"}</span>
                </span>
              </button>
              {isSelected && (
                <div className="border-t bg-slate-50 p-3">
                  <DocumentDetailPanel document={doc} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

Note on the selection/filtering interaction: unlike the previous `DocumentTable`, there is no separate `selected` lookup with a `?? null` fallback — a row's expanded content is rendered *inline within that row's own `<li>`*, so if the selected document gets filtered out of `filteredDocuments`, its row (and thus its expansion) simply isn't rendered at all. This achieves the same graceful-degradation property the previous design needed an explicit fallback for, without needing one here.

Also note the toggle behavior: clicking an already-expanded row's button collapses it (`setSelectedId(isSelected ? null : doc.id)`), which the previous side-panel design didn't need (a persistent side panel showing whatever was last selected made sense there; a self-collapsing inline row is the natural fit here).

- [ ] **Step 2: Delete `components/dashboard/document-table.tsx`**

```bash
rm components/dashboard/document-table.tsx
```

- [ ] **Step 3: Update `app/page.tsx`**

Change the import and usage:

```tsx
import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { createSupabaseClient, listDocumentsWithExtractions } from "@/lib/supabase";
import { DocumentList } from "@/components/dashboard/document-list";
import { UploadForm } from "@/components/dashboard/upload-form";

// This page reads live Cloudflare bindings (getCloudflareContext) and
// fetches per-request data from Supabase, so it must never be statically
// prerendered. Without this, `next build` fails with: "getCloudflareContext
// has been called in sync mode in either a static route or at the top
// level of a non-static one" — Next.js otherwise tries to prerender `/` at
// build time, before any request context exists. See
// https://github.com/opennextjs/opennextjs-cloudflare/issues/652.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { env } = getCloudflareContext();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const documents = await listDocumentsWithExtractions(supabase);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">מסמכי תח&quot;י שהועלו</h1>
      <UploadForm />
      <DocumentList documents={documents} />
    </main>
  );
}
```

- [ ] **Step 4: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`. If `document-table.tsx` deletion left a dangling import anywhere else, this will surface it — grep for `document-table` and `DocumentTable` across the repo first if the build fails here.

- [ ] **Step 5 (manual verification): Confirm the compact list and inline expansion work**

With `npm run dev` running (real Supabase data via `.dev.vars`/`.env.local`), open the dashboard. Expected:
- Documents render as a single-column list (filename, status, confidence), not a table.
- Clicking a row expands it in place, showing the summary paragraph followed by the full field breakdown; clicking the same row again collapses it.
- A `processing` row still polls and flips to `done`/`failed` on its own (Task 4 of the prior plan, unchanged).
- The date-range/confidence filters (Task 5 of the prior plan) still work, and a row that gets filtered out while expanded disappears cleanly (no error).

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/document-list.tsx app/page.tsx components/dashboard/document-table.tsx
git commit -m "Replace DocumentTable with a compact DocumentList (inline expansion)"
```

(`document-table.tsx` was already removed from disk in Step 2 — `git add` on a deleted path stages the removal, same as `git rm` would.)

---

### Task 4: Multi-file upload

**Files:**
- Modify: `components/dashboard/upload-form.tsx`

**Interfaces:**
- Consumes: `uploadDocument` (`app/actions.ts`) — **unchanged signature**, called once per selected file.
- Produces: no exported interface changes — `UploadForm` still takes no props.

- [ ] **Step 1: Replace `components/dashboard/upload-form.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/app/actions";

interface UploadError {
  fileName: string;
  error: string;
}

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [errors, setErrors] = useState<UploadError[]>([]);

  async function handleSubmit(formData: FormData) {
    const files = formData.getAll("file").filter((value): value is File => value instanceof File);
    if (files.length === 0) return;

    setErrors([]);
    setPendingCount(files.length);

    // Each file is uploaded independently: as soon as ITS OWN
    // uploadDocument() call settles, router.refresh() runs immediately for
    // that file alone, rather than waiting for the whole batch. This is
    // what makes each file's row appear on its own timeline instead of
    // all-at-once after the slowest upload in the batch.
    await Promise.all(
      files.map(async (file) => {
        const singleFileFormData = new FormData();
        singleFileFormData.set("file", file);
        try {
          const result = await uploadDocument(singleFileFormData);
          if (!result.success) {
            setErrors((prev) => [...prev, { fileName: file.name, error: result.error }]);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setErrors((prev) => [...prev, { fileName: file.name, error: message }]);
        } finally {
          setPendingCount((prev) => prev - 1);
          router.refresh();
        }
      })
    );

    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="mb-6">
      <div className="flex items-center gap-3">
        <input type="file" name="file" accept="application/pdf" required multiple className="text-sm" />
        <button
          type="submit"
          disabled={pendingCount > 0}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pendingCount > 0 ? `מעלה… (${pendingCount} נותרו)` : "העלאת מסמכים"}
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-red-600">
          {errors.map((err, i) => (
            <li key={i}>
              {err.fileName}: {err.error}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
```

Note the `try`/`catch`/`finally` wrapping *each individual* `uploadDocument()` call: `uploadDocument` itself already returns `{success: false, error}` rather than throwing for most failure paths, but its own outer code (`getCloudflareContext()`, `file.arrayBuffer()`, `createSupabaseClient()`) sits outside its internal `try`/`catch` and could theoretically reject the whole call. Catching per-file here means one file's unexpected rejection can never prevent the other files' results (or their own `finally`-driven `router.refresh()`/`pendingCount` update) from being processed — this is why the outer `Promise.all` is safe despite not being `Promise.allSettled`: every mapped async function already resolves (never rejects) by construction.

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3 (manual verification): Confirm multi-file upload works**

With `npm run dev` running, open the dashboard and select 2-3 PDF files at once in the file input (e.g. a few files from `cases/`), then submit. Expected:
- The button shows a countdown (`מעלה… (N נותרו)`) that decreases as each file's own upload settles, not just at the very end.
- Each file's row appears in the list independently, roughly as soon as its own upload call resolves — not all bunched up together after the slowest one.
- If one selected file is deliberately invalid (e.g. rename a `.txt` to `.pdf` and include it, or just test with a non-PDF selection if the `accept`/`required` attributes don't block it at the OS file-picker level), only that file's error shows in the red error list; the other valid files still upload and process normally.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/upload-form.tsx
git commit -m "Support uploading multiple files at once, each progressing independently"
```

---

### Task 5: Update SPEC.md's field list with `summary`

**Files:**
- Modify: `SPEC.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Add `summary` to the `IEPExtraction` model listing**

Find the `class IEPExtraction(BaseModel):` block in `SPEC.md` and add this line right after the `confidence` field (the last field currently listed):

```python
    confidence: float = Field(description="0-1 ציון ביטחון בחילוץ")
    summary: str | None = Field(description="סיכום קצר (1-2 משפטים) של המקרה")
```

- [ ] **Step 2: Add `summary` to the Supabase data-model listing**

Find the `extractions:` line in the `מודל נתונים (Supabase)` section and add `summary` right after `confidence`:

```
extractions: id, document_id (FK), student_id, school_year, disability_category,
             placement_type, weekly_support_hours, goals (jsonb), review_date,
             accommodations (jsonb), confidence, summary, created_at
```

- [ ] **Step 3: Commit**

```bash
git add SPEC.md
git commit -m "Document the summary field in SPEC.md"
```

---

## Postscript: manual steps before this is fully live

1. Run `alter table extractions add column summary text;` in the Supabase SQL editor (flagged in Task 1) — without this, any extraction insert will fail once `summary` is part of the payload.
2. After all 5 tasks are merged, redeploy (`npm run deploy`) — none of this takes effect in production until deployed, same as every prior fix in this project.
