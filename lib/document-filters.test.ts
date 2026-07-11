import { describe, expect, it } from "vitest";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "./document-filters";
import type { DocumentRow } from "./supabase";

function buildDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: "doc-1",
    storage_path: "documents/doc-1.pdf",
    original_filename: "sample.pdf",
    status: "done",
    error_message: null,
    uploaded_at: "2028-03-14T10:00:00.000Z",
    extraction: {
      student_id: null,
      school_year: 'תשפ"ח',
      disability_category: null,
      placement_type: "הכלה חלקית",
      weekly_support_hours: null,
      goals: [],
      review_date: null,
      accommodations: [],
      confidence: 0.9,
    },
    ...overrides,
  };
}

describe("applyFilters", () => {
  it("returns all documents when filters are at defaults", () => {
    const docs = [buildDoc()];
    expect(applyFilters(docs, DEFAULT_FILTERS)).toEqual(docs);
  });

  it("excludes documents uploaded before dateFrom", () => {
    const docs = [buildDoc({ uploaded_at: "2028-01-01T00:00:00.000Z" })];
    const filters: Filters = { ...DEFAULT_FILTERS, dateFrom: "2028-02-01" };
    expect(applyFilters(docs, filters)).toEqual([]);
  });

  it("excludes documents uploaded after dateTo", () => {
    const docs = [buildDoc({ uploaded_at: "2028-05-01T00:00:00.000Z" })];
    const filters: Filters = { ...DEFAULT_FILTERS, dateTo: "2028-02-01" };
    expect(applyFilters(docs, filters)).toEqual([]);
  });

  it("excludes documents below the minimum confidence", () => {
    const doc = buildDoc();
    const docs = [{ ...doc, extraction: { ...doc.extraction!, confidence: 0.5 } }];
    const filters: Filters = { ...DEFAULT_FILTERS, minConfidence: 60 };
    expect(applyFilters(docs, filters)).toEqual([]);
  });

  it("treats a document with no extraction yet as 0% confidence", () => {
    const docs = [buildDoc({ status: "processing", extraction: null })];
    const filters: Filters = { ...DEFAULT_FILTERS, minConfidence: 1 };
    expect(applyFilters(docs, filters)).toEqual([]);
  });
});
