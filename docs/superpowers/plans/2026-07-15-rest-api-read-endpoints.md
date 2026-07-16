# REST API Read Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two read-only REST endpoints — `GET /api/documents` (list) and `GET /api/documents/:id` (single) — closing the last open checklist item in `README.md`/`SPEC.md` ("REST API עם API Key Auth").

**Architecture:** Both routes reuse the existing `DocumentRow` shape and Supabase query logic already powering the dashboard (`lib/supabase.ts`'s `listDocumentsWithExtractions`), plus a new single-row variant, `getDocumentWithExtraction`. The `X-API-Key` check currently inlined in `app/api/upload/route.ts` is extracted into a shared `lib/require-api-key.ts` helper, since it will now be needed identically in three routes. No new dependencies, no schema changes, no pagination/filtering (per the design spec's explicit scope decision).

**Tech Stack:** Next.js App Router (Route Handlers), TypeScript, `@supabase/supabase-js`, Vitest — same stack as the rest of the project.

## Global Constraints

- `X-API-Key` header must match `env.DOCUMENTS_API_KEY` exactly; an empty-string `DOCUMENTS_API_KEY` must fail closed (401), never bypass auth — same rule already enforced in `/api/upload`, now centralized in `requireApiKey`.
- `GET /api/documents` returns the full list, unfiltered, no pagination — per the design spec's explicit decision (`docs/superpowers/specs/2026-07-15-rest-api-read-endpoints-design.md`), not a placeholder to fill in later.
- `GET /api/documents/:id` returns `404` for an unknown id and `503` for a Supabase/service failure — these are distinct failure modes and must not collapse into one status code.
- Response bodies are the existing `DocumentRow` type from `lib/supabase.ts` verbatim — no new DTO, no field renaming.
- Never query or expose `student_identity_map` from these routes — `extractions.student_id` (already redacted/pseudonymous) is the only identifier surfaced, unchanged from today.
- No automated tests for the route handlers themselves (`route.ts` files) — consistent with `/api/upload`, which also has none; verify those manually via `npm run preview` + `curl`. Pure logic (`requireApiKey`, the row-mapping function) does get unit tests, same as the rest of `lib/`.

---

### Task 1: Extract `requireApiKey` and refactor `/api/upload` to use it

**Files:**
- Create: `lib/require-api-key.ts`
- Test: `lib/require-api-key.test.ts`
- Modify: `app/api/upload/route.ts`

**Interfaces:**
- Produces: `requireApiKey(request: Request, env: { DOCUMENTS_API_KEY: string }): Response | null` — `null` means "authorized, proceed"; a `Response` means "return this immediately." Consumed by Task 3 and Task 4.

- [ ] **Step 1: Write the failing test — `lib/require-api-key.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { requireApiKey } from "./require-api-key";

function makeRequest(headerValue?: string): Request {
  const headers = new Headers();
  if (headerValue !== undefined) headers.set("X-API-Key", headerValue);
  return new Request("https://example.com/api/documents", { headers });
}

describe("requireApiKey", () => {
  it("returns null when the header matches the configured key", () => {
    const result = requireApiKey(makeRequest("secret123"), { DOCUMENTS_API_KEY: "secret123" });
    expect(result).toBeNull();
  });

  it("returns a 401 Response when the header is missing", async () => {
    const result = requireApiKey(makeRequest(), { DOCUMENTS_API_KEY: "secret123" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    expect(await result!.json()).toEqual({ error: "unauthorized" });
  });

  it("returns a 401 Response when the header doesn't match", () => {
    const result = requireApiKey(makeRequest("wrong"), { DOCUMENTS_API_KEY: "secret123" });
    expect(result!.status).toBe(401);
  });

  it("returns a 401 Response (not a bypass) when DOCUMENTS_API_KEY is an empty string", () => {
    const result = requireApiKey(makeRequest(""), { DOCUMENTS_API_KEY: "" });
    expect(result!.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/require-api-key.test.ts`
Expected: FAIL with "Cannot find module './require-api-key'" (or similar — the file doesn't exist yet).

- [ ] **Step 3: Implement `lib/require-api-key.ts`**

```ts
export function requireApiKey(
  request: Request,
  env: { DOCUMENTS_API_KEY: string }
): Response | null {
  // A misconfigured empty-string DOCUMENTS_API_KEY must not make an
  // equally-empty X-API-Key header pass the `!==` check below - fail
  // closed instead of silently bypassing auth.
  if (!env.DOCUMENTS_API_KEY || request.headers.get("X-API-Key") !== env.DOCUMENTS_API_KEY) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/require-api-key.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Refactor `app/api/upload/route.ts` to use `requireApiKey`**

Replace the inlined auth block (the `if (!env.DOCUMENTS_API_KEY || ...)` check and its preceding comment) with:

```ts
import { requireApiKey } from "@/lib/require-api-key";
```

added to the existing import block, and in `POST`, replace the old inline check with:

```ts
  const authError = requireApiKey(request, env);
  if (authError) return authError;
```

placed where the old inline check was (right after `const { env, ctx } = getCloudflareContext();`).

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: All existing suites still pass (no test exercises the inline auth block directly, so this is a regression check, not new coverage).

- [ ] **Step 7: Commit**

```bash
git add lib/require-api-key.ts lib/require-api-key.test.ts app/api/upload/route.ts
git commit -m "Extract requireApiKey auth helper from /api/upload"
```

---

### Task 2: Add `getDocumentWithExtraction` and a shared row-mapping helper to `lib/supabase.ts`

**Files:**
- Modify: `lib/supabase.ts`
- Test: `lib/supabase.test.ts` (new)

**Interfaces:**
- Consumes: existing `DocumentRow` and `IEPExtraction` types already in `lib/supabase.ts`.
- Produces: `mapRowToDocument(row: RawDocumentRow): DocumentRow` (exported, pure — no Supabase call) and `getDocumentWithExtraction(client: SupabaseClient, id: string): Promise<DocumentRow | null>`, consumed by Task 4. `null` return means "no document with this id" (→ 404 in the route); a thrown error means "Supabase/service failure" (→ 503 in the route).

- [ ] **Step 1: Write the failing test — `lib/supabase.test.ts`**

This tests only the pure mapping function — no network, no Supabase client needed:

```ts
import { describe, expect, it } from "vitest";
import { mapRowToDocument } from "./supabase";

describe("mapRowToDocument", () => {
  it("maps a row with one embedded extraction (array form, as PostgREST returns it)", () => {
    const row = {
      id: "doc-1",
      storage_path: "docs/doc-1.pdf",
      original_filename: "iep.pdf",
      status: "done" as const,
      error_message: null,
      uploaded_at: "2026-07-15T10:00:00.000Z",
      extractions: [
        {
          student_id: "STU-0001",
          school_year: 'תשפ"ז',
          disability_category: "לקות למידה",
          placement_type: "הכלה מלאה",
          weekly_support_hours: 4,
          goals: ["שיפור קריאה"],
          review_date: "2027-06-01",
          accommodations: ["זמן מוארך"],
          confidence: 0.9,
          summary: "סיכום קצר",
        },
      ],
    };

    expect(mapRowToDocument(row)).toEqual({
      id: "doc-1",
      storage_path: "docs/doc-1.pdf",
      original_filename: "iep.pdf",
      status: "done",
      error_message: null,
      uploaded_at: "2026-07-15T10:00:00.000Z",
      extraction: {
        student_id: "STU-0001",
        school_year: 'תשפ"ז',
        disability_category: "לקות למידה",
        placement_type: "הכלה מלאה",
        weekly_support_hours: 4,
        goals: ["שיפור קריאה"],
        review_date: "2027-06-01",
        accommodations: ["זמן מוארך"],
        confidence: 0.9,
        summary: "סיכום קצר",
      },
    });
  });

  it("maps a row with no extraction (empty array) to extraction: null", () => {
    const row = {
      id: "doc-2",
      storage_path: "docs/doc-2.pdf",
      original_filename: "pending.pdf",
      status: "processing" as const,
      error_message: null,
      uploaded_at: "2026-07-15T11:00:00.000Z",
      extractions: [],
    };

    expect(mapRowToDocument(row).extraction).toBeNull();
  });

  it("maps a failed document, carrying its error_message through", () => {
    const row = {
      id: "doc-3",
      storage_path: "docs/doc-3.pdf",
      original_filename: "bad-scan.pdf",
      status: "failed" as const,
      error_message: "extracted 7 characters - likely an image-only scan",
      uploaded_at: "2026-07-15T12:00:00.000Z",
      extractions: [],
    };

    const result = mapRowToDocument(row);
    expect(result.status).toBe("failed");
    expect(result.error_message).toBe("extracted 7 characters - likely an image-only scan");
    expect(result.extraction).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/supabase.test.ts`
Expected: FAIL with "mapRowToDocument is not exported" (or similar — it doesn't exist yet).

- [ ] **Step 3: Implement — refactor `lib/supabase.ts`**

Add these two interfaces above `listDocumentsWithExtractions` (after the existing `DocumentRow` interface):

```ts
interface RawExtractionRow {
  student_id: string | null;
  school_year: string;
  disability_category: string | null;
  placement_type: string;
  weekly_support_hours: number | null;
  goals: string[];
  review_date: string | null;
  accommodations: string[];
  confidence: number;
  summary: string | null;
}

interface RawDocumentRow {
  id: string;
  storage_path: string;
  original_filename: string;
  status: "processing" | "done" | "failed";
  error_message: string | null;
  uploaded_at: string;
  extractions: RawExtractionRow[] | RawExtractionRow | null;
}
```

Then replace the existing `listDocumentsWithExtractions` function body with a call to a new shared mapper, and add `getDocumentWithExtraction`:

```ts
// `extractions` is embedded via Supabase's relationship detection (the FK
// extractions.document_id -> documents.id in supabase/schema.sql). Since
// that FK isn't marked UNIQUE, PostgREST returns it as an array even
// though there's at most one extraction per document in practice - take
// the first element explicitly rather than relying on any single-object
// embedding syntax.
export function mapRowToDocument(row: RawDocumentRow): DocumentRow {
  const rawExtraction = Array.isArray(row.extractions) ? row.extractions[0] ?? null : row.extractions;
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

  return {
    id: row.id,
    storage_path: row.storage_path,
    original_filename: row.original_filename,
    status: row.status,
    error_message: row.error_message,
    uploaded_at: row.uploaded_at,
    extraction,
  };
}

export async function listDocumentsWithExtractions(client: SupabaseClient): Promise<DocumentRow[]> {
  const { data, error } = await client
    .from("documents")
    .select("id, storage_path, original_filename, status, error_message, uploaded_at, extractions(*)")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => mapRowToDocument(row));
}

export async function getDocumentWithExtraction(
  client: SupabaseClient,
  id: string
): Promise<DocumentRow | null> {
  const { data, error } = await client
    .from("documents")
    .select("id, storage_path, original_filename, status, error_message, uploaded_at, extractions(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapRowToDocument(data as any);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/supabase.test.ts`
Expected: PASS (3/3 tests).

- [ ] **Step 5: Run the full test suite to confirm the `listDocumentsWithExtractions` refactor didn't regress anything**

Run: `npm test`
Expected: All existing suites still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase.ts lib/supabase.test.ts
git commit -m "Add getDocumentWithExtraction and shared row-mapping to lib/supabase.ts"
```

---

### Task 3: Add `GET /api/documents`

**Files:**
- Create: `app/api/documents/route.ts`

**Interfaces:**
- Consumes: `requireApiKey` (Task 1), `listDocumentsWithExtractions` (existing, unchanged signature).

- [ ] **Step 1: Implement `app/api/documents/route.ts`**

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { requireApiKey } from "@/lib/require-api-key";
import { createSupabaseClient, listDocumentsWithExtractions } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";

export async function GET(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();

  const authError = requireApiKey(request, env);
  if (authError) return authError;

  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const documents = await listDocumentsWithExtractions(supabase);
    return Response.json(documents);
  } catch (error) {
    return Response.json({ error: `failed to list documents: ${errorMessage(error)}` }, { status: 503 });
  }
}
```

- [ ] **Step 2: Verify manually against a local preview**

Run: `npm run preview` (in one terminal, leave it running)

Then, in another terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/api/documents
```
Expected: `401` (no `X-API-Key` header).

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "X-API-Key: wrong" http://localhost:8787/api/documents
```
Expected: `401`.

```bash
curl -s -H "X-API-Key: $DOCUMENTS_API_KEY" http://localhost:8787/api/documents | head -c 200
```
(Using the real key from your local `.env.local`.) Expected: `200` with a JSON array (empty `[]` if no documents have been uploaded locally yet).

- [ ] **Step 3: Commit**

```bash
git add app/api/documents/route.ts
git commit -m "Add GET /api/documents"
```

---

### Task 4: Add `GET /api/documents/:id`, update checklists

**Files:**
- Create: `app/api/documents/[id]/route.ts`
- Modify: `README.md`
- Modify: `SPEC.md`

**Interfaces:**
- Consumes: `requireApiKey` (Task 1), `getDocumentWithExtraction` (Task 2).

- [ ] **Step 1: Implement `app/api/documents/[id]/route.ts`**

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { requireApiKey } from "@/lib/require-api-key";
import { createSupabaseClient, getDocumentWithExtraction } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { env } = getCloudflareContext();

  const authError = requireApiKey(request, env);
  if (authError) return authError;

  const { id } = await context.params;
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const document = await getDocumentWithExtraction(supabase, id);
    if (!document) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json(document);
  } catch (error) {
    return Response.json({ error: `failed to fetch document: ${errorMessage(error)}` }, { status: 503 });
  }
}
```

- [ ] **Step 2: Verify manually against a local preview**

With `npm run preview` still running from Task 3:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "X-API-Key: $DOCUMENTS_API_KEY" http://localhost:8787/api/documents/00000000-0000-0000-0000-000000000000
```
Expected: `404` (well-formed UUID, no matching row).

```bash
curl -s -H "X-API-Key: $DOCUMENTS_API_KEY" http://localhost:8787/api/documents/<a-real-document-id-from-the-list-endpoint>
```
Expected: `200` with a single JSON object (not an array).

- [ ] **Step 3: Update `README.md`**

In the status checklist, change:

```markdown
- [ ] REST API read endpoints (`GET /api/documents`, `GET /api/documents/{id}`)
```

to:

```markdown
- [x] REST API read endpoints (`GET /api/documents`, `GET /api/documents/{id}`)
```

- [ ] **Step 4: Update `SPEC.md`**

In the `## Checklist` section, change:

```markdown
- [ ] REST API עם API Key Auth
```

to:

```markdown
- [x] REST API עם API Key Auth
```

- [ ] **Step 5: Commit**

```bash
git add app/api/documents/[id]/route.ts README.md SPEC.md
git commit -m "Add GET /api/documents/:id, check off REST API checklist item"
```
