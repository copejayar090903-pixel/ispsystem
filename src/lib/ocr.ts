// Client & Server safe receipt parser & OCR runner for GCash, Maya, and Bank receipts

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
      const genericAmountMatch = rawText.match(/[£P₱p]\s*([\d,]+(?:\.\d{1,2})?)/);
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
 * High-performance browser client OCR with strict timeout.
 * Runs entirely in the user's browser via WebAssembly — no server needed, works on Vercel!
 *
 * Uses explicit CDN paths so Tesseract.js v7 loads correctly in production
 * without needing node_modules on the server.
 */
export async function scanReceiptClient(
  file: File,
  timeoutMs = 30000
): Promise<ParsedReceipt> {
  let worker: any = null;

  const runOcr = async (): Promise<ParsedReceipt> => {
    // Dynamic import to avoid SSR issues
    const { createWorker } = await import("tesseract.js");

    // Explicit CDN paths ensure this works on Vercel where node_modules
    // aren't available at runtime and cold-start CDN downloads are needed.
    worker = await createWorker("eng", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/worker.min.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core-simd-lstm.wasm.js",
      cacheMethod: "none",
    });

    const ret = await worker.recognize(file);
    const parsed = parseReceiptText(ret.data?.text || "");
    return parsed;
  };

  const timeoutPromise = new Promise<ParsedReceipt>((_, reject) => {
    setTimeout(() => {
      reject(new Error("OCR scan timed out."));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([runOcr(), timeoutPromise]);
    return result;
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
 * Client-side only scan function (Vercel-safe):
 * Runs Tesseract.js WASM entirely in the user's browser.
 * Never contacts the server — no Lambda timeouts, no node_modules dependency.
 * Never throws; always returns a safe ParsedReceipt so the UI NEVER hangs.
 */
export async function scanReceiptSafe(file: File): Promise<ParsedReceipt> {
  // Only run in browser — SSR guard
  if (typeof window === "undefined") {
    return {
      success: false,
      amount: null,
      referenceNumber: null,
      date: null,
      customerName: null,
      error: "OCR is only available in the browser.",
    };
  }

  try {
    const result = await scanReceiptClient(file, 30000);
    return result;
  } catch (err) {
    console.warn("[OCR]:", err);
    return {
      success: false,
      amount: null,
      referenceNumber: null,
      date: null,
      customerName: null,
      error: "Could not auto-read receipt. Please fill in details manually.",
    };
  }
}
