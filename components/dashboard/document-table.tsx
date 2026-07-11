"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentRow } from "@/lib/supabase";
import { DocumentDetailPanel } from "./document-detail-panel";

const STATUS_LABELS: Record<DocumentRow["status"], string> = {
  processing: "בעיבוד",
  done: "הושלם",
  failed: "נכשל",
};

export function DocumentTable({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = documents.find((doc) => doc.id === selectedId) ?? null;

  const hasProcessing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const intervalId = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(intervalId);
  }, [hasProcessing, router]);

  return (
    <div className="flex gap-6">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-right">
            <th className="p-2">קובץ</th>
            <th className="p-2">סטטוס</th>
            <th className="p-2">ביטחון</th>
            <th className="p-2">הועלה</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              onClick={() => setSelectedId(doc.id)}
              className={`cursor-pointer border-b hover:bg-slate-100 ${
                doc.id === selectedId ? "bg-slate-100" : ""
              }`}
            >
              <td className="p-2">{doc.original_filename}</td>
              <td className="p-2">{STATUS_LABELS[doc.status]}</td>
              <td className="p-2">
                {doc.extraction ? `${Math.round(doc.extraction.confidence * 100)}%` : "—"}
              </td>
              <td className="p-2">{new Date(doc.uploaded_at).toLocaleString("he-IL")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && <DocumentDetailPanel document={selected} />}
    </div>
  );
}
