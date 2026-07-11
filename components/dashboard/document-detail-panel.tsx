import type { DocumentRow } from "@/lib/supabase";

const FIELD_LABELS = {
  student_id: "מזהה תלמיד",
  school_year: "שנת לימודים",
  disability_category: "קטגוריית ליקוי",
  placement_type: "סוג שיבוץ",
  weekly_support_hours: "שעות תמיכה שבועיות",
  review_date: "תאריך עדכון הבא",
} as const;

export function DocumentDetailPanel({ document }: { document: DocumentRow }) {
  return (
    <aside className="w-96 shrink-0 rounded border bg-white p-4">
      <h2 className="mb-3 font-semibold">{document.original_filename}</h2>

      {document.status === "processing" && <p className="text-slate-500">המסמך בעיבוד…</p>}

      {document.status === "failed" && (
        <p className="text-red-600">כשל בעיבוד: {document.error_message}</p>
      )}

      {document.status === "done" && document.extraction && (
        <dl className="space-y-2 text-sm">
          {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).map((field) => (
            <div key={field}>
              <dt className="font-medium text-slate-600">{FIELD_LABELS[field]}</dt>
              <dd>{document.extraction![field] ?? "—"}</dd>
            </div>
          ))}
          <div>
            <dt className="font-medium text-slate-600">יעדים</dt>
            <dd>
              <ul className="list-inside list-disc">
                {document.extraction.goals.map((goal, i) => (
                  <li key={i}>{goal}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">התאמות</dt>
            <dd>
              <ul className="list-inside list-disc">
                {document.extraction.accommodations.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">ביטחון</dt>
            <dd>{Math.round(document.extraction.confidence * 100)}%</dd>
          </div>
        </dl>
      )}
    </aside>
  );
}
