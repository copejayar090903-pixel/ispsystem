/**
 * PayMongo server-side helper.
 *
 * Docs: https://developers.paymongo.com/reference/create-a-payment-link
 * Auth: HTTP Basic – secret key as username, empty password, Base64-encoded.
 */

const PAYMONGO_BASE = "https://api.paymongo.com/v1";

/** Return the Basic Auth header value for the configured secret key. */
function authHeader(): string {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey || secretKey.includes("REPLACE_ME")) {
    throw new Error(
      "PAYMONGO_SECRET_KEY is not configured in .env. Please replace 'sk_test_REPLACE_ME' with your actual PayMongo Secret Key from https://dashboard.paymongo.com/developers"
    );
  }
  return "Basic " + Buffer.from(`${secretKey.trim()}:`).toString("base64");
}

// ---------------------------------------------------------------------------
// Payment Links
// ---------------------------------------------------------------------------

export interface CreatePaymentLinkOptions {
  /** Amount in PHP pesos (will be converted to centavos internally). */
  amountPHP: number;
  description: string;
  /** Arbitrary key-value pairs stored on the link for webhook correlation. */
  metadata?: Record<string, string>;
  /** URL PayMongo redirects the customer to on successful payment. */
  successUrl?: string;
  /** URL PayMongo redirects the customer to if they cancel. */
  cancelUrl?: string;
}

export interface PaymentLinkResponse {
  id: string;
  checkout_url: string;
  reference_number: string;
  status: string;
}

/** Create a PayMongo Payment Link and return the hosted checkout URL. */
export async function createPaymentLink(
  options: CreatePaymentLinkOptions
): Promise<PaymentLinkResponse> {
  const { amountPHP, description, metadata = {}, successUrl, cancelUrl } = options;

  const body = {
    data: {
      attributes: {
        amount: Math.round(amountPHP * 100), // PHP → centavos
        currency: "PHP",
        description,
        metadata,
        ...(successUrl ? { success_url: successUrl } : {}),
        ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
      },
    },
  };

  const res = await fetch(`${PAYMONGO_BASE}/links`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const firstErr = (errBody as any)?.errors?.[0];
    let detail = firstErr?.detail ?? `HTTP ${res.status}`;
    if (res.status === 401 || String(firstErr?.detail).includes("Received non-200 response: 404")) {
      detail = "Invalid PayMongo Secret Key. Please verify that your PAYMONGO_SECRET_KEY in .env is a valid PayMongo secret key.";
    }
    throw new Error(`PayMongo: failed to create payment link – ${detail}`);
  }

  const json = (await res.json()) as {
    data: { id: string; attributes: { checkout_url: string; reference_number: string; status: string } };
  };

  return {
    id: json.data.id,
    checkout_url: json.data.attributes.checkout_url,
    reference_number: json.data.attributes.reference_number,
    status: json.data.attributes.status,
  };
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify a PayMongo webhook signature.
 *
 * PayMongo sends `paymongo-signature` header in the format:
 *   `t=<timestamp>,te=<test_sig>,li=<live_sig>`
 *
 * We compute HMAC-SHA256 of `<timestamp>.<rawBody>` and compare against the
 * appropriate signature component.
 *
 * @returns `true` if valid, `false` otherwise.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string
): boolean {
  try {
    // Parse header: t=...,te=...,li=...
    const parts: Record<string, string> = {};
    for (const part of signatureHeader.split(",")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx !== -1) {
        parts[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
      }
    }

    const timestamp = parts["t"];
    // Use test sig for test keys, live sig for live keys
    const secretKey = process.env.PAYMONGO_SECRET_KEY ?? "";
    const sig = secretKey.startsWith("sk_live_") ? parts["li"] : parts["te"];

    if (!timestamp || !sig) return false;

    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = createHmac("sha256", webhookSecret)
      .update(signedPayload)
      .digest("hex");

    // Constant-time comparison to prevent timing attacks
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");

    if (expectedBuf.length !== sigBuf.length) return false;
    return timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}
