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

  it("marks the document failed (rather than leaving it stuck at 'processing') if persisting the extraction fails", async () => {
    const deps = buildDeps({
      supabase: {
        insertExtraction: vi.fn().mockRejectedValue(new Error("Supabase write failed")),
        updateDocumentStatus: vi.fn().mockResolvedValue(undefined),
      },
    });

    await processDocument("doc-1", deps);

    expect(deps.supabase.updateDocumentStatus).toHaveBeenCalledWith("failed", "Supabase write failed");
    expect(deps.sendWebhook).toHaveBeenCalledWith(
      { document_id: "doc-1", status: "failed", error: "Supabase write failed" },
      "https://example.com/hook",
      "secret"
    );
  });

  it("marks the document failed if the extraction is saved but the status update to 'done' fails", async () => {
    const deps = buildDeps({
      supabase: {
        insertExtraction: vi.fn().mockResolvedValue(undefined),
        updateDocumentStatus: vi
          .fn()
          .mockRejectedValueOnce(new Error("transient connectivity error"))
          .mockResolvedValueOnce(undefined),
      },
    });

    await processDocument("doc-1", deps);

    expect(deps.supabase.updateDocumentStatus).toHaveBeenNthCalledWith(1, "done");
    expect(deps.supabase.updateDocumentStatus).toHaveBeenNthCalledWith(2, "failed", "transient connectivity error");
    expect(deps.sendWebhook).toHaveBeenCalledWith(
      { document_id: "doc-1", status: "failed", error: "transient connectivity error" },
      "https://example.com/hook",
      "secret"
    );
  });

  it("does not touch document status on a webhook failure once the document is already durably 'done'", async () => {
    const deps = buildDeps({
      sendWebhook: vi.fn().mockRejectedValue(new Error("webhook endpoint unreachable")),
    });

    await expect(processDocument("doc-1", deps)).rejects.toThrow("webhook endpoint unreachable");
    expect(deps.supabase.updateDocumentStatus).toHaveBeenCalledTimes(1);
    expect(deps.supabase.updateDocumentStatus).toHaveBeenCalledWith("done");
  });
});
