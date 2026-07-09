# Next.js Upload Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js app and build `POST /api/upload`: store a PDF in R2, kick off background extraction (redact → Gemini → validate → Supabase), and fire an HMAC-signed webhook on completion — all running inside one Cloudflare Worker, deployable via `@cloudflare/next-on-pages`.

**Architecture:** A TypeScript port of the existing Python reference implementation (`iep_schema.py`, `redaction.py`), split into small, independently-testable `lib/` modules (redaction, schema validation, PDF text extraction, webhook signing, Gemini call, orchestration) wired together by a thin `app/api/upload/route.ts` that only touches Cloudflare-specific APIs (R2 binding, `waitUntil`). The route itself can't be unit-tested in this sandbox (no live R2/Supabase/Gemini credentials here) — it's verified manually via `wrangler pages dev` + `curl` once real credentials exist.

**Tech Stack:** Next.js 15 (App Router, TypeScript, Tailwind), Zod, `@google/genai` (Gemini Developer API), `@supabase/supabase-js`, `unpdf`, Vitest, `@cloudflare/next-on-pages`, Wrangler.

## Global Constraints

- Runtime is the Cloudflare Workers edge runtime (`export const runtime = "edge"` on the route) — no Node-only APIs beyond what `nodejs_compat` provides.
- AI provider is the **Gemini Developer API** (`GEMINI_API_KEY`, model `gemini-2.5-flash`) — **not** Vertex AI (see `CLAUDE.md`).
- R2 is accessed via a native Wrangler binding named `DOCS_BUCKET` — never S3-style access keys.
- Redaction MUST run on extracted document text before any Gemini call (`SPEC.md`, "דרישות אבטחה ופרטיות").
- `student_id` must never be a value that looks like a real name — reject if it contains a space and doesn't start with `STU` (ported from `iep_schema.py`'s `reject_real_names`).
- `review_date` must accept both ISO (`YYYY-MM-DD`) and Israeli `DD/MM/YYYY`/`DD-MM-YYYY` input, normalized to an ISO date **string** (not a `Date` object — avoids timezone bugs when round-tripping to Postgres `date`).
- `placement_type` is restricted to the 4 Hebrew values in `supabase/schema.sql`'s check constraint: `הכלה מלאה`, `הכלה חלקית`, `כיתה מיוחדת בבי"ס רגיל`, `חינוך מיוחד נפרד`.
- `confidence` is required, range `[0, 1]`. `weekly_support_hours` range `[0, 40]`; `0` is normalized to `null` (ported from `zero_becomes_none`).
- Outgoing webhook: HMAC-SHA256 over the raw JSON body, hex-encoded, header `X-Webhook-Signature`. Skip silently (no throw) if `WEBHOOK_URL` is unset.
- `documents.status` is one of `processing | done | failed`; set `error_message` on failure.
- Async processing uses `context.waitUntil` inside the same Worker invocation that handled the upload request — no queue, no second service.
- `iep_schema.py` / `redaction.py` are not touched by this plan — they stay as the local reference implementation.

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Modify: `.gitignore` (add Node/Next.js/Cloudflare build artifacts)

**Interfaces:**
- Produces: a working `npm run build` — every later task's tooling (Vitest, TypeScript path alias `@/*`) depends on `package.json`/`tsconfig.json` existing.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "special-ed-doc-intelligence",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "pages:build": "npx @cloudflare/next-on-pages",
    "preview": "npm run pages:build && wrangler pages dev .vercel/output/static",
    "deploy": "npm run pages:build && wrangler pages deploy .vercel/output/static",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@google/genai": "^0.3.0",
    "@supabase/supabase-js": "^2.45.0",
    "zod": "^3.23.0",
    "unpdf": "^0.12.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@cloudflare/next-on-pages": "^1.13.0",
    "@cloudflare/workers-types": "^4.20240925.0",
    "wrangler": "^3.80.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Write `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Write `postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Write `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Write `app/layout.tsx`**

```tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Document Intelligence Service",
  description: "IEP / ועדת שילוב document extraction",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Write `app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">Document Intelligence Service</h1>
      <p className="text-slate-600">Dashboard UI not built yet — see README.md Status.</p>
    </main>
  );
}
```

- [ ] **Step 9: Add build artifacts to `.gitignore`**

Append to the existing `.gitignore` (it currently only covers Python):

```
# Node / Next.js
node_modules/
.next/
.vercel/
next-env.d.ts

# Wrangler
.wrangler/
```

- [ ] **Step 10: Install dependencies and verify the build**

Run: `npm install`
Expected: installs without errors (network required).

Run: `npm run build`
Expected: `Compiled successfully` — Next.js produces a `.next/` build output for the two placeholder pages.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.mjs app/layout.tsx app/page.tsx app/globals.css .gitignore
git commit -m "Scaffold Next.js app (App Router, TypeScript, Tailwind)"
```

---

### Task 2: Add Vitest and port `redaction.py` to `lib/redact.ts`

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/redact.ts`
- Test: `lib/redact.test.ts`

**Interfaces:**
- Produces: `redactText(text: string): RedactionResult` and `summarizeRedaction(result: RedactionResult): string`, where `RedactionResult = { redactedText: string; matches: RedactionMatch[] }` and `RedactionMatch = { kind: "israeli_id" | "phone" | "email" | "labeled_name" | "free_name"; original: string }`. Consumed by `app/api/upload/route.ts` (Task 8) via `redactText`.

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 2: Write the failing test — `lib/redact.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { redactText, summarizeRedaction } from "./redact";

describe("redactText", () => {
  it("redacts a labeled student name", () => {
    const result = redactText("שם התלמיד/ה: נועם כהן, פרטים נוספים בהמשך.");
    expect(result.redactedText).toContain("שם התלמיד/ה: [REDACTED_NAME]");
    expect(result.redactedText).not.toContain("נועם כהן");
    expect(result.matches).toEqual([{ kind: "labeled_name", original: "נועם כהן" }]);
  });

  it("redacts a valid Israeli ID with ת.ז. context", () => {
    const result = redactText("ת.ז. 123456782 של ההורה");
    expect(result.redactedText).toBe("ת.ז. [REDACTED_ID] של ההורה");
    expect(result.matches).toEqual([{ kind: "israeli_id", original: "123456782" }]);
  });

  it("does not redact a bare 9-digit number that fails the Israeli ID checksum", () => {
    const result = redactText("מספר סמל מוסד: 440495 ומספר נוסף 111111111");
    expect(result.redactedText).toContain("111111111");
    expect(result.matches).toEqual([]);
  });

  it("redacts a phone number", () => {
    const result = redactText("ניתן להתקשר ל-050-1234567 בכל עת.");
    expect(result.redactedText).toBe("ניתן להתקשר ל-[REDACTED_PHONE] בכל עת.");
    expect(result.matches).toEqual([{ kind: "phone", original: "050-1234567" }]);
  });

  it("redacts an email address", () => {
    const result = redactText("ניתן לפנות באימייל parent@example.com לפרטים.");
    expect(result.redactedText).toBe("ניתן לפנות באימייל [REDACTED_EMAIL] לפרטים.");
    expect(result.matches).toEqual([{ kind: "email", original: "parent@example.com" }]);
  });

  it("fully redacts a hyphenated local part and a multi-label domain", () => {
    const result = redactText("אפשר גם באימייל cohen-noa@school.education.co.il לתיאום.");
    expect(result.redactedText).toBe("אפשר גם באימייל [REDACTED_EMAIL] לתיאום.");
    expect(result.matches).toEqual([
      { kind: "email", original: "cohen-noa@school.education.co.il" },
    ]);
  });

  it("redacts an unlabeled free-text name gated on a known first name", () => {
    const result = redactText("התלמיד איתי לוי נמצא באותה כיתה.");
    expect(result.redactedText).toBe("התלמיד [REDACTED_NAME] נמצא באותה כיתה.");
    expect(result.matches).toEqual([{ kind: "free_name", original: "איתי לוי" }]);
  });

  it("matches the full combined sample from redaction.py's __main__ block", () => {
    const sample =
      "שם התלמיד/ה: נועם כהן, ת.ז. 123456782. " +
      "ניתן ליצור קשר עם ההורים בטלפון 050-1234567 או במייל parent@example.com. " +
      "התלמיד איתי לוי נמצא באותה כיתה. מספר סמל מוסד: 440495.";
    const result = redactText(sample);
    expect(result.redactedText).toBe(
      "שם התלמיד/ה: [REDACTED_NAME], ת.ז. [REDACTED_ID]. " +
        "ניתן ליצור קשר עם ההורים בטלפון [REDACTED_PHONE] או במייל [REDACTED_EMAIL]. " +
        "התלמיד [REDACTED_NAME] נמצא באותה כיתה. מספר סמל מוסד: 440495."
    );
    expect(summarizeRedaction(result)).toBe(
      "labeled_name=1, israeli_id=1, phone=1, email=1, free_name=1"
    );
  });

  it("reports 'no PII detected' when nothing matches", () => {
    const result = redactText("מסמך ללא מידע מזהה כלל.");
    expect(summarizeRedaction(result)).toBe("no PII detected");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- lib/redact.test.ts`
Expected: FAIL — `Cannot find module './redact'` (file doesn't exist yet).

- [ ] **Step 4: Write `lib/redact.ts`**

Direct TypeScript port of `redaction.py`, same pattern order and checksum logic:

```ts
export type RedactionKind = "israeli_id" | "phone" | "email" | "labeled_name" | "free_name";

export interface RedactionMatch {
  kind: RedactionKind;
  original: string;
}

export interface RedactionResult {
  redactedText: string;
  matches: RedactionMatch[];
}

export function summarizeRedaction(result: RedactionResult): string {
  const counts = new Map<string, number>();
  for (const match of result.matches) {
    counts.set(match.kind, (counts.get(match.kind) ?? 0) + 1);
  }
  if (counts.size === 0) return "no PII detected";
  return Array.from(counts.entries())
    .map(([kind, count]) => `${kind}=${count}`)
    .join(", ");
}

const ISRAELI_ID_CONTEXT_RE = /(ת\.?\s*ז\.?|תעודת\s+זהות)\s*[:\-]?\s*(\d[\d\-\s]{7,10}\d)/g;
const BARE_9_DIGIT_RE = /(?<!\d)(\d{9})(?!\d)/g;
const PHONE_RE = /(?<!\d)(0(?:5\d|[23489]|7\d)[\-\s]?\d{3}[\-\s]?\d{4})(?!\d)/g;
// Deliberately not byte-parity with redaction.py's EMAIL_RE: Python's
// Unicode-aware \w incidentally swallows an adjacent Hebrew letter/hyphen
// and a trailing sentence period. JS's ASCII \w can't (and shouldn't try
// to) replicate that — this regex instead fully captures real emails
// (hyphenated local parts, multi-label domains like .co.il) without
// bleeding into surrounding punctuation.
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const NAME_LABEL_RE =
  /(שם\s+ה?(?:תלמיד|הורה|מורה|יועצת|יועץ|מחנך|מחנכת|נציג|נציגת)(?:\/ה)?\s*[:\-]?\s*)([א-ת]+(?:\s+[א-ת]{2,})?)/g;

const COMMON_FIRST_NAMES = [
  "נועם", "איתי", "יעל", "מאיה", "דניאל", "אביגיל", "עומר", "שירה",
  "ליאור", "רותם", "תומר", "הדר", "יהונתן", "נועה", "אריאל", "עדן",
  "יוסי", "משה", "דוד", "שרה", "רחל", "מרים", "אברהם", "יצחק", "רבקה",
];

function buildFreeNameRe(): RegExp {
  const namesPattern = [...COMMON_FIRST_NAMES].sort((a, b) => b.length - a.length).join("|");
  return new RegExp(`(?:${namesPattern})\\s+[\\u05D0-\\u05EA]{2,}`, "g");
}

const FREE_NAME_RE = buildFreeNameRe();

function isValidIsraeliId(digits: string): boolean {
  const trimmed = digits.trim();
  if (trimmed.length !== 9 || !/^\d{9}$/.test(trimmed)) return false;
  let total = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const d = Number(trimmed[i]) * (i % 2 === 0 ? 1 : 2);
    total += d > 9 ? d - 9 : d;
  }
  return total % 10 === 0;
}

export function redactText(text: string): RedactionResult {
  const matches: RedactionMatch[] = [];
  let out = text;

  // 1. Labeled names (most specific) — replace only the name (group 2), keep the label.
  out = out.replace(NAME_LABEL_RE, (_full, label: string, name: string) => {
    matches.push({ kind: "labeled_name", original: name });
    return `${label}[REDACTED_NAME]`;
  });

  // 2. ID with ת.ז./תעודת זהות context.
  out = out.replace(ISRAELI_ID_CONTEXT_RE, (_full, label: string, id: string) => {
    matches.push({ kind: "israeli_id", original: id });
    return `${label} [REDACTED_ID]`;
  });

  // 3. Bare 9-digit numbers — only redact if the Israeli ID checksum is valid.
  out = out.replace(BARE_9_DIGIT_RE, (full, digits: string) => {
    if (isValidIsraeliId(digits)) {
      matches.push({ kind: "israeli_id", original: digits });
      return "[REDACTED_ID]";
    }
    return full;
  });

  // 4. Phone numbers.
  out = out.replace(PHONE_RE, (_full, phone: string) => {
    matches.push({ kind: "phone", original: phone });
    return "[REDACTED_PHONE]";
  });

  // 5. Email addresses.
  out = out.replace(EMAIL_RE, (full: string) => {
    matches.push({ kind: "email", original: full });
    return "[REDACTED_EMAIL]";
  });

  // 6. Unlabeled free-text names (most heuristic — first-name gated).
  out = out.replace(FREE_NAME_RE, (full: string) => {
    matches.push({ kind: "free_name", original: full });
    return "[REDACTED_NAME]";
  });

  return { redactedText: out, matches };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- lib/redact.test.ts`
Expected: all 8 tests PASS.

If a test fails on the combined-sample assertion, print `result.redactedText` and `result.matches` and compare byte-for-byte against `redaction.py`'s own `__main__` output (run `python redaction.py` to regenerate the reference output) — the regex order and group-capture semantics must match exactly.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts lib/redact.ts lib/redact.test.ts
git commit -m "Port redaction.py to lib/redact.ts with tests"
```

---

### Task 3: Port `iep_schema.py`'s schema and validators to `lib/extraction-schema.ts`

**Files:**
- Create: `lib/extraction-schema.ts`
- Test: `lib/extraction-schema.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `IEPExtractionSchema` (a Zod schema) and `type IEPExtraction = z.infer<typeof IEPExtractionSchema>`. Consumed by `lib/gemini.ts` (Task 6) and `lib/process-document.ts` (Task 7).

- [ ] **Step 1: Write the failing test — `lib/extraction-schema.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { IEPExtractionSchema } from "./extraction-schema";

function validExtraction(overrides: Record<string, unknown> = {}) {
  return {
    student_id: "STU-0001",
    school_year: 'תשפ"ח',
    placement_type: "הכלה חלקית",
    review_date: "14/03/2028",
    confidence: 0.9,
    ...overrides,
  };
}

describe("IEPExtractionSchema", () => {
  it("normalizes a DD/MM/YYYY review_date to ISO", () => {
    const result = IEPExtractionSchema.parse(validExtraction({ review_date: "14/03/2028" }));
    expect(result.review_date).toBe("2028-03-14");
  });

  it("accepts an ISO review_date unchanged", () => {
    const result = IEPExtractionSchema.parse(validExtraction({ review_date: "2028-03-14" }));
    expect(result.review_date).toBe("2028-03-14");
  });

  it("accepts a null review_date", () => {
    const result = IEPExtractionSchema.parse(validExtraction({ review_date: null }));
    expect(result.review_date).toBeNull();
  });

  it("rejects an unparseable review_date", () => {
    expect(() => IEPExtractionSchema.parse(validExtraction({ review_date: "not a date" }))).toThrow();
  });

  it("rejects a calendar-invalid DD/MM/YYYY date (Feb 31st doesn't exist)", () => {
    expect(() => IEPExtractionSchema.parse(validExtraction({ review_date: "31/02/2028" }))).toThrow(
      /not a real calendar date/
    );
  });

  it("rejects a calendar-invalid ISO date (nonsense month)", () => {
    expect(() => IEPExtractionSchema.parse(validExtraction({ review_date: "2028-13-01" }))).toThrow(
      /not a real calendar date/
    );
  });

  it("accepts Feb 29th on a leap year", () => {
    const result = IEPExtractionSchema.parse(validExtraction({ review_date: "29/02/2028" }));
    expect(result.review_date).toBe("2028-02-29");
  });

  it("rejects Feb 29th on a non-leap year", () => {
    expect(() => IEPExtractionSchema.parse(validExtraction({ review_date: "29/02/2027" }))).toThrow(
      /not a real calendar date/
    );
  });

  it("normalizes weekly_support_hours of 0 to null", () => {
    const result = IEPExtractionSchema.parse(validExtraction({ weekly_support_hours: 0 }));
    expect(result.weekly_support_hours).toBeNull();
  });

  it("rejects weekly_support_hours above 40", () => {
    expect(() => IEPExtractionSchema.parse(validExtraction({ weekly_support_hours: 41 }))).toThrow();
  });

  it("rejects a student_id that looks like a real name", () => {
    expect(() => IEPExtractionSchema.parse(validExtraction({ student_id: "נועם כהן" }))).toThrow(
      /looks like a real name/
    );
  });

  it("accepts a null student_id", () => {
    const result = IEPExtractionSchema.parse(validExtraction({ student_id: null }));
    expect(result.student_id).toBeNull();
  });

  it("rejects a placement_type outside the documented enum", () => {
    expect(() => IEPExtractionSchema.parse(validExtraction({ placement_type: "לא ידוע" }))).toThrow();
  });

  it("rejects confidence above 1", () => {
    expect(() => IEPExtractionSchema.parse(validExtraction({ confidence: 1.5 }))).toThrow();
  });

  it("defaults goals and accommodations to empty arrays", () => {
    const result = IEPExtractionSchema.parse(validExtraction());
    expect(result.goals).toEqual([]);
    expect(result.accommodations).toEqual([]);
  });

  it("parses a fully-populated valid object", () => {
    const result = IEPExtractionSchema.parse(
      validExtraction({
        disability_category: "הפרעת קשב וריכוז (ADHD)",
        weekly_support_hours: 6,
        goals: ["שיפור קשב וריכוז"],
        accommodations: ["הארכת זמן של 25%"],
      })
    );
    expect(result.confidence).toBe(0.9);
    expect(result.weekly_support_hours).toBe(6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/extraction-schema.test.ts`
Expected: FAIL — `Cannot find module './extraction-schema'`.

- [ ] **Step 3: Write `lib/extraction-schema.ts`**

```ts
import { z } from "zod";

const PLACEMENT_TYPES = [
  "הכלה מלאה",
  "הכלה חלקית",
  'כיתה מיוחדת בבי"ס רגיל',
  "חינוך מיוחד נפרד",
] as const;

export const PlacementType = z.enum(PLACEMENT_TYPES);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DD_MM_YYYY_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

function normalizeDateInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const match = trimmed.match(DD_MM_YYYY_RE);
  if (!match) return trimmed;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// Digit-shape regexes accept nonsense like "31/02/2028" or "99/99/2028" — this
// catches that by round-tripping through a UTC Date construction, the same
// way Python's date(year, month, day) constructor rejects invalid calendar
// dates by raising ValueError.
function isValidCalendarDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Ported from iep_schema.py's parse_israeli_date_format: source documents write
// dates as DD/MM/YYYY, and the model sometimes echoes that back verbatim
// instead of ISO-8601. Output stays a string (not Date) to avoid timezone
// bugs when round-tripping to Postgres `date`.
const reviewDateSchema = z.preprocess(
  normalizeDateInput,
  z
    .string()
    .regex(ISO_DATE_RE, "review_date must resolve to YYYY-MM-DD")
    .refine(isValidCalendarDate, "review_date is not a real calendar date")
    .nullable()
);

// Ported from iep_schema.py's zero_becomes_none: the model sometimes returns
// 0 instead of omitting the field.
const weeklySupportHoursSchema = z.preprocess(
  (value) => (value === 0 ? null : value),
  z.number().min(0).max(40).nullable()
);

// Ported from iep_schema.py's reject_real_names: guards against the redaction
// layer failing silently — if student_id looks like a real multi-word name
// instead of an internal ID, fail loudly rather than let it reach the database.
const studentIdSchema = z
  .string()
  .nullable()
  .refine(
    (value) => !(value && value.trim().includes(" ") && !value.toUpperCase().startsWith("STU")),
    {
      message:
        "student_id looks like a real name, not an internal ID — check that redaction ran before this document reached the model",
    }
  );

export const IEPExtractionSchema = z.object({
  student_id: studentIdSchema.nullish().transform((value) => value ?? null),
  school_year: z.string(),
  disability_category: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  placement_type: PlacementType,
  weekly_support_hours: weeklySupportHoursSchema.nullish().transform((value) => value ?? null),
  goals: z.array(z.string()).nullish().transform((value) => value ?? []),
  review_date: reviewDateSchema.nullish().transform((value) => value ?? null),
  accommodations: z.array(z.string()).nullish().transform((value) => value ?? []),
  confidence: z.number().min(0).max(1),
});

export type IEPExtraction = z.infer<typeof IEPExtractionSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/extraction-schema.test.ts`
Expected: all 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/extraction-schema.ts lib/extraction-schema.test.ts
git commit -m "Port iep_schema.py's IEPExtraction schema to Zod (lib/extraction-schema.ts)"
```

---

### Task 4: PDF text extraction — `lib/pdf.ts`

**Files:**
- Create: `lib/pdf.ts`
- Test: `lib/pdf.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `extractPdfText(fileBuffer: ArrayBuffer): Promise<string>`. Consumed by `app/api/upload/route.ts` (Task 8).

- [ ] **Step 1: Write the failing test — `lib/pdf.test.ts`**

Uses the existing `sample_iep_decision.pdf` fixture at the repo root (already committed, already used to manually verify `iep_schema.py`).

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdf";

describe("extractPdfText", () => {
  it("extracts non-empty Hebrew text from the sample IEP decision", async () => {
    const bytes = readFileSync(resolve(__dirname, "..", "sample_iep_decision.pdf"));
    const text = await extractPdfText(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("ועדת");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/pdf.test.ts`
Expected: FAIL — `Cannot find module './pdf'`.

- [ ] **Step 3: Write `lib/pdf.ts`**

```ts
import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(fileBuffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(fileBuffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/pdf.test.ts`
Expected: PASS.

If `unpdf`'s exports differ from `extractText`/`getDocumentProxy` (check `node_modules/unpdf/package.json` `exports` field and its README if this fails), adjust the import to match the installed version's actual API — the behavior required (Uint8Array in, merged plain-text out) stays the same.

If the assertion `expect(text).toContain("ועדת")` fails because the sample PDF's actual text doesn't contain that exact substring (e.g. it's a scanned image with no extractable text layer), relax the assertion to `expect(text.length).toBeGreaterThan(0)` only, and note in the test which case applies — this is a real fact about the fixture you're discovering, not a bug to work around silently.

- [ ] **Step 5: Commit**

```bash
git add lib/pdf.ts lib/pdf.test.ts
git commit -m "Add PDF text extraction (lib/pdf.ts) via unpdf"
```

---

### Task 5: Outgoing webhook — `lib/webhook.ts`

**Files:**
- Create: `lib/webhook.ts`
- Test: `lib/webhook.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `interface WebhookPayload { document_id: string; status: "done" | "failed"; confidence?: number; error?: string }`, `signPayload(payload: string, secret: string): Promise<string>`, `sendWebhook(payload: WebhookPayload, webhookUrl: string | undefined, secret: string | undefined, fetchImpl?: typeof fetch): Promise<void>`. Consumed by `lib/process-document.ts` (Task 7).

- [ ] **Step 1: Write the failing test — `lib/webhook.test.ts`**

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { sendWebhook, signPayload, type WebhookPayload } from "./webhook";

describe("signPayload", () => {
  it("produces the same hex HMAC-SHA256 signature as Node's crypto module", async () => {
    const body = JSON.stringify({ document_id: "abc-123", status: "done", confidence: 0.87 });
    const secret = "test-secret";
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const actual = await signPayload(body, secret);
    expect(actual).toBe(expected);
  });
});

describe("sendWebhook", () => {
  const payload: WebhookPayload = { document_id: "abc-123", status: "done", confidence: 0.87 };

  it("does nothing when webhookUrl is unset", async () => {
    const fetchImpl = vi.fn();
    await sendWebhook(payload, undefined, "secret", fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs the signed payload when webhookUrl is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await sendWebhook(payload, "https://example.com/hook", "secret", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Webhook-Signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("sends an empty signature when secret is unset but webhookUrl is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await sendWebhook(payload, "https://example.com/hook", undefined, fetchImpl);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers["X-Webhook-Signature"]).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/webhook.test.ts`
Expected: FAIL — `Cannot find module './webhook'`.

- [ ] **Step 3: Write `lib/webhook.ts`**

```ts
export interface WebhookPayload {
  document_id: string;
  status: "done" | "failed";
  confidence?: number;
  error?: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(signature);
}

export async function sendWebhook(
  payload: WebhookPayload,
  webhookUrl: string | undefined,
  secret: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (!webhookUrl) return;

  const body = JSON.stringify(payload);
  const signature = secret ? await signPayload(body, secret) : "";

  await fetchImpl(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
    },
    body,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/webhook.test.ts`
Expected: all 4 tests PASS.

`crypto.subtle` is a Web Crypto API global available natively in both the Cloudflare Workers runtime and Node 20+ (this project's `@types/node` and Vitest both target Node 20) — no polyfill needed. If `npm test` reports `crypto is not defined`, confirm the Node version running the tests is 20+ (`node --version`) rather than adding a polyfill.

- [ ] **Step 5: Commit**

```bash
git add lib/webhook.ts lib/webhook.test.ts
git commit -m "Add HMAC-signed outgoing webhook (lib/webhook.ts)"
```

---

### Task 6: Gemini call and Supabase helpers

**Files:**
- Create: `lib/gemini.ts`
- Test: `lib/gemini.test.ts`
- Create: `lib/supabase.ts`

**Interfaces:**
- Consumes: `IEPExtractionSchema`, `type IEPExtraction` from `lib/extraction-schema.ts` (Task 3).
- Produces:
  - `buildExtractionPrompt(redactedText: string): string`
  - `interface GeminiClient { extract(redactedText: string): Promise<unknown> }`
  - `createGeminiClient(apiKey: string): GeminiClient`
  - `extractIEP(redactedText: string, client: GeminiClient): Promise<IEPExtraction>`
  - `createSupabaseClient(url: string, serviceRoleKey: string)`
  - `insertDocument(client, storagePath: string, originalFilename: string): Promise<string>`
  - `insertExtraction(client, documentId: string, extraction: IEPExtraction): Promise<void>`
  - `updateDocumentStatus(client, documentId: string, status: "done" | "failed", errorMessage?: string | null): Promise<void>`

  All consumed by `lib/process-document.ts` (Task 7) and `app/api/upload/route.ts` (Task 8).

- [ ] **Step 1: Write the failing test — `lib/gemini.test.ts`**

`extract()` itself calls a real network API and isn't tested here; `buildExtractionPrompt` (pure) and `extractIEP` (composition, with a fake `GeminiClient`) are.

```ts
import { describe, expect, it } from "vitest";
import { buildExtractionPrompt, extractIEP, type GeminiClient } from "./gemini";

describe("buildExtractionPrompt", () => {
  it("embeds the redacted document text", () => {
    const prompt = buildExtractionPrompt("טקסט מסמך מזוקק");
    expect(prompt).toContain("טקסט מסמך מזוקק");
    expect(prompt).toContain("confidence");
  });
});

describe("extractIEP", () => {
  it("validates the client's raw JSON against IEPExtractionSchema", async () => {
    const fakeClient: GeminiClient = {
      extract: async () => ({
        student_id: "STU-0001",
        school_year: 'תשפ"ח',
        placement_type: "הכלה חלקית",
        review_date: "14/03/2028",
        confidence: 0.9,
      }),
    };

    const result = await extractIEP("טקסט מזוקק", fakeClient);
    expect(result.review_date).toBe("2028-03-14");
    expect(result.confidence).toBe(0.9);
  });

  it("throws when the client's raw JSON fails validation", async () => {
    const fakeClient: GeminiClient = {
      extract: async () => ({ school_year: 'תשפ"ח' }), // missing required placement_type/confidence
    };

    await expect(extractIEP("טקסט מזוקק", fakeClient)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/gemini.test.ts`
Expected: FAIL — `Cannot find module './gemini'`.

- [ ] **Step 3: Write `lib/gemini.ts`**

The prompt mirrors `iep_schema.py`'s `call_vertex_ai` prompt, extended with the field list (since we don't pass a machine-readable `response_schema` to the Gemini Developer API here — see the comment below).

```ts
import { GoogleGenAI } from "@google/genai";
import { IEPExtractionSchema, type IEPExtraction } from "./extraction-schema";

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

אם שדה לא מופיע במסמך במפורש, החזר null עבורו — אל תמציא ערך.

מסמך:
${redactedDocumentText}`;
}

export interface GeminiClient {
  extract(redactedText: string): Promise<unknown>;
}

export function createGeminiClient(apiKey: string): GeminiClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async extract(redactedText: string): Promise<unknown> {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: buildExtractionPrompt(redactedText),
        config: {
          responseMimeType: "application/json",
        },
      });
      return JSON.parse(response.text);
    },
  };
}

export async function extractIEP(redactedText: string, client: GeminiClient): Promise<IEPExtraction> {
  const raw = await client.extract(redactedText);
  return IEPExtractionSchema.parse(raw);
}
```

Note: the field list is described in the prompt rather than passed as a machine-readable `responseSchema`, because the Gemini API's structured-output schema format only supports a constrained subset of JSON Schema, and getting a Zod→that-subset conversion exactly right is a real risk of silently breaking the live demo. `IEPExtractionSchema.parse` is what actually enforces correctness regardless (same defense-in-depth approach as the rest of this codebase) — the prompt is a strong hint, not the safety net.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/gemini.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 5: Write `lib/supabase.ts`** (no dedicated tests — see below)

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IEPExtraction } from "./extraction-schema";

export function createSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey);
}

export async function insertDocument(
  client: SupabaseClient,
  storagePath: string,
  originalFilename: string
): Promise<string> {
  const { data, error } = await client
    .from("documents")
    .insert({ storage_path: storagePath, original_filename: originalFilename })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function insertExtraction(
  client: SupabaseClient,
  documentId: string,
  extraction: IEPExtraction
): Promise<void> {
  const { error } = await client.from("extractions").insert({ document_id: documentId, ...extraction });
  if (error) throw error;
}

export async function updateDocumentStatus(
  client: SupabaseClient,
  documentId: string,
  status: "done" | "failed",
  errorMessage: string | null = null
): Promise<void> {
  const { error } = await client
    .from("documents")
    .update({ status, error_message: errorMessage })
    .eq("id", documentId);
  if (error) throw error;
}
```

This file has no dedicated test: its only logic is the Supabase JS query builder, which would need a real (or fully mocked) Supabase project to test meaningfully, and `lib/process-document.ts` (Task 7) already exercises the same call shape through a fake. Its actual correctness against a real Supabase project is verified manually in Task 8, not by an automated test — don't claim test coverage this file doesn't have.

- [ ] **Step 6: Commit**

```bash
git add lib/gemini.ts lib/gemini.test.ts lib/supabase.ts
git commit -m "Add Gemini extraction call and Supabase helpers (lib/gemini.ts, lib/supabase.ts)"
```

---

### Task 7: Orchestration — `lib/process-document.ts`

**Files:**
- Create: `lib/process-document.ts`
- Test: `lib/process-document.test.ts`

**Interfaces:**
- Consumes: `redactText` (Task 2), `type IEPExtraction` (Task 3), `GeminiClient`, `extractIEP` (Task 6), `WebhookPayload`, `sendWebhook` (Task 5).
- Produces:
  ```ts
  interface ProcessDocumentDeps {
    fetchDocumentText: () => Promise<string>;
    geminiClient: GeminiClient;
    supabase: {
      insertExtraction: (extraction: IEPExtraction) => Promise<void>;
      updateDocumentStatus: (status: "done" | "failed", errorMessage?: string | null) => Promise<void>;
    };
    sendWebhook: typeof sendWebhook;
    webhookUrl: string | undefined;
    webhookSecret: string | undefined;
  }
  async function processDocument(documentId: string, deps: ProcessDocumentDeps): Promise<void>
  ```
  Consumed by `app/api/upload/route.ts` (Task 8). Note the contract: this
  Promise resolves (never rejects) for any failure up through extraction
  (fetch/redact/Gemini/validation) — those are reported via
  `updateDocumentStatus("failed", ...)` + a failed webhook. But if a step
  *after* a successful extraction throws (inserting the row, marking it
  done, or sending the success webhook), the Promise **rejects** instead —
  deliberately not reported as "failed", since a valid extraction already
  exists and mislabeling it would be worse than an unhandled rejection.
  Task 8 passes this Promise to `context.waitUntil`, which is one of the
  cases where an unhandled rejection is acceptable: Cloudflare logs it
  without crashing the Worker or the already-sent HTTP response.

- [ ] **Step 1: Write the failing test — `lib/process-document.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { processDocument, type ProcessDocumentDeps } from "./process-document";
import type { GeminiClient } from "./gemini";

function buildDeps(overrides: Partial<ProcessDocumentDeps> = {}): ProcessDocumentDeps {
  return {
    fetchDocumentText: async () => "שם התלמיד/ה: נועם כהן. ת.ז. 123456782.",
    geminiClient: {
      extract: async () => ({
        student_id: "STU-0001",
        school_year: 'תשפ"ח',
        placement_type: "הכלה חלקית",
        review_date: "14/03/2028",
        confidence: 0.9,
      }),
    },
    supabase: {
      insertExtraction: vi.fn().mockResolvedValue(undefined),
      updateDocumentStatus: vi.fn().mockResolvedValue(undefined),
    },
    sendWebhook: vi.fn().mockResolvedValue(undefined),
    webhookUrl: "https://example.com/hook",
    webhookSecret: "secret",
    ...overrides,
  };
}

describe("processDocument", () => {
  it("on success: redacts, extracts, persists, and fires a 'done' webhook", async () => {
    const deps = buildDeps();
    await processDocument("doc-1", deps);

    expect(deps.supabase.insertExtraction).toHaveBeenCalledTimes(1);
    const [extraction] = (deps.supabase.insertExtraction as any).mock.calls[0];
    expect(extraction.review_date).toBe("2028-03-14");

    expect(deps.supabase.updateDocumentStatus).toHaveBeenCalledWith("done");
    expect(deps.sendWebhook).toHaveBeenCalledWith(
      { document_id: "doc-1", status: "done", confidence: 0.9 },
      "https://example.com/hook",
      "secret"
    );
  });

  it("never sends the raw unredacted text to the Gemini client", async () => {
    const extractSpy = vi.fn().mockResolvedValue({
      student_id: "STU-0001",
      school_year: 'תשפ"ח',
      placement_type: "הכלה חלקית",
      confidence: 0.9,
    });
    const deps = buildDeps({ geminiClient: { extract: extractSpy } });

    await processDocument("doc-1", deps);

    const [textSentToGemini] = extractSpy.mock.calls[0];
    expect(textSentToGemini).not.toContain("נועם כהן");
    expect(textSentToGemini).not.toContain("123456782");
  });

  it("on Gemini failure: marks the document failed and fires a 'failed' webhook", async () => {
    const deps = buildDeps({
      geminiClient: {
        extract: async () => {
          throw new Error("Gemini API unavailable");
        },
      },
    });

    await processDocument("doc-1", deps);

    expect(deps.supabase.updateDocumentStatus).toHaveBeenCalledWith("failed", "Gemini API unavailable");
    expect(deps.sendWebhook).toHaveBeenCalledWith(
      { document_id: "doc-1", status: "failed", error: "Gemini API unavailable" },
      "https://example.com/hook",
      "secret"
    );
    expect(deps.supabase.insertExtraction).not.toHaveBeenCalled();
  });

  it("on schema validation failure: marks the document failed with the validation error", async () => {
    const deps = buildDeps({
      geminiClient: { extract: async () => ({ school_year: 'תשפ"ח' }) }, // missing required fields
    });

    await processDocument("doc-1", deps);

    expect(deps.supabase.updateDocumentStatus).toHaveBeenCalledTimes(1);
    const [status, errorMessage] = (deps.supabase.updateDocumentStatus as any).mock.calls[0];
    expect(status).toBe("failed");
    expect(typeof errorMessage).toBe("string");
  });

  it("does not report 'failed' if a post-extraction step throws (extraction already succeeded)", async () => {
    const deps = buildDeps({
      supabase: {
        insertExtraction: vi.fn().mockRejectedValue(new Error("Supabase write failed")),
        updateDocumentStatus: vi.fn().mockResolvedValue(undefined),
      },
    });

    await expect(processDocument("doc-1", deps)).rejects.toThrow("Supabase write failed");
    expect(deps.supabase.updateDocumentStatus).not.toHaveBeenCalled();
    expect(deps.sendWebhook).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/process-document.test.ts`
Expected: FAIL — `Cannot find module './process-document'`.

- [ ] **Step 3: Write `lib/process-document.ts`**

```ts
import { redactText } from "./redact";
import { extractIEP, type GeminiClient } from "./gemini";
import { sendWebhook, type WebhookPayload } from "./webhook";
import type { IEPExtraction } from "./extraction-schema";

export interface ProcessDocumentDeps {
  fetchDocumentText: () => Promise<string>;
  geminiClient: GeminiClient;
  supabase: {
    insertExtraction: (extraction: IEPExtraction) => Promise<void>;
    updateDocumentStatus: (status: "done" | "failed", errorMessage?: string | null) => Promise<void>;
  };
  sendWebhook: typeof sendWebhook;
  webhookUrl: string | undefined;
  webhookSecret: string | undefined;
}

export async function processDocument(documentId: string, deps: ProcessDocumentDeps): Promise<void> {
  // Only the extraction itself (fetch -> redact -> Gemini -> validate) is
  // "did this document fail to extract." A failure here means there is no
  // extraction to persist, so marking the document failed is correct.
  let extraction: IEPExtraction;
  try {
    const rawText = await deps.fetchDocumentText();
    const { redactedText } = redactText(rawText);
    extraction = await extractIEP(redactedText, deps.geminiClient);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await deps.supabase.updateDocumentStatus("failed", message);

    const payload: WebhookPayload = {
      document_id: documentId,
      status: "failed",
      error: message,
    };
    await deps.sendWebhook(payload, deps.webhookUrl, deps.webhookSecret);
    return;
  }

  // Deliberately outside the try/catch above: a valid extraction already
  // exists at this point, so a transient failure persisting/announcing it
  // (e.g. a Supabase or webhook hiccup) must not be reported as "failed" —
  // that would overwrite a real result with a misleading status.
  await deps.supabase.insertExtraction(extraction);
  await deps.supabase.updateDocumentStatus("done");

  const payload: WebhookPayload = {
    document_id: documentId,
    status: "done",
    confidence: extraction.confidence,
  };
  await deps.sendWebhook(payload, deps.webhookUrl, deps.webhookSecret);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/process-document.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests across `lib/redact.test.ts`, `lib/extraction-schema.test.ts`, `lib/pdf.test.ts`, `lib/webhook.test.ts`, `lib/gemini.test.ts`, `lib/process-document.test.ts` PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/process-document.ts lib/process-document.test.ts
git commit -m "Add processDocument orchestration (lib/process-document.ts)"
```

---

### Task 8: The upload endpoint and Cloudflare deploy config

**Files:**
- Create: `app/api/upload/route.ts`
- Create: `wrangler.toml`
- Create: `.env.local.example`

**Interfaces:**
- Consumes: `insertDocument`, `createSupabaseClient`, `insertExtraction`, `updateDocumentStatus` (Task 6), `createGeminiClient` (Task 6), `extractPdfText` (Task 4), `processDocument` (Task 7), `sendWebhook` (Task 5).
- Produces: the `POST /api/upload` HTTP contract — `202 { document_id: string, status: "processing" }` on success, `400 { error: string }` if the `file` field is missing/not a PDF.

This task cannot be unit-tested in this sandbox: `getRequestContext()` (which exposes the R2 binding and `waitUntil`) only resolves inside an actual `@cloudflare/next-on-pages`-served request — there is no live Cloudflare account, R2 bucket, Supabase project, or Gemini key available here. Steps 5–6 below are manual verification to run once real credentials exist, not automated tests.

- [ ] **Step 1: Write `wrangler.toml`**

```toml
name = "special-ed-doc-intelligence"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".vercel/output/static"

[[r2_buckets]]
binding = "DOCS_BUCKET"
bucket_name = "special-ed-documents"
```

- [ ] **Step 2: Write `.env.local.example`**

```
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DOCUMENTS_API_KEY=
WEBHOOK_URL=
WEBHOOK_SECRET=
```

- [ ] **Step 3: Write `app/api/upload/route.ts`**

```ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { createGeminiClient } from "@/lib/gemini";
import { extractPdfText } from "@/lib/pdf";
import { processDocument } from "@/lib/process-document";
import {
  createSupabaseClient,
  insertDocument,
  insertExtraction,
  updateDocumentStatus,
} from "@/lib/supabase";
import { sendWebhook } from "@/lib/webhook";

export const runtime = "edge";

interface Env {
  DOCS_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
}

// getRequestContext's single generic parameter types `cf`, not `env` — `env`
// is always typed via the ambient global `CloudflareEnv` interface (see
// @cloudflare/next-on-pages's README). Extending it here is how `env.DOCS_BUCKET`
// etc. actually typecheck; `getRequestContext<{ Bindings: Env }>()` would not.
declare global {
  interface CloudflareEnv extends Env {}
}

export async function POST(request: Request): Promise<Response> {
  const { env, ctx } = getRequestContext();

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.type !== "application/pdf") {
    return Response.json({ error: "multipart field 'file' (application/pdf) is required" }, { status: 400 });
  }

  const fileBuffer = await file.arrayBuffer();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  let storagePath: string;
  let documentId: string;
  try {
    storagePath = `documents/${crypto.randomUUID()}.pdf`;
    await env.DOCS_BUCKET.put(storagePath, fileBuffer);
    documentId = await insertDocument(supabase, storagePath, file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `failed to store document: ${message}` }, { status: 503 });
  }

  ctx.waitUntil(
    processDocument(documentId, {
      fetchDocumentText: () => extractPdfText(fileBuffer),
      geminiClient: createGeminiClient(env.GEMINI_API_KEY),
      supabase: {
        insertExtraction: (extraction) => insertExtraction(supabase, documentId, extraction),
        updateDocumentStatus: (status, errorMessage) =>
          updateDocumentStatus(supabase, documentId, status, errorMessage ?? null),
      },
      sendWebhook,
      webhookUrl: env.WEBHOOK_URL,
      webhookSecret: env.WEBHOOK_SECRET,
    })
  );

  return Response.json({ document_id: documentId, status: "processing" }, { status: 202 });
}
```

- [ ] **Step 4: Verify the project still builds**

Run: `npm run build`
Expected: `Compiled successfully`. This confirms the route's TypeScript compiles and imports resolve — it does not confirm the route works against live services.

- [ ] **Step 5 (manual verification, once real credentials exist): Run against Cloudflare's local dev runtime**

Fill in real values in `.env.local` (copy from `.env.local.example`), then:

```bash
npm run pages:build
npx wrangler pages dev .vercel/output/static
```

- [ ] **Step 6 (manual verification): Upload the sample PDF and confirm the response**

```bash
curl -i -X POST http://localhost:8788/api/upload \
  -F "file=@sample_iep_decision.pdf;type=application/pdf"
```

Expected: HTTP `202` with a JSON body like `{"document_id":"<uuid>","status":"processing"}`. Then, after a few seconds (Gemini call + Supabase write), query the `documents` and `extractions` tables in the Supabase dashboard for that `document_id` and confirm `status` moved to `done` (or `failed` with a populated `error_message`) and the `extractions` row matches what `python iep_schema.py sample_iep_decision.pdf` produces for the same file.

- [ ] **Step 7: Commit**

```bash
git add app/api/upload/route.ts wrangler.toml .env.local.example
git commit -m "Add POST /api/upload endpoint (R2 + Supabase + async Gemini processing + webhook)"
```

---

### Task 9: Update status docs

**Files:**
- Modify: `README.md`
- Modify: `SPEC.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Check off the completed items in `README.md`'s `## Status`**

In `README.md`, change:

```markdown
- [ ] Upload endpoint (`app/api/upload/route.ts`)
- [ ] Outgoing webhook (HMAC-signed completion notification)
```

to:

```markdown
- [x] Upload endpoint (`app/api/upload/route.ts`)
- [x] Outgoing webhook (HMAC-signed completion notification)
```

Leave `Dashboard UI`, `REST API read endpoints`, and `Deploy to Cloudflare Pages` unchecked — this plan doesn't build them.

- [ ] **Step 2: Check off the corresponding line in `SPEC.md`'s checklist**

In `SPEC.md`, change:

```markdown
- [ ] Upload endpoint + עיבוד אסינכרוני + Outgoing Webhook עם HMAC
```

to:

```markdown
- [x] Upload endpoint + עיבוד אסינכרוני + Outgoing Webhook עם HMAC
```

Leave `תוצאות ב-Supabase...` unchecked until Task 8's manual verification (Steps 5–6) has actually been run against a real Supabase project and confirmed rows landed correctly — checking it off before that verification happens would overclaim.

- [ ] **Step 3: Commit**

```bash
git add README.md SPEC.md
git commit -m "Update status checklists: upload endpoint and webhook done"
```
