import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { requireApiKey } from "@/lib/require-api-key";
import { createSupabaseClient, listDocumentsWithExtractions } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";

export async function GET(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();

  const authError = requireApiKey(request, env);
  if (authError) return authError;

  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const documents = await listDocumentsWithExtractions(supabase);
    return Response.json(documents);
  } catch (error) {
    return Response.json({ error: `failed to list documents: ${errorMessage(error)}` }, { status: 503 });
  }
}
