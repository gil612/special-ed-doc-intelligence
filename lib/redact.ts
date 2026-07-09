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
