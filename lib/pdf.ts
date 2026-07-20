import { extractText, getDocumentProxy } from "unpdf";
import { fixReversedHebrew } from "./hebrew-bidi";

export async function extractPdfText(fileBuffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(fileBuffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return fixReversedHebrew(text);
}
