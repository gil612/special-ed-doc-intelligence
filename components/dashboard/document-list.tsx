"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentRow } from "@/lib/supabase";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "@/lib/document-filters";
import { DocumentDetailPanel } from "./document-detail-panel";
import { DocumentFilters } from "./document-filters";

const STATUS_LABELS: Record<DocumentRow["status"], string> = {
  processing: "בעיבוד",
  done: "הושלם",
  failed: "נכשל",
};

export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Deliberately computed from the raw `documents` prop, not the filtered
  // set: a processing row hidden by an active filter must still keep
  // polling, or it would never learn it settled to done/failed. Unchanged
  // from the previous DocumentTable.
  const hasProcessing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const intervalId = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(intervalId);
  }, [hasProcessing, router]);

  const filteredDocuments = applyFilters(documents, filters);

  return (
    <div>
      <DocumentFilters value={filters} onChange={setFilters} />
      <ul className="divide-y rounded border">
        {filteredDocuments.map((doc) => {
          const isSelected = doc.id === selectedId;
          return (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => setSelectedId(isSelected ? null : doc.id)}
                className="flex w-full items-center justify-between gap-4 p-3 text-right text-sm hover:bg-slate-50"
              >
                <span className="truncate">{doc.original_filename}</span>
                <span className="flex shrink-0 items-center gap-4 text-slate-600">
                  <span>{STATUS_LABELS[doc.status]}</span>
                  <span>{doc.extraction ? `${Math.round(doc.extraction.confidence * 100)}%` : "—"}</span>
                </span>
              </button>
              {isSelected && (
                <div className="border-t bg-slate-50 p-3">
                  <DocumentDetailPanel document={doc} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
