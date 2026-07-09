import { describe, expect, it } from "vitest";
import { redactText, summarizeRedaction } from "./redact";

describe("redactText", () => {
  it("redacts a labeled student name", () => {
    const result = redactText("שם התלמיד/ה: נועם כהן, פרטים נוספים בהמשך.");
    expect(result.redactedText).toContain("שם התלמיד/ה: [REDACTED_NAME]");
    expect(result.redactedText).not.toContain("נועם כהן");
    expect(result.matches).toEqual([{ kind: "labeled_name", original: "נועם כהן" }]);
  });

  it("redacts a valid Israeli ID with ת.ז. context", () => {
    const result = redactText("ת.ז. 123456782 של ההורה");
    expect(result.redactedText).toBe("ת.ז. [REDACTED_ID] של ההורה");
    expect(result.matches).toEqual([{ kind: "israeli_id", original: "123456782" }]);
  });

  it("does not redact a bare 9-digit number that fails the Israeli ID checksum", () => {
    const result = redactText("מספר סמל מוסד: 440495 ומספר נוסף 111111111");
    expect(result.redactedText).toContain("111111111");
    expect(result.matches).toEqual([]);
  });

  it("redacts a phone number", () => {
    const result = redactText("ניתן להתקשר ל-050-1234567 בכל עת.");
    expect(result.redactedText).toBe("ניתן להתקשר ל-[REDACTED_PHONE] בכל עת.");
    expect(result.matches).toEqual([{ kind: "phone", original: "050-1234567" }]);
  });

  it("redacts an email address", () => {
    const result = redactText("ניתן לפנות באימייל parent@example.com לפרטים.");
    expect(result.redactedText).toBe("ניתן לפנות באימייל [REDACTED_EMAIL] לפרטים.");
    expect(result.matches).toEqual([{ kind: "email", original: "parent@example.com" }]);
  });

  it("fully redacts a hyphenated local part and a multi-label domain", () => {
    const result = redactText("אפשר גם באימייל cohen-noa@school.education.co.il לתיאום.");
    expect(result.redactedText).toBe("אפשר גם באימייל [REDACTED_EMAIL] לתיאום.");
    expect(result.matches).toEqual([
      { kind: "email", original: "cohen-noa@school.education.co.il" },
    ]);
  });

  it("redacts an unlabeled free-text name gated on a known first name", () => {
    const result = redactText("התלמיד איתי לוי נמצא באותה כיתה.");
    expect(result.redactedText).toBe("התלמיד [REDACTED_NAME] נמצא באותה כיתה.");
    expect(result.matches).toEqual([{ kind: "free_name", original: "איתי לוי" }]);
  });

  it("matches the full combined sample from redaction.py's __main__ block", () => {
    const sample =
      "שם התלמיד/ה: נועם כהן, ת.ז. 123456782. " +
      "ניתן ליצור קשר עם ההורים בטלפון 050-1234567 או במייל parent@example.com. " +
      "התלמיד איתי לוי נמצא באותה כיתה. מספר סמל מוסד: 440495.";
    const result = redactText(sample);
    expect(result.redactedText).toBe(
      "שם התלמיד/ה: [REDACTED_NAME], ת.ז. [REDACTED_ID]. " +
        "ניתן ליצור קשר עם ההורים בטלפון [REDACTED_PHONE] או במייל [REDACTED_EMAIL]. " +
        "התלמיד [REDACTED_NAME] נמצא באותה כיתה. מספר סמל מוסד: 440495."
    );
    expect(summarizeRedaction(result)).toBe(
      "labeled_name=1, israeli_id=1, phone=1, email=1, free_name=1"
    );
  });

  it("reports 'no PII detected' when nothing matches", () => {
    const result = redactText("מסמך ללא מידע מזהה כלל.");
    expect(summarizeRedaction(result)).toBe("no PII detected");
  });
});
