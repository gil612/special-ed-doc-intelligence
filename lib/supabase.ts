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

export async function deleteDocumentRow(client: SupabaseClient, documentId: string): Promise<void> {
  const { error } = await client.from("documents").delete().eq("id", documentId);
  if (error) throw error;
}

// See lib/sweep-stale-processing.ts for why this exists: a document stuck
// at "processing" past a generous threshold almost certainly hit the
// platform's background-execution ceiling, not a transient blip.
export async function findStaleProcessingDocumentIds(
  client: SupabaseClient,
  thresholdMinutes: number
): Promise<string[]> {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000).toISOString();
  const { data, error } = await client
    .from("documents")
    .select("id")
    .eq("status", "processing")
    .lt("uploaded_at", cutoff);
  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
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

interface RawExtractionRow {
  student_id: string | null;
  school_year: string;
  disability_category: string | null;
  placement_type: "הכלה מלאה" | "הכלה חלקית" | 'כיתה מיוחדת בבי"ס רגיל' | "חינוך מיוחד נפרד";
  weekly_support_hours: number | null;
  goals: string[];
  review_date: string | null;
  accommodations: string[];
  confidence: number;
  summary: string | null;
}

interface RawDocumentRow {
  id: string;
  storage_path: string;
  original_filename: string;
  status: "processing" | "done" | "failed";
  error_message: string | null;
  uploaded_at: string;
  extractions: RawExtractionRow[] | RawExtractionRow | null;
}

// `extractions` is embedded via Supabase's relationship detection (the FK
// extractions.document_id -> documents.id in supabase/schema.sql). Since
// that FK isn't marked UNIQUE, PostgREST returns it as an array even
// though there's at most one extraction per document in practice - take
// the first element explicitly rather than relying on any single-object
// embedding syntax.
export function mapRowToDocument(row: RawDocumentRow): DocumentRow {
  const rawExtraction = Array.isArray(row.extractions) ? row.extractions[0] ?? null : row.extractions;
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
        summary: rawExtraction.summary,
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
}

export async function listDocumentsWithExtractions(client: SupabaseClient): Promise<DocumentRow[]> {
  const { data, error } = await client
    .from("documents")
    .select("id, storage_path, original_filename, status, error_message, uploaded_at, extractions(*)")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => mapRowToDocument(row));
}

export async function getDocumentWithExtraction(
  client: SupabaseClient,
  id: string
): Promise<DocumentRow | null> {
  const { data, error } = await client
    .from("documents")
    .select("id, storage_path, original_filename, status, error_message, uploaded_at, extractions(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapRowToDocument(data as any);
}
