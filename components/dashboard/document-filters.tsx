"use client";

import type { Filters } from "@/lib/document-filters";

export function DocumentFilters({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (filters: Filters) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-4 text-sm">
      <label className="flex flex-col gap-1">
        מתאריך
        <input
          type="date"
          value={value.dateFrom}
          onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
          className="rounded border p-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        עד תאריך
        <input
          type="date"
          value={value.dateTo}
          onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
          className="rounded border p-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        ביטחון מינימלי ({value.minConfidence}%)
        <input
          type="range"
          min={0}
          max={100}
          value={value.minConfidence}
          onChange={(e) => onChange({ ...value, minConfidence: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
