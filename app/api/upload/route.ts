import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { handleUpload } from "@/lib/upload-document";
import { errorMessage } from "@/lib/error-message";
import { requireApiKey } from "@/lib/require-api-key";
import {
  createSupabaseClient,
  insertDocument,
  insertExtraction,
  updateDocumentStatus,
} from "@/lib/supabase";

export async function POST(request: Request): Promise<Response> {
  const { env, ctx } = getCloudflareContext();

  const authError = requireApiKey(request, env);
  if (authError) return authError;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.type !== "application/pdf") {
    return Response.json({ error: "multipart field 'file' (application/pdf) is required" }, { status: 400 });
  }

  const fileBuffer = await file.arrayBuffer();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  let documentId: string;
  try {
    ({ documentId } = await handleUpload(fileBuffer, file.name, {
      putObject: (key, body) => env.DOCS_BUCKET.put(key, body).then(() => undefined),
      insertDocument: (storagePath, originalFilename) =>
        insertDocument(supabase, storagePath, originalFilename),
      geminiApiKey: env.GEMINI_API_KEY,
      insertExtraction: (documentId, extraction) => insertExtraction(supabase, documentId, extraction),
      updateDocumentStatus: (documentId, status, errorMessage) =>
        updateDocumentStatus(supabase, documentId, status, errorMessage ?? null),
      webhookUrl: env.WEBHOOK_URL,
      webhookSecret: env.WEBHOOK_SECRET,
      waitUntil: ctx.waitUntil.bind(ctx),
    }));
  } catch (error) {
    return Response.json({ error: `failed to store document: ${errorMessage(error)}` }, { status: 503 });
  }

  return Response.json({ document_id: documentId, status: "processing" }, { status: 202 });
}
