import { describe, expect, it, vi } from "vitest";
import { handleUpload, type UploadDocumentDeps } from "./upload-document";

function buildDeps(overrides: Partial<UploadDocumentDeps> = {}): UploadDocumentDeps {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    insertDocument: vi.fn().mockResolvedValue("doc-1"),
    geminiApiKey: "test-key",
    insertExtraction: vi.fn().mockResolvedValue(undefined),
    updateDocumentStatus: vi.fn().mockResolvedValue(undefined),
    webhookUrl: undefined,
    webhookSecret: undefined,
    waitUntil: vi.fn(),
    ...overrides,
  };
}

describe("handleUpload", () => {
  it("stores the file, inserts the document row, and kicks off background processing", async () => {
    const deps = buildDeps();
    const fileBuffer = new TextEncoder().encode("fake pdf bytes").buffer;

    const result = await handleUpload(fileBuffer, "sample.pdf", deps);

    expect(result).toEqual({ documentId: "doc-1" });
    expect(deps.putObject).toHaveBeenCalledTimes(1);
    const [storagePath, body] = (deps.putObject as any).mock.calls[0];
    expect(storagePath).toMatch(/^documents\/[0-9a-f-]+\.pdf$/);
    expect(body).toBe(fileBuffer);
    expect(deps.insertDocument).toHaveBeenCalledWith(storagePath, "sample.pdf");
    expect(deps.waitUntil).toHaveBeenCalledTimes(1);
  });

  it("propagates a storage failure without inserting a document row or starting processing", async () => {
    const deps = buildDeps({ putObject: vi.fn().mockRejectedValue(new Error("R2 unavailable")) });

    await expect(handleUpload(new ArrayBuffer(0), "sample.pdf", deps)).rejects.toThrow("R2 unavailable");
    expect(deps.insertDocument).not.toHaveBeenCalled();
    expect(deps.waitUntil).not.toHaveBeenCalled();
  });

  it("propagates a database failure without starting processing", async () => {
    const deps = buildDeps({ insertDocument: vi.fn().mockRejectedValue(new Error("DB unavailable")) });

    await expect(handleUpload(new ArrayBuffer(0), "sample.pdf", deps)).rejects.toThrow("DB unavailable");
    expect(deps.waitUntil).not.toHaveBeenCalled();
  });
});
