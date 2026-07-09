import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { sendWebhook, signPayload, type WebhookPayload } from "./webhook";

describe("signPayload", () => {
  it("produces the same hex HMAC-SHA256 signature as Node's crypto module", async () => {
    const body = JSON.stringify({ document_id: "abc-123", status: "done", confidence: 0.87 });
    const secret = "test-secret";
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const actual = await signPayload(body, secret);
    expect(actual).toBe(expected);
  });
});

describe("sendWebhook", () => {
  const payload: WebhookPayload = { document_id: "abc-123", status: "done", confidence: 0.87 };

  it("does nothing when webhookUrl is unset", async () => {
    const fetchImpl = vi.fn();
    await sendWebhook(payload, undefined, "secret", fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs the signed payload when webhookUrl is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await sendWebhook(payload, "https://example.com/hook", "secret", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Webhook-Signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("sends an empty signature when secret is unset but webhookUrl is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await sendWebhook(payload, "https://example.com/hook", undefined, fetchImpl);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers["X-Webhook-Signature"]).toBe("");
  });
});
