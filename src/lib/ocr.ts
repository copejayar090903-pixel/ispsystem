// Client-side receipt parser & OCR runner for GCash, Maya, and Bank receipts
// Designed to work reliably on Vercel — all OCR runs in the user's browser via WebAssembly

export type ParsedReceipt = {
  success: boolean;
  amount: number | null;
  referenceNumber: string | null;
  date: string | null;
  customerName: string | null;
  rawText?: string;
  error?: string;
};

/**
 * Pure regex parser to extract GCash / Maya receipt fields from raw OCR text
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
  let amount: number | null = null;

  // 1. Total Amount Sent / Amount
  const totalAmountMatch = rawText.match(
    /(?:Total\s*Amount\s*(?:Sent)?|Amount\s*Sent)\s*[:=]?\s*[£P₱p]?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  if (totalAmountMatch) {
    amount = parseFloat(totalAmountMatch[1].replace(/,/g, ""));
  } else {
    const amountMatch = rawText.match(/Amount\s*[:=]?\s*[£P₱p]?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(/,/g, ""));
    } else {
      const genericAmountMatch = rawText.match(/[£P₱p]\s*([\d,]+(?:\.\d{1,2})?)/)
      if (genericAmountMatch) {
        amount = parseFloat(genericAmountMatch[1].replace(/,/g, ""));
      }
    }
  }

  // 2. Reference Number
  let referenceNumber: string | null = null;
  const refMatch = rawText.match(/Ref(?:\s*No|\s*Number|\.|\#)?\.?:?\s*([0-9\s]{8,25})/i);
  if (refMatch) {
    referenceNumber = refMatch[1].trim();
  }

  // 3. Date
  let dateStr: string | null = null;
  const dateMatch = rawText.match(
    /([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?)/i
  );
  if (dateMatch) {
    dateStr = dateMatch[1].trim();
  } else {
    const slashDate = rawText.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)\b/);
    if (slashDate) {
      dateStr = slashDate[1].trim();
    }
  }

  // 4. Name / Recipient / Sender
  let customerName: string | null = null;
  const lines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const expressSendIdx = lines.findIndex((l: string) => /Express Send|Sent to|To\b/i.test(l));
  if (expressSendIdx !== -1 && lines[expressSendIdx + 1]) {
    const candidate = lines[expressSendIdx + 1].replace(/[e\*\.]{3,}/g, "•••").trim();
    if (candidate.length >= 2 && !/^\+?\d+$/.test(candidate)) {
      customerName = candidate;
    }
  }

  return {
    success: !!(amount || referenceNumber),
    amount,
    referenceNumber,
    date: dateStr,
    customerName,
    rawText,
  };
}

/**
 * Browser-only client OCR using tesseract.js v7 with explicit CDN paths.
 *
 * Why explicit CDN paths?
 * ─────────────────────
 * On Vercel (and other static-hosting / edge platforms), the Next.js bundler
 * does NOT include tesseract.js's WASM core or trained-data files in the
 * client bundle. By default tesseract.js tries to resolve paths relative to
 * the page origin, which fails on Vercel because those files don't exist
 * in the deployment.
 *
 * By pointing workerPath, corePath, and langPath to jsDelivr CDN, the browser
 * downloads the WASM engine and language data directly — works everywhere.
 */
export async function scanReceiptClient(
  file: File,
  timeoutMs = 15000
): Promise<ParsedReceipt> {
  let worker: any = null;

  const runOcr = async (): Promise<ParsedReceipt> => {
    // Dynamic import to avoid SSR issues
    const { createWorker } = await import("tesseract.js");

    console.log("[OCR] Creating tesseract.js worker with CDN paths...");

    worker = await createWorker("eng", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      gzip: true,
    });

    console.log("[OCR] Worker created, starting recognition...");
    const ret = await worker.recognize(file);
    const rawText = ret.data?.text || "";
    console.log("[OCR] Recognition complete, text length:", rawText.length);

    if (!rawText.trim()) {
      return {
        success: false,
        amount: null,
        referenceNumber: null,
        date: null,
        customerName: null,
        rawText: "",
        error: "OCR returned empty text. The image may be too blurry or not a receipt.",
      };
    }

    const parsed = parseReceiptText(rawText);
    return parsed;
  };

  const timeoutPromise = new Promise<ParsedReceipt>((_, reject) => {
    setTimeout(() => {
      reject(new Error("OCR scan timed out after " + (timeoutMs / 1000) + "s. Please fill in details manually."));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([runOcr(), timeoutPromise]);
    return result;
  } catch (err: any) {
    console.error("[OCR] Client error:", err?.message || err);
    return {
      success: false,
      amount: null,
      referenceNumber: null,
      date: null,
      customerName: null,
      error: err?.message || "OCR failed. Please fill in details manually.",
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        // ignore
      }
    }
  }
}

/**
 * Universal scan function — browser-only OCR.
 *
 * On Vercel, server-side Tesseract.js does NOT work (WASM binaries aren't
 * bundled into serverless functions, and the 10s timeout is too tight).
 * So this function uses ONLY client-side browser OCR.
 *
 * Never throws; always returns a safe ParsedReceipt so the UI NEVER hangs.
 */
export async function scanReceiptSafe(file: File): Promise<ParsedReceipt> {
  if (typeof window !== "undefined") {
    try {
      const clientResult = await scanReceiptClient(file, 15000);
      if (clientResult.success) {
        return clientResult;
      }
      // If OCR ran but didn't extract fields, still return the result
      // so the user sees a helpful message
      return clientResult;
    } catch (clientErr: any) {
      console.warn("[OCR Safe] Client OCR failed:", clientErr?.message || clientErr);
    }
  }

  // Final safe fallback
  return {
    success: false,
    amount: null,
    referenceNumber: null,
    date: null,
    customerName: null,
    error: "Could not auto-read receipt. Please fill in details manually.",
  };
}
