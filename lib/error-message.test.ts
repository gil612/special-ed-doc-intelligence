import { describe, expect, it } from "vitest";
import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("extracts the message from a real Error instance", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("extracts the message from a Supabase-PostgrestError-shaped plain object (not a real Error)", () => {
    const fakePostgrestError = {
      message: 'null value in column "school_year" violates not-null constraint',
      details: "...",
      hint: null,
      code: "23502",
    };
    expect(errorMessage(fakePostgrestError)).toBe(
      'null value in column "school_year" violates not-null constraint'
    );
  });

  it("falls back to String() for a value with no usable message", () => {
    expect(errorMessage({ code: "23502" })).toBe("[object Object]");
    expect(errorMessage("already a string")).toBe("already a string");
    expect(errorMessage(42)).toBe("42");
  });
});
