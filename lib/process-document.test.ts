import { describe, expect, it, vi } from "vitest";
import { processDocument, type ProcessDocumentDeps } from "./process-document";
import type { GeminiClient } from "./gemini";

function buildDeps(overrides: Partial<ProcessDocumentDeps> = {}): ProcessDocumentDeps {
  return {
    fetchDocumentText: async () => "שם התלמיד/ה: נועם כהן. ת.ז. 123456782.",
    geminiClient: {
      extract: async () => ({
        student_id: "STU-0001",
        school_year: 'תשפ"ח',
        placement_type: "הכלה חלקית",
        review_date: "14/03/2028",
        confidence: 0.9,
      }),
    },
    supabase: {
      insertExtraction: vi.fn().mockResolvedValue(undefined),
      updateDocumentStatus: vi.fn().mockResolvedValue(undefined),
    },
    sendWebhook: vi.fn().mockResolvedValue(undefined),
    webhookUrl: "https://example.com/hook",
    webhookSecret: "secret",
    ...overrides,
  };
}

describe("processDocument", () => {
  it("on success: redacts, extracts, persists, and fires a 'done' webhook", async () => {
    const deps = buildDeps();
    await processDocument("doc-1", deps);

    expect(deps.supabase.insertExtraction).toHaveBeenCalledTimes(1);
    const [extraction] = (deps.supabase.insertExtraction as any).mock.calls[0];
    expect(extraction.review_date).toBe("2028-03-14");

    expect(deps.supabase.updateDocumentStatus).toHaveBeenCalledWith("done");
    expect(deps.sendWebhook).toHaveBeenCalledWith(
      { document_id: "doc-1", status: "done", confidence: 0.9 },
      "https://example.com/hook",
      "secret"
    );
  });

  it("never sends the raw unredacted text to the Gemini client", async () => {
    const extractSpy = vi.fn().mockResolvedValue({
      student_id: "STU-0001",
      school_year: 'תשפ"ח',
      placement_type: "הכלה חלקית",
      confidence: 0.9,
    });
    const deps = buildDeps({ geminiClient: { extract: extractSpy } });

    await processDocument("doc-1", deps);

    const [textSentToGemini] = extractSpy.mock.calls[0];
    expect(textSentToGemini).not.toContain("נועם כהן");
    expect(textSentToGemini).not.toContain("123456782");
  });

  it("on Gemini failure: marks the document failed and fires a 'failed' webhook", async () => {
    const deps = buildDeps({
      geminiClient: {
        extract: async () => {
          throw new Error("Gemini API unavailable");
        },
      },
    });

    await processDocument("doc-1", deps);

    expect(deps.supabase.updateDocumentStatus).toHaveBeenCalledWith("failed", "Gemini API unavailable");
    expect(deps.sendWebhook).toHaveBeenCalledWith(
      { document_id: "doc-1", status: "failed", error: "Gemini API unavailable" },
      "https://example.com/hook",
      "secret"
    );
    expect(deps.supabase.insertExtraction).not.toHaveBeenCalled();
  });

  it("on schema validation failure: marks the document failed with the validation error", async () => {
    const deps = buildDeps({
      geminiClient: { extract: async () => ({ school_year: 'תשפ"ח' }) }, // missing required fields
    });

    await processDocument("doc-1", deps);

    expect(deps.supabase.updateDocumentStatus).toHaveBeenCalledTimes(1);
    const [status, errorMessage] = (deps.supabase.updateDocumentStatus as any).mock.calls[0];
    expect(status).toBe("failed");
    expect(typeof errorMessage).toBe("string");
  });
});
