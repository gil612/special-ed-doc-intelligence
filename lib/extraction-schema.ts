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

// Ported from iep_schema.py's parse_israeli_date_format: source documents write
// dates as DD/MM/YYYY, and the model sometimes echoes that back verbatim
// instead of ISO-8601. Output stays a string (not Date) to avoid timezone
// bugs when round-tripping to Postgres `date`.
const reviewDateSchema = z.preprocess(
  normalizeDateInput,
  z.string().regex(ISO_DATE_RE, "review_date must resolve to YYYY-MM-DD").nullable()
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
