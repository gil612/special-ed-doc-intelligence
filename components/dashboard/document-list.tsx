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
  // from every previous version of this component.
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
        <div className="rounded-2xl border border-black/5 bg-white p-12 text-center shadow-sm">
          <span className="mb-3 block text-4xl">👋</span>
          <p className="text-ink-muted">עדיין אין מסמכים — העלו את הראשון למעלה</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <DocumentFilters value={filters} onChange={setFilters} />
      {filteredDocuments.length === 0 ? (
        <div className="rounded-2xl border border-black/5 bg-white p-12 text-center shadow-sm">
          <p className="text-ink-muted">אין מסמכים התואמים את הסינון הנוכחי</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredDocuments.map((doc) => {
            const isSelected = doc.id === selectedId;
            return (
              <div
                key={doc.id}
                className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : doc.id)}
                  className="flex w-full items-center justify-between gap-4 p-4 text-right text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                    {doc.original_filename}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-ink-muted">
                    {doc.status === "processing" && (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-black/10 border-t-accent" />
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
                      className={`border-t border-black/5 p-4 pt-4 transition-opacity duration-200 ${
                        isSelected ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <DocumentDetailPanel document={doc} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
