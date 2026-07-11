import { describe, expect, it, vi } from "vitest";
import { sweepStaleProcessingDocuments, STALE_PROCESSING_MESSAGE } from "./sweep-stale-processing";

describe("sweepStaleProcessingDocuments", () => {
  it("marks every stale-processing document as failed with a clear message", async () => {
    const updateDocumentStatus = vi.fn().mockResolvedValue(undefined);
    const deps = {
      findStaleProcessingDocumentIds: async () => ["doc-1", "doc-2"],
      updateDocumentStatus,
    };

    const result = await sweepStaleProcessingDocuments(deps);

    expect(result.sweptCount).toBe(2);
    expect(updateDocumentStatus).toHaveBeenNthCalledWith(1, "doc-1", "failed", STALE_PROCESSING_MESSAGE);
    expect(updateDocumentStatus).toHaveBeenNthCalledWith(2, "doc-2", "failed", STALE_PROCESSING_MESSAGE);
  });

  it("does nothing when there are no stale documents", async () => {
    const updateDocumentStatus = vi.fn();
    const deps = {
      findStaleProcessingDocumentIds: async () => [],
      updateDocumentStatus,
    };

    const result = await sweepStaleProcessingDocuments(deps);

    expect(result.sweptCount).toBe(0);
    expect(updateDocumentStatus).not.toHaveBeenCalled();
  });
});
