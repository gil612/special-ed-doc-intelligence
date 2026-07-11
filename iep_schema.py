"""
iep_schema.py

IEP = Individualized Education Program (תוכנית חינוכית אישית) - a document used in special education in Israel.

Pydantic schema + validation logic for the Document Intelligence Service
(תח"י / ועדת שילוב extraction project).

IMPORTANT: Pydantic validates *structured data* (the JSON returned by Vertex AI's
Structured Output), not the raw PDF bytes themselves. The flow is:

    PDF file -> extract_text() -> [redaction] -> call_vertex_ai() -> raw JSON
             -> validate_extraction(raw JSON) -> IEPExtraction (validated) or ValidationError

This file gives you:
  1. The IEPExtraction schema (with field-level validators for the special-ed domain)
  2. extract_text() - pulls text out of an uploaded PDF (pypdf), or reads
     non-PDF test fixtures (cases/*.md) as plain text
  3. call_vertex_ai() - a STUB. Replace the body with your real Vertex AI call.
     Left unimplemented here because this environment has no Vertex AI credentials/network.
  4. validate_pdf() - ties the whole pipeline together end to end
  5. A CLI entry point so you can run: python iep_schema.py path/to/document.pdf
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, ValidationError, field_validator


# ---------------------------------------------------------------------------
# 1. Schema
# ---------------------------------------------------------------------------

class PlacementType(str, Enum):
    FULL_INCLUSION = "הכלה מלאה"
    PARTIAL_INCLUSION = "הכלה חלקית"
    SPECIAL_CLASS = 'כיתה מיוחדת בבי"ס רגיל'
    SEPARATE_SPECIAL_ED = "חינוך מיוחד נפרד"


class IEPExtraction(BaseModel):
    student_id: Optional[str] = Field(
        default=None,
        description="מזהה תלמיד פנימי בלבד (למשל STU-0001) — לעולם לא שם מלא",
    )
    school_year: Optional[str] = Field(
        default=None, description='שנת לימודים, למשל תשפ"ז — null אם לא מצוין במסמך'
    )
    disability_category: Optional[str] = Field(
        default=None, description="קטגוריית הליקוי כפי שמופיע במסמך"
    )
    placement_type: PlacementType = Field(description="סוג השיבוץ")
    weekly_support_hours: Optional[float] = Field(
        default=None, ge=0, le=40, description="שעות תמיכה שבועיות שהוקצו"
    )
    goals: list[str] = Field(default_factory=list, description="יעדים חינוכיים/טיפוליים")
    review_date: Optional[date] = Field(default=None, description="תאריך הוועדה/עדכון הבא")
    accommodations: list[str] = Field(default_factory=list, description="התאמות נדרשות")
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="ציון ביטחון בחילוץ, 0-1. שדה חובה — לעולם לא None, גם כשמסמך חלקי.",
    )
    summary: Optional[str] = Field(
        default=None,
        description="סיכום קצר (1-2 משפטים) של המקרה — שיבוץ, היקף תמיכה, ונקודה מרכזית אחת",
    )

    @field_validator("student_id")
    @classmethod
    def reject_real_names(cls, v: Optional[str]) -> Optional[str]:
        """
        Guards against the redaction layer failing silently: if student_id looks
        like a real multi-word name instead of an internal ID, fail loudly here
        rather than let it reach the database.
        """
        if v and " " in v.strip() and not v.upper().startswith("STU"):
            raise ValueError(
                "student_id looks like a real name, not an internal ID — "
                "check that redaction ran before this document reached the model"
            )
        return v

    @field_validator("weekly_support_hours")
    @classmethod
    def zero_becomes_none(cls, v: Optional[float]) -> Optional[float]:
        # A model sometimes returns 0 instead of omitting the field - normalize it.
        return None if v == 0 else v

    @field_validator("review_date", mode="before")
    @classmethod
    def parse_israeli_date_format(cls, v):
        """
        Source documents write dates as DD/MM/YYYY, DD-MM-YYYY, or
        DD.MM.YYYY, and the model sometimes echoes that format back
        verbatim instead of converting to ISO-8601 - which Pydantic's
        default date parser rejects. Normalize the common Israeli formats
        here rather than relying on the model to always comply with the
        prompt. The model also sometimes emits the literal string "null"
        instead of a JSON null when the document doesn't state a review
        date - treat that the same as None rather than trying to parse it
        as a date.

        Some documents only state a month and year (e.g. "ינואר 2028"),
        with no day at all - not a model formatting slip, just coarser
        information than the schema's `date` type can represent exactly.
        Default the day to the 1st of that month rather than rejecting
        the whole field, since a review month is still useful signal.

        If none of the above match - e.g. the document only gives a vague,
        non-date description like "בעוד כחצי שנה" ("in about six months") -
        there is no exact date to recover. Treat that the same as an
        explicit null rather than passing the raw text through to
        Pydantic's date parser, which would raise and reject the entire
        extraction over one unresolvable field. A calendar-shaped but
        impossible date (e.g. day=31 for February) still fails below, when
        `date(year, month, day)` raises - that is a genuine data problem
        worth surfacing, unlike free text that was never a date attempt.
        """
        if not isinstance(v, str):
            return v
        text = v.strip()
        if text.lower() == "null":
            return None
        match = re.match(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$", text)
        if match:
            day, month, year = (int(g) for g in match.groups())
            return date(year, month, day)
        hebrew_months = {
            "ינואר": 1, "פברואר": 2, "מרץ": 3, "אפריל": 4,
            "מאי": 5, "יוני": 6, "יולי": 7, "אוגוסט": 8,
            "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12,
        }
        match = re.match(r"^([א-ת]+)\s+(\d{4})$", text)
        if match and match.group(1) in hebrew_months:
            return date(int(match.group(2)), hebrew_months[match.group(1)], 1)
        return None


# ---------------------------------------------------------------------------
# 2. Document text extraction
# ---------------------------------------------------------------------------

def extract_text(doc_path: str) -> str:
    """
    Extract raw text from a source document. Real IEP documents are PDFs
    (parsed with pypdf); synthetic test fixtures under cases/ are authored
    as HTML-wrapped Markdown for readability, so any non-.pdf path is read
    as text with HTML tags stripped instead of being handed to PdfReader.
    """
    if doc_path.lower().endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(doc_path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    with open(doc_path, "r", encoding="utf-8") as f:
        text = f.read()
    return re.sub(r"<[^>]+>", "", text)


def extract_and_redact(doc_path: str):
    """
    Document -> raw text -> redacted text, ready to send to an external AI provider.
    Returns the redaction.RedactionResult (redacted_text + local-audit-only matches).
    """
    from redaction import redact_text

    raw_text = extract_text(doc_path)
    return redact_text(raw_text)


# ---------------------------------------------------------------------------
# 3. Vertex AI call - STUB, replace with the real implementation
# ---------------------------------------------------------------------------

def call_vertex_ai(redacted_document_text: str) -> dict:
    from google import genai
    import json

    client = genai.Client(
        vertexai=True,
        project="eternal-insight-501811-v4",
        location="us-central1",
    )

    prompt = f"""
חלץ מהמסמך הבא נתונים לפי הסכימה. אם שדה לא מופיע במסמך במפורש, החזר null
עבורו — אל תמציא ערך. שדה confidence הוא חובה (0-1), משקף עד כמה החילוץ הכולל
מלא ואמין.

מסמך:
{redacted_document_text}
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": IEPExtraction,
        },
    )
    return json.loads(response.text)

# ---------------------------------------------------------------------------
# 4. End-to-end validation
# ---------------------------------------------------------------------------

def validate_extraction(raw: dict) -> IEPExtraction:
    """Validate a raw JSON dict (already produced by Vertex AI) against the schema."""
    return IEPExtraction.model_validate(raw)


def validate_pdf(pdf_path: str) -> IEPExtraction:
    """Full pipeline: PDF -> text -> redact -> Vertex AI -> validated IEPExtraction."""
    redaction_result = extract_and_redact(pdf_path)
    raw = call_vertex_ai(redaction_result.redacted_text)
    return validate_extraction(raw)


# ---------------------------------------------------------------------------
# 5. CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Extracted fields are Hebrew text; Windows consoles default stdout to a
    # codepage (e.g. cp1252) that can't encode Hebrew, so force UTF-8 here
    # rather than relying on the host's console configuration.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) != 2:
        print("Usage: python iep_schema.py path/to/document.pdf")
        sys.exit(1)

    try:
        result = validate_pdf(sys.argv[1])
        print(json.dumps(result.model_dump(mode="json"), ensure_ascii=False, indent=2))
    except ValidationError as e:
        print("Validation failed:")
        print(e)
        sys.exit(1)
    except NotImplementedError as e:
        print(e)
        sys.exit(1)