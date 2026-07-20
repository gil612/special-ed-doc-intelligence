import { describe, expect, it } from "vitest";
import { fixReversedHebrew } from "./hebrew-bidi";

describe("fixReversedHebrew", () => {
  it("un-reverses a real garbled accommodation phrase from a broken-encoding PDF", () => {
    const garbled = "ינושל ץוחו ינושל טסקטנוקב תולטמל תינמי די תופידע";
    expect(fixReversedHebrew(garbled)).toBe("עדיפות יד ימנית למטלות בקונטקסט לשוני וחוץ לשוני");
  });

  it("leaves correctly-ordered Hebrew text unchanged", () => {
    const correct = "הוועדה החליטה על שיבוץ מסוג כיתה מיוחדת בבי\"ס רגיל";
    expect(fixReversedHebrew(correct)).toBe(correct);
  });

  it("leaves digits and dates outside a Hebrew run untouched", () => {
    const correct = "תאריך הוועדה הבאה: 22/03/2027";
    expect(fixReversedHebrew(correct)).toBe(correct);
  });

  it("only reverses the affected line in multi-line text, not the whole document", () => {
    const text = "הוועדה החליטה על שיבוץ מסוג הכלה חלקית\nינושל ץוחו ינושל טסקטנוקב תולטמל תינמי די תופידע";
    const fixed = fixReversedHebrew(text);
    expect(fixed).toBe(
      "הוועדה החליטה על שיבוץ מסוג הכלה חלקית\nעדיפות יד ימנית למטלות בקונטקסט לשוני וחוץ לשוני"
    );
  });

  it("does not crash and returns the input unchanged for text with no final letters at all", () => {
    const ambiguous = "אבג דהו זחט";
    expect(fixReversedHebrew(ambiguous)).toBe(ambiguous);
  });

  it("handles empty input", () => {
    expect(fixReversedHebrew("")).toBe("");
  });
});
