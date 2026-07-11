import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { IEPExtractionSchema, PlacementType, type IEPExtraction } from "./extraction-schema";

// Constrains Gemini's JSON output to this exact shape, in addition to the
// prompt's field descriptions. Without this, the model is only guided by
// prompt text and occasionally emits syntactically invalid JSON (seen in
// practice on harder/mixed-language documents) - IEPExtractionSchema.parse()
// below is still the authoritative validator regardless.
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

export interface GeminiClient {
  extract(redactedText: string): Promise<unknown>;
}

export function createGeminiClient(apiKey: string): GeminiClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async extract(redactedText: string): Promise<unknown> {
      const response = await ai.models.generateContent({
        // "gemini-2.5-flash" is listed by the API but rejects generateContent
        // calls with a 404 ("no longer available") - it's being decommissioned.
        // Both "gemini-flash-latest" and "gemini-flash-lite-latest" were tried
        // next, but their quota-exceeded error messages explicitly showed
        // "model: gemini-2.5-flash" - i.e. both aliases currently resolve
        // server-side to the same being-decommissioned model, not a stable
        // replacement. "gemini-3.1-flash-lite" is a specific, non-aliased
        // model from a newer generation - verified with 4 consecutive
        // successful direct API calls, not assumed.
        model: "gemini-3.1-flash-lite",
        contents: buildExtractionPrompt(redactedText),
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      if (response.text === undefined) {
        throw new Error("Gemini response contained no text");
      }
      return JSON.parse(response.text);
    },
  };
}

export async function extractIEP(redactedText: string, client: GeminiClient): Promise<IEPExtraction> {
  const raw = await client.extract(redactedText);
  return IEPExtractionSchema.parse(raw);
}
