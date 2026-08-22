import { createHmac } from "crypto";

/**
 * Generate an HMAC-SHA256 token for email action links (approve/reject).
 * Uses CRON_SECRET as the signing key so no new env vars are needed.
 */
export function generateEmailActionToken(paymentId: string): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET is not configured — cannot sign email action links.");
  }
  return createHmac("sha256", secret).update(paymentId).digest("hex");
}

/**
 * Verify an email action token against the expected payment ID.
 * Returns true if the token is valid.
 */
export function verifyEmailActionToken(paymentId: string, token: string): boolean {
  try {
    const expected = generateEmailActionToken(paymentId);
    // Constant-time comparison to prevent timing attacks
    if (expected.length !== token.length) return false;
    let result = 0;
    for (let i = 0; i < expected.length; i++) {
      result |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return result === 0;
  } catch {
    return false;
  }
}
