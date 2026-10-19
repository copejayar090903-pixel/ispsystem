import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Server-side OCR endpoint — disabled on Vercel.
 *
 * Tesseract.js cannot run in Vercel Serverless Functions because:
 * 1. The WASM binaries and trained data (~5MB) are not bundled into the function
 * 2. The 10s timeout (free tier) is too tight for cold start + OCR processing
 * 3. The ephemeral filesystem doesn't support the cache/worker paths Tesseract needs
 *
 * All OCR now runs client-side in the user's browser via WebAssembly.
 * This route is kept as a stub so existing fetch calls don't 404.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({
    success: false,
    amount: null,
    referenceNumber: null,
    date: null,
    customerName: null,
    error: "Server-side OCR is not available. OCR runs in your browser instead.",
  });
}
