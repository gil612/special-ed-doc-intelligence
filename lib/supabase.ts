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

export interface DocumentRow {
  id: string;
  storage_path: string;
  original_filename: string;
  status: "processing" | "done" | "failed";
  error_message: string | null;
  uploaded_at: string;
  extraction: IEPExtraction | null;
}

// `extractions` is embedded via Supabase's relationship detection (the FK
// extractions.document_id -> documents.id in supabase/schema.sql). Since
// that FK isn't marked UNIQUE, PostgREST returns it as an array even
// though there's at most one extraction per document in practice - take
// the first element explicitly rather than relying on any single-object
// embedding syntax.
export async function listDocumentsWithExtractions(client: SupabaseClient): Promise<DocumentRow[]> {
  const { data, error } = await client
    .from("documents")
    .select("id, storage_path, original_filename, status, error_message, uploaded_at, extractions(*)")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const rawExtraction = Array.isArray(row.extractions) && row.extractions.length > 0 ? row.extractions[0] : null;
    const extraction: IEPExtraction | null = rawExtraction
      ? {
          student_id: rawExtraction.student_id,
          school_year: rawExtraction.school_year,
          disability_category: rawExtraction.disability_category,
          placement_type: rawExtraction.placement_type,
          weekly_support_hours: rawExtraction.weekly_support_hours,
          goals: rawExtraction.goals,
          review_date: rawExtraction.review_date,
          accommodations: rawExtraction.accommodations,
          confidence: rawExtraction.confidence,
        }
      : null;

    return {
      id: row.id,
      storage_path: row.storage_path,
      original_filename: row.original_filename,
      status: row.status,
      error_message: row.error_message,
      uploaded_at: row.uploaded_at,
      extraction,
    };
  });
}
