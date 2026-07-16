import { describe, expect, it } from "vitest";
import { requireApiKey } from "./require-api-key";

function makeRequest(headerValue?: string): Request {
  const headers = new Headers();
  if (headerValue !== undefined) headers.set("X-API-Key", headerValue);
  return new Request("https://example.com/api/documents", { headers });
}

describe("requireApiKey", () => {
  it("returns null when the header matches the configured key", () => {
    const result = requireApiKey(makeRequest("secret123"), { DOCUMENTS_API_KEY: "secret123" });
    expect(result).toBeNull();
  });

  it("returns a 401 Response when the header is missing", async () => {
    const result = requireApiKey(makeRequest(), { DOCUMENTS_API_KEY: "secret123" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    expect(await result!.json()).toEqual({ error: "unauthorized" });
  });

  it("returns a 401 Response when the header doesn't match", () => {
    const result = requireApiKey(makeRequest("wrong"), { DOCUMENTS_API_KEY: "secret123" });
    expect(result!.status).toBe(401);
  });

  it("returns a 401 Response (not a bypass) when DOCUMENTS_API_KEY is an empty string", () => {
    const result = requireApiKey(makeRequest(""), { DOCUMENTS_API_KEY: "" });
    expect(result!.status).toBe(401);
  });
});
