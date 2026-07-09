export interface WebhookPayload {
  document_id: string;
  status: "done" | "failed";
  confidence?: number;
  error?: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(signature);
}

export async function sendWebhook(
  payload: WebhookPayload,
  webhookUrl: string | undefined,
  secret: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (!webhookUrl) return;

  const body = JSON.stringify(payload);
  const signature = secret ? await signPayload(body, secret) : "";

  await fetchImpl(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
    },
    body,
  });
}
