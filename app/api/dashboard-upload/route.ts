import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { handleUpload } from "@/lib/upload-document";
import { errorMessage } from "@/lib/error-message";
import {
  createSupabaseClient,
  insertDocument,
  insertExtraction,
  updateDocumentStatus,
} from "@/lib/supabase";

// Called by the dashboard's own upload form via a plain fetch(), not a
// Server Action. Next.js Server Actions send a distinctive request (a
// Next-Action header + specific multipart encoding) that Cloudflare's
// automatic workers.dev-shared-domain protection blocked for a large
// real-world scanned PDF, even though the exact same file uploads fine
// through /api/upload - confirmed the file itself wasn't the problem.
// This route exists to give the dashboard an upload path with an
// ordinary fetch/form-POST shape instead.
//
// No X-API-Key is required (unlike /api/upload, the public REST
// endpoint) since the browser can't hold that secret safely. Instead,
// this checks the Origin header matches this deployment - the same
// protection Server Actions provide internally - so a scanner/bot
// hitting this URL directly (without a page's JS setting a matching
// Origin) gets rejected rather than silently accepted.
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("Origin");
  const expectedOrigin = new URL(request.url).origin;
  if (origin !== expectedOrigin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { env, ctx } = getCloudflareContext();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.type !== "application/pdf") {
    return Response.json({ error: "יש לבחור קובץ PDF בלבד" }, { status: 400 });
  }

  const fileBuffer = await file.arrayBuffer();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { documentId } = await handleUpload(fileBuffer, file.name, {
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
    });
    return Response.json({ document_id: documentId, status: "processing" }, { status: 202 });
  } catch (error) {
    return Response.json({ error: `העלאה נכשלה: ${errorMessage(error)}` }, { status: 503 });
  }
}
