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
        // "gemini-2.5-flash" is listed by the API but rejects generateContent
        // calls with a 404 ("no longer available"). "gemini-flash-latest" is
        // Google's stable alias that always resolves to the current
        // recommended flash-tier model, avoiding this class of breakage.
        model: "gemini-flash-latest",
        contents: buildExtractionPrompt(redactedText),
        config: {
          responseMimeType: "application/json",
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
