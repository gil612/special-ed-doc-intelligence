import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IEPExtraction } from "./extraction-schema";

export function createSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey);
}

export async function insertDocument(
  client: SupabaseClient,
  storagePath: string,
  originalFilename: string
): Promise<string> {
  const { data, error } = await client
    .from("documents")
    .insert({ storage_path: storagePath, original_filename: originalFilename })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function insertExtraction(
  client: SupabaseClient,
  documentId: string,
  extraction: IEPExtraction
): Promise<void> {
  const { error } = await client.from("extractions").insert({ document_id: documentId, ...extraction });
  if (error) throw error;
}

export async function updateDocumentStatus(
  client: SupabaseClient,
  documentId: string,
  status: "done" | "failed",
  errorMessage: string | null = null
): Promise<void> {
  const { error } = await client
    .from("documents")
    .update({ status, error_message: errorMessage })
    .eq("id", documentId);
  if (error) throw error;
}
