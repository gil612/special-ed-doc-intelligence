import type { DocumentRow } from "./supabase";

export interface Filters {
  dateFrom: string; // "YYYY-MM-DD", "" = no lower bound
  dateTo: string; // "YYYY-MM-DD", "" = no upper bound
  minConfidence: number; // 0-100, 0 = no filter
}

export const DEFAULT_FILTERS: Filters = { dateFrom: "", dateTo: "", minConfidence: 0 };

export function applyFilters(documents: DocumentRow[], filters: Filters): DocumentRow[] {
  return documents.filter((doc) => {
    const uploadedDate = doc.uploaded_at.slice(0, 10);
    if (filters.dateFrom && uploadedDate < filters.dateFrom) return false;
    if (filters.dateTo && uploadedDate > filters.dateTo) return false;

    const confidencePercent = doc.extraction ? doc.extraction.confidence * 100 : 0;
    if (filters.minConfidence > 0 && confidencePercent < filters.minConfidence) return false;

    return true;
  });
}
