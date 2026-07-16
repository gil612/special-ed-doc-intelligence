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
          placement_type: "הכלה מלאה" as const,
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
