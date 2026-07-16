export function requireApiKey(
  request: Request,
  env: { DOCUMENTS_API_KEY: string }
): Response | null {
  // A misconfigured empty-string DOCUMENTS_API_KEY must not make an
  // equally-empty X-API-Key header pass the `!==` check below - fail
  // closed instead of silently bypassing auth.
  if (!env.DOCUMENTS_API_KEY || request.headers.get("X-API-Key") !== env.DOCUMENTS_API_KEY) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
