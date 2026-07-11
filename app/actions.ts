"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { handleUpload } from "@/lib/upload-document";
import {
  createSupabaseClient,
  insertDocument,
  insertExtraction,
  updateDocumentStatus,
} from "@/lib/supabase";

export type UploadActionResult =
  | { success: true; documentId: string }
  | { success: false; error: string };

export async function uploadDocument(formData: FormData): Promise<UploadActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return { success: false, error: "יש לבחור קובץ PDF בלבד" };
  }

  const { env, ctx } = getCloudflareContext();
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
    revalidatePath("/");
    return { success: true, documentId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `העלאה נכשלה: ${message}` };
  }
}
