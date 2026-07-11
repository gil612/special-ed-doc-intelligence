import type { DocumentRow } from "@/lib/supabase";
import { ConfidenceBadge } from "./confidence-badge";

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
    <div className="w-full text-sm">
      {document.status === "processing" && (
        <p className="flex items-center gap-2 text-slate-500">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          המסמך בדרך אלינו…
        </p>
      )}

      {document.status === "failed" && (
        <p className="text-red-600">כשל בעיבוד: {document.error_message}</p>
      )}

      {document.status === "done" && document.extraction && (
        <div className="space-y-4">
          <p className="text-slate-800">{document.extraction.summary ?? "אין סיכום זמין"}</p>

          <dl className="space-y-2">
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
              <dd>
                <ConfidenceBadge confidence={document.extraction.confidence} />
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
