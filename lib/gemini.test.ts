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
