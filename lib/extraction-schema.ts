import { z } from "zod";

const PLACEMENT_TYPES = [
  "הכלה מלאה",
  "הכלה חלקית",
  'כיתה מיוחדת בבי"ס רגיל',
  "חינוך מיוחד נפרד",
] as const;

export const PlacementType = z.enum(PLACEMENT_TYPES);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DD_MM_YYYY_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

function normalizeDateInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const match = trimmed.match(DD_MM_YYYY_RE);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (ISO_DATE_RE.test(trimmed)) return trimmed;
  // Doesn't match any recognized date format - e.g. a vague, non-date
  // description like "בעוד כחצי שנה" ("in about six months"), or the
  // literal string "null". There is no exact date to recover, so treat
  // it the same as an explicit null rather than failing the whole
  // extraction over one unresolvable field. A calendar-shaped but
  // impossible date (e.g. day=31 for February) still gets rejected below
  // by isValidCalendarDate - that's a genuine data problem, unlike free
  // text that was never a date attempt.
  return null;
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
// dates as DD/MM/YYYY, DD-MM-YYYY, or DD.MM.YYYY, and the model sometimes
// echoes that back verbatim instead of ISO-8601. Output stays a string (not
// Date) to avoid timezone bugs when round-tripping to Postgres `date`.
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
  school_year: z.string().nullish().transform((value) => value ?? null),
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
  summary: z.string().nullish().transform((value) => value ?? null),
});

export type IEPExtraction = z.infer<typeof IEPExtractionSchema>;
