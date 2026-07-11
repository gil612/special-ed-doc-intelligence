# Dashboard Interactivity Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard feel smoother and friendlier — animated expand/collapse, a processing spinner, a color-coded confidence badge, a warm empty state, and softer hover transitions — pure CSS/Tailwind + one small new component, no backend or data-model changes.

**Architecture:** A new `ConfidenceBadge` component (colored pill by confidence threshold) is shared between `DocumentDetailPanel` and `DocumentList`, so the same visual logic isn't duplicated. `DocumentList`'s row-collapse mechanism changes from conditional rendering (`isSelected && <div>`) to always-rendered-but-CSS-collapsed (a `grid-template-rows: 0fr → 1fr` transition), which is what makes the expand/collapse animatable — Tailwind's transitions can't animate an element appearing/disappearing from the DOM, only a CSS property changing on an element that's already there.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS (arbitrary-value JIT classes, e.g. `grid-rows-[1fr]`) — no new dependencies.

## Global Constraints

- No new npm dependencies — animations are CSS/Tailwind only (no `framer-motion` or similar), per the design spec's explicit scope decision for a course project.
- The existing polling (`hasProcessing` from the raw `documents` prop) and filtering (`applyFilters`) logic in `DocumentList` must not change.
- The property that a filtered-out document's row (and any expansion) disappears entirely — not just visually — must still hold: `.map()` continues to iterate over `filteredDocuments`, not the raw `documents` array, so a filtered-out document's `<li>` (row + its now-always-rendered-but-collapsed detail div) simply isn't rendered at all.
- No automated tests for these changes — pure CSS/JSX polish in React components, consistent with the rest of the dashboard (verified manually against a real `npm run dev`/production instance instead).

---

### Task 1: Create `ConfidenceBadge`

**Files:**
- Create: `components/dashboard/confidence-badge.tsx`

**Interfaces:**
- Produces: `ConfidenceBadge({ confidence }: { confidence: number })`, consumed by Task 2 (`DocumentDetailPanel`) and Task 3 (`DocumentList`). `confidence` is the raw 0-1 value (same as `IEPExtraction.confidence`) — the component itself handles the `* 100` display and rounding.

- [ ] **Step 1: Create `components/dashboard/confidence-badge.tsx`**

```tsx
const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.5;

function badgeColorClasses(confidence: number): string {
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return "bg-green-100 text-green-800";
  if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeColorClasses(confidence)}`}
    >
      {Math.round(confidence * 100)}%
    </span>
  );
}
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`. (This component isn't imported anywhere yet, so this just confirms it's syntactically/type valid on its own.)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/confidence-badge.tsx
git commit -m "Add ConfidenceBadge: color-coded confidence pill (green/amber/red)"
```

---

### Task 2: Spinner + warmer copy + `ConfidenceBadge` in `DocumentDetailPanel`

**Files:**
- Modify: `components/dashboard/document-detail-panel.tsx`

**Interfaces:**
- Consumes: `ConfidenceBadge` (Task 1).
- Produces: no change to `DocumentDetailPanel`'s own props (`{ document: DocumentRow }`).

- [ ] **Step 1: Replace `components/dashboard/document-detail-panel.tsx`**

```tsx
import type { DocumentRow } from "@/lib/supabase";
import { ConfidenceBadge } from "./confidence-badge";

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
      {document.status === "processing" && (
        <p className="flex items-center gap-2 text-slate-500">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          המסמך בדרך אלינו…
        </p>
      )}

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
              <dd>
                <ConfidenceBadge confidence={document.extraction.confidence} />
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
```

Note what changed from the previous version: the `processing` message gained a small CSS spinner (`animate-spin`, Tailwind's built-in keyframe) and warmer text ("המסמך בדרך אלינו…" instead of "המסמך בעיבוד…"); the confidence line at the bottom of the `<dl>` now renders `<ConfidenceBadge>` instead of a plain `{Math.round(...)}%`. Everything else (summary paragraph, field loop, goals/accommodations lists, the `failed` branch) is unchanged.

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/document-detail-panel.tsx
git commit -m "Add processing spinner, warmer copy, and ConfidenceBadge to DocumentDetailPanel"
```

---

### Task 3: Animated expand/collapse, row-level spinner/badge, empty states, hover transition in `DocumentList`

**Files:**
- Modify: `components/dashboard/document-list.tsx`

**Interfaces:**
- Consumes: `ConfidenceBadge` (Task 1), `DocumentDetailPanel` (Task 2 — same props as before).
- Produces: no change to `DocumentList`'s own props (`{ documents: DocumentRow[] }`).

- [ ] **Step 1: Replace `components/dashboard/document-list.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentRow } from "@/lib/supabase";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "@/lib/document-filters";
import { DocumentDetailPanel } from "./document-detail-panel";
import { DocumentFilters } from "./document-filters";
import { ConfidenceBadge } from "./confidence-badge";

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
  // from the previous DocumentTable/DocumentList.
  const hasProcessing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const intervalId = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(intervalId);
  }, [hasProcessing, router]);

  const filteredDocuments = applyFilters(documents, filters);

  if (documents.length === 0) {
    return (
      <div>
        <DocumentFilters value={filters} onChange={setFilters} />
        <p className="rounded border p-6 text-center text-slate-500">
          עדיין אין מסמכים — העלו את הראשון למעלה 👋
        </p>
      </div>
    );
  }

  return (
    <div>
      <DocumentFilters value={filters} onChange={setFilters} />
      {filteredDocuments.length === 0 ? (
        <p className="rounded border p-6 text-center text-slate-500">
          אין מסמכים התואמים את הסינון הנוכחי
        </p>
      ) : (
        <ul className="divide-y rounded border">
          {filteredDocuments.map((doc) => {
            const isSelected = doc.id === selectedId;
            return (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : doc.id)}
                  className="flex w-full items-center justify-between gap-4 p-3 text-right text-sm transition-colors hover:bg-slate-50"
                >
                  <span className="truncate">{doc.original_filename}</span>
                  <span className="flex shrink-0 items-center gap-2 text-slate-600">
                    {doc.status === "processing" && (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                    )}
                    <span>{STATUS_LABELS[doc.status]}</span>
                    {doc.extraction ? (
                      <ConfidenceBadge confidence={doc.extraction.confidence} />
                    ) : (
                      <span>—</span>
                    )}
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ${
                    isSelected ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div
                      className={`border-t bg-slate-50 p-3 transition-opacity duration-200 ${
                        isSelected ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <DocumentDetailPanel document={doc} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

Note the key structural change from the previous version: the expanded content div is now **always rendered** for every row (previously it was `{isSelected && <div>...</div>}`, conditionally absent from the DOM entirely). It's wrapped in a `grid` container whose `grid-template-rows` animates between `0fr` (collapsed) and `1fr` (expanded), with an inner `overflow-hidden` div clipping the content while collapsed, and the innermost div additionally transitions `opacity` between 0 and 100 so the reveal is a combined grow-and-fade rather than just a height change. This is what makes the expand/collapse *animatable* — Tailwind's `transition-*` utilities animate a CSS property changing on an element already in the DOM; they cannot animate an element's insertion/removal. The filtering behavior is unaffected: `.map()` still iterates over `filteredDocuments`, so a document filtered out of that array has its entire `<li>` (row + collapsed detail div) not rendered at all, same as before.

Also note: two empty states are handled distinctly. `documents.length === 0` (no documents exist at all) shows a friendly welcome message *outside* the filter/list area (filters would be pointless with nothing to filter, though they're still rendered so the UI doesn't jump around once the first document appears — the plan keeps `<DocumentFilters>` rendered in both empty-state branches for that reason). `filteredDocuments.length === 0` *within* the non-empty branch (i.e. documents exist, but the current filters hide all of them) shows a different message about the filter itself, since that's a different, actionable situation (relax the filter) rather than "upload your first document."

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3 (manual verification): Confirm the polish renders and animates correctly**

With `npm run dev` running (real Supabase data via `.dev.vars`/`.env.local`), open the dashboard. Expected:
- If there are zero documents: a friendly "עדיין אין מסמכים — העלו את הראשון למעלה 👋" message, not a blank box.
- With documents present: each row's confidence shows as a colored pill (green ≥80%, amber 50-79%, red <50%), not a plain percentage. A `processing` row shows a small spinning indicator next to its status label.
- Clicking a row expands it smoothly (a brief slide/height animation, not an instant snap) to show the summary and full details; clicking again collapses it the same way.
- Setting a filter that hides every document shows "אין מסמכים התואמים את הסינון הנוכחי" instead of an empty list with no explanation.
- A row hover has a smooth color transition, not an instant flash.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/document-list.tsx
git commit -m "Animate expand/collapse, add row-level spinner/badge and friendly empty states"
```

---

## Postscript

None of this requires a database migration or redeploy-time configuration change — it's a pure front-end change. After all 3 tasks are merged, redeploy (`npm run deploy`) to make it live, same as every prior change in this project.
