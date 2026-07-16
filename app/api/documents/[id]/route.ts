import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { requireApiKey } from "@/lib/require-api-key";
import { createSupabaseClient, getDocumentWithExtraction } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { env } = getCloudflareContext();

  const authError = requireApiKey(request, env);
  if (authError) return authError;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const document = await getDocumentWithExtraction(supabase, id);
    if (!document) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json(document);
  } catch (error) {
    return Response.json({ error: `failed to fetch document: ${errorMessage(error)}` }, { status: 503 });
  }
}
