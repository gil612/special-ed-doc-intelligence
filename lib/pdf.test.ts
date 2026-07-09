import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdf";

describe("extractPdfText", () => {
  it("extracts non-empty Hebrew text from the sample IEP decision", async () => {
    const bytes = readFileSync(resolve(__dirname, "..", "sample_iep_decision.pdf"));
    const text = await extractPdfText(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("ועדת");
  });
});
