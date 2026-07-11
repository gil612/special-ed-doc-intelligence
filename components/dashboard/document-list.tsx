"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentRow } from "@/lib/supabase";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "@/lib/document-filters";
import { DocumentDetailPanel } from "./document-detail-panel";
import { DocumentFilters } from "./document-filters";
import { ConfidenceBadge } from "./confidence-badge";

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
  // from the previous DocumentTable/DocumentList.
  const hasProcessing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const intervalId = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(intervalId);
  }, [hasProcessing, router]);

  const filteredDocuments = applyFilters(documents, filters);

  if (documents.length === 0) {
    return (
      <div>
        <DocumentFilters value={filters} onChange={setFilters} />
        <p className="rounded border p-6 text-center text-slate-500">
          עדיין אין מסמכים — העלו את הראשון למעלה 👋
        </p>
      </div>
    );
  }

  return (
    <div>
      <DocumentFilters value={filters} onChange={setFilters} />
      {filteredDocuments.length === 0 ? (
        <p className="rounded border p-6 text-center text-slate-500">
          אין מסמכים התואמים את הסינון הנוכחי
        </p>
      ) : (
        <ul className="divide-y rounded border">
          {filteredDocuments.map((doc) => {
            const isSelected = doc.id === selectedId;
            return (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : doc.id)}
                  className="flex w-full items-center justify-between gap-4 p-3 text-right text-sm transition-colors hover:bg-slate-50"
                >
                  <span className="truncate">{doc.original_filename}</span>
                  <span className="flex shrink-0 items-center gap-2 text-slate-600">
                    {doc.status === "processing" && (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                    )}
                    <span>{STATUS_LABELS[doc.status]}</span>
                    {doc.extraction ? (
                      <ConfidenceBadge confidence={doc.extraction.confidence} />
                    ) : (
                      <span>—</span>
                    )}
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ${
                    isSelected ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div
                      className={`border-t bg-slate-50 p-3 transition-opacity duration-200 ${
                        isSelected ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <DocumentDetailPanel document={doc} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
