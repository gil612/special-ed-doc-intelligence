// Supabase's PostgrestError (and similar SDK error shapes) are plain objects,
// not real Error instances, so `error instanceof Error ? error.message :
// String(error)` silently produces "[object Object]" for them instead of the
// actual message - seen in production for a failed insertExtraction call.
// Duck-type on a string `.message` property as a fallback before giving up.
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}
