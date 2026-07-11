# Dashboard Warm Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, minimal look of the dashboard (from the previous interactivity-polish task, which the user rejected as looking bad live) with a warmer, card-based design, validated in advance via an interactive HTML mockup ([Artifact link, iterated 4 times to fix a badge-clipping bug and default to the empty state]) modeled after a reference project (`click-invoice`) the user pointed to. The mockup is the source of truth for exact visual details in this plan — colors, spacing, and structure below are direct ports of it into Tailwind/React.

**Architecture:** Add named warm-palette color tokens to `tailwind.config.ts` (`paper`, `ink`, `ink-muted`, `accent`, `accent-soft`) so components reference `bg-paper`/`text-ink`/`bg-accent` etc. instead of scattered arbitrary hex values. Restyle `document-list.tsx` so each document is its own elevated rounded card (not a flat bordered `<ul>` row). Rebuild `upload-form.tsx`'s markup as a dashed-border drop zone with a document icon and a real per-file progress bar, keeping 100% of its existing upload logic (the `Promise.all` loop calling `uploadDocument` per file) — only the JSX/styling changes. No dark mode: neither the existing app nor the `click-invoice` reference has one, so this stays light-only, consistent with both.

**Tech Stack:** Same as the rest of the project — Next.js, TypeScript, Tailwind CSS (extending the existing config, no new dependencies).

## Global Constraints

- No new npm dependencies.
- All existing behavior (polling, filtering, per-file independent upload progress, click-to-expand/collapse, empty-state logic) must be preserved exactly — only visual styling changes in this plan.
- The badge/box-sizing bug discovered in the mockup (`all: unset` silently resetting `box-sizing` to `content-box`) does NOT exist in the real components (they use Tailwind's Preflight reset + explicit utility classes, not a manual `all: unset`) — do not "fix" something that isn't broken here; this note exists so nobody re-introduces that exact anti-pattern while porting styles.
- No automated tests for these changes — pure visual/JSX polish, consistent with the rest of the dashboard.

---

### Task 1: Add warm-palette color tokens to Tailwind config and base layout

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: Tailwind utility classes `bg-paper`, `text-ink`, `text-ink-muted`, `bg-accent`/`text-accent`/`border-accent`, `bg-accent-soft` — consumed by Tasks 2-4.

- [ ] **Step 1: Extend `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f7f5f1",
        ink: "#2b2622",
        "ink-muted": "#6b6259",
        accent: {
          DEFAULT: "#3d6b66",
          soft: "#e4eeec",
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

(Note: the existing `content` array only globbed `./app/**/*.{ts,tsx}` — components under `./components/` were being picked up incidentally via other means or this was already a latent gap. Adding `./components/**/*.{ts,tsx}` explicitly here is a correctness fix, not scope creep: without it, Tailwind's JIT compiler has no guarantee it scans component files for class usage.)

- [ ] **Step 2: Update `app/layout.tsx`'s body background**

Change:
```tsx
<body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
```
to:
```tsx
<body className="min-h-screen bg-paper text-ink">{children}</body>
```

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/layout.tsx
git commit -m "Add warm-palette color tokens (paper/ink/accent) to Tailwind config"
```

---

### Task 2: Card-based `DocumentList`

**Files:**
- Modify: `components/dashboard/document-list.tsx`

**Interfaces:**
- Consumes: `bg-paper`/`text-ink`/etc. (Task 1), `ConfidenceBadge`, `DocumentDetailPanel` (unchanged props from both).
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
  // from every previous version of this component.
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
        <div className="rounded-2xl border border-black/5 bg-white p-12 text-center shadow-sm">
          <span className="mb-3 block text-4xl">👋</span>
          <p className="text-ink-muted">עדיין אין מסמכים — העלו את הראשון למעלה</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <DocumentFilters value={filters} onChange={setFilters} />
      {filteredDocuments.length === 0 ? (
        <div className="rounded-2xl border border-black/5 bg-white p-12 text-center shadow-sm">
          <p className="text-ink-muted">אין מסמכים התואמים את הסינון הנוכחי</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredDocuments.map((doc) => {
            const isSelected = doc.id === selectedId;
            return (
              <div
                key={doc.id}
                className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : doc.id)}
                  className="flex w-full items-center justify-between gap-4 p-4 text-right text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                    {doc.original_filename}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-ink-muted">
                    {doc.status === "processing" && (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-black/10 border-t-accent" />
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
                      className={`border-t border-black/5 p-4 pt-4 transition-opacity duration-200 ${
                        isSelected ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <DocumentDetailPanel document={doc} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Note what changed from the previous version: each document is now its own `rounded-2xl border ... shadow-sm` card (with `hover:shadow-md` for a subtle lift on hover) instead of a row inside one shared bordered `<ul>`/`divide-y` list. The row button gained `min-w-0 flex-1` on the filename span — this is the fix the mockup surfaced (a flex child with truncating text needs `min-width: 0` to actually shrink instead of overflowing its container) — applied here even though this real component didn't use `all: unset` and so didn't have the mockup's exact box-sizing bug; `min-w-0` is still the correct, standard fix for exactly this "long filename could push the badge out" class of layout bug, and is cheap insurance. Confidence badge and spinner colors now use `border-t-accent` instead of `border-t-slate-600`. The expand/collapse animation (grid-template-rows + opacity) is unchanged from the previous interactivity-polish task.

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/document-list.tsx
git commit -m "Redesign DocumentList as individually elevated cards, matching the validated mockup"
```

---

### Task 3: Drop-zone upload form with per-file progress bars

**Files:**
- Modify: `components/dashboard/upload-form.tsx`

**Interfaces:**
- Consumes: `uploadDocument` (`app/actions.ts`) — **unchanged signature**, still called once per file.
- Produces: no change to `UploadForm`'s own props (none).

- [ ] **Step 1: Replace `components/dashboard/upload-form.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/app/actions";

interface FileProgress {
  fileName: string;
  percent: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<FileProgress[]>([]);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    setUploads(files.map((file) => ({ fileName: file.name, percent: 0, status: "uploading" })));

    await Promise.all(
      files.map(async (file, index) => {
        // Server Actions don't expose byte-level upload progress, so this
        // is an honest, simulated fill (same approach the click-invoice
        // reference project uses) rather than a fabricated precise
        // percentage - it communicates "this is in flight," not a measured fact.
        const tick = setInterval(() => {
          setUploads((prev) =>
            prev.map((u, i) => (i === index && u.percent < 90 ? { ...u, percent: u.percent + 15 } : u))
          );
        }, 150);

        const singleFileFormData = new FormData();
        singleFileFormData.set("file", file);
        try {
          const result = await uploadDocument(singleFileFormData);
          clearInterval(tick);
          setUploads((prev) =>
            prev.map((u, i) =>
              i === index
                ? result.success
                  ? { ...u, percent: 100, status: "done" }
                  : { ...u, percent: 100, status: "error", error: result.error }
                : u
            )
          );
        } catch (error) {
          clearInterval(tick);
          const message = error instanceof Error ? error.message : String(error);
          setUploads((prev) =>
            prev.map((u, i) => (i === index ? { ...u, percent: 100, status: "error", error: message } : u))
          );
        } finally {
          router.refresh();
        }
      })
    );

    formRef.current?.reset();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <form
      ref={formRef}
      className="mb-6"
      onSubmit={(e) => e.preventDefault()}
    >
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-accent bg-accent-soft" : "border-black/10 bg-white hover:border-accent hover:bg-accent-soft"
        }`}
      >
        <span className="mb-2 block text-4xl">📄</span>
        <p className="font-semibold text-ink">גררו קבצי PDF לכאן</p>
        <p className="text-sm text-ink-muted">או לחצו לבחירה — אפשר להעלות כמה קבצים בבת אחת</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {uploads.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {uploads.map((upload, i) => (
            <div key={i}>
              <div className="mb-1 flex justify-between text-xs text-ink-muted">
                <span>{upload.fileName}</span>
                <span>{upload.status === "error" ? upload.error : `${upload.percent}%`}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    upload.status === "error" ? "bg-red-500" : "bg-accent"
                  }`}
                  style={{ width: `${upload.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
```

Note what changed from the previous version: the plain `<input type="file">` + submit button is replaced with a dashed-border drop zone (📄 icon, click-to-browse via a hidden file input, drag-and-drop via `onDragOver`/`onDrop`), and the countdown text ("מעלה… (N נותרו)") is replaced with a per-file progress bar that fills to 100% on completion (success or error). The underlying upload mechanism is unchanged: `uploadDocument` (the Server Action) is still called once per file via `Promise.all`, `router.refresh()` still fires per-file in a `finally` block as soon as that file's own call settles, and the form still has no `action={...}` form-action wiring — this version calls `uploadFiles` directly from both the file-input `onChange` and the drop handler, since a drop event doesn't naturally produce a `FormData` submission the way the old `<form action={...}>` pattern did.

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3 (manual verification): Confirm the drop zone and progress bars work**

With `npm run dev` running, open the dashboard. Expected:
- The upload area is a dashed-border zone with a 📄 icon and Hebrew instructions, not a plain file-picker button.
- Clicking it opens the file picker; selecting one or more PDFs starts a progress bar per file that fills smoothly and completes (green fill reaching 100%) or shows red + an error message if a file fails.
- Dragging a file over the zone highlights it (border/background change); dropping uploads it the same way as picking it via click.
- Each file's row still appears in the document list on its own timeline as its own upload settles (unchanged from the prior task).

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/upload-form.tsx
git commit -m "Redesign upload form as a drag-and-drop zone with per-file progress bars"
```

---

## Postscript

After all 3 tasks are merged, redeploy (`npm run deploy`) to make it live. This plan supersedes the previous "interactivity polish" plan's visual specifics (color palette, card treatment) while keeping its underlying mechanics (spinner, animated expand/collapse, empty state, ConfidenceBadge) intact — no revert of that work is needed, only these visual changes on top of it.
