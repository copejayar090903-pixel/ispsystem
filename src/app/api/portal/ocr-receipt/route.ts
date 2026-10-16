import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import path from "path";

export const runtime = "nodejs";

// Max 10MB
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let worker: any = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Please upload a receipt image." }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Receipt image exceeds 10MB limit." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workerPath = path.resolve(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js");
    worker = await createWorker("eng", 1, { workerPath, cachePath: process.cwd(), gzip: false });
    const ret = await worker.recognize(buffer);
    const rawText = ret.data?.text || "";

    // ─── 1. Extract Amount ──────────────────────────────────────────────────
    let amount: number | null = null;
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
        // Fallback: any standalone currency amount like ₱700 or £700.00
        const genericAmountMatch = rawText.match(/[£P₱p]\s*([\d,]+(?:\.\d{1,2})?)/);
        if (genericAmountMatch) {
          amount = parseFloat(genericAmountMatch[1].replace(/,/g, ""));
        }
      }
    }

    // ─── 2. Extract Reference Number ────────────────────────────────────────
    let referenceNumber: string | null = null;
    const refMatch = rawText.match(/Ref(?:\s*No|\s*Number|\.|\#)?\.?:?\s*([0-9\s]{8,25})/i);
    if (refMatch) {
      referenceNumber = refMatch[1].trim();
    }

    // ─── 3. Extract Date ────────────────────────────────────────────────────
    let dateStr: string | null = null;
    const dateMatch = rawText.match(
      /([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?)/i
    );
    if (dateMatch) {
      dateStr = dateMatch[1].trim();
    } else {
      // Fallback: MM/DD/YYYY or DD/MM/YYYY
      const slashDate = rawText.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)\b/);
      if (slashDate) {
        dateStr = slashDate[1].trim();
      }
    }

    // ─── 4. Extract Name / Recipient / Sender ───────────────────────────────
    let customerName: string | null = null;
    const lines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);
    const expressSendIdx = lines.findIndex((l: string) => /Express Send|Sent to|To\b/i.test(l));
    if (expressSendIdx !== -1 && lines[expressSendIdx + 1]) {
      const candidate = lines[expressSendIdx + 1].replace(/[e\*\.]{3,}/g, "•••").trim();
      if (candidate.length >= 2 && !/^\+?\d+$/.test(candidate)) {
        customerName = candidate;
      }
    }

    return NextResponse.json({
      success: true,
      amount,
      referenceNumber,
      date: dateStr,
      customerName,
      rawText,
    });
  } catch (error) {
    console.error("[ocr-receipt] Error recognizing image:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scan receipt image." },
      { status: 500 }
    );
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
