"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { errorMessage } from "@/lib/error-message";
import { createSupabaseClient, deleteDocumentRow } from "@/lib/supabase";

// Note: document upload is deliberately NOT a Server Action - see
// app/api/dashboard-upload/route.ts for why (Cloudflare's workers.dev
// protection flagged the Server Action request shape for a large
// real-world file). Delete stays a Server Action since it has no such
// history and doesn't need to change.
export type DeleteActionResult = { success: true } | { success: false; error: string };

export async function deleteDocument(documentId: string, storagePath: string): Promise<DeleteActionResult> {
  const { env } = getCloudflareContext();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    await deleteDocumentRow(supabase, documentId);
  } catch (error) {
    return { success: false, error: `מחיקה נכשלה: ${errorMessage(error)}` };
  }

  // Best-effort: an orphaned R2 object is low-harm and invisible to users
  // (nothing in the UI reads R2 directly), so a storage-delete failure
  // here must not undo the fact that the document row - the thing the
  // user actually asked to remove - is already gone.
  try {
    await env.DOCS_BUCKET.delete(storagePath);
  } catch {
    // ignore
  }

  revalidatePath("/");
  return { success: true };
}
