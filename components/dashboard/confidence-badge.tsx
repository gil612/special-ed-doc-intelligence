const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.5;

function badgeColorClasses(confidence: number): string {
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return "bg-green-100 text-green-800";
  if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeColorClasses(confidence)}`}
    >
      {Math.round(confidence * 100)}%
    </span>
  );
}
