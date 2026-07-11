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

  it("normalizes a DD.MM.YYYY review_date to ISO", () => {
    const result = IEPExtractionSchema.parse(validExtraction({ review_date: "14.03.2028" }));
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
