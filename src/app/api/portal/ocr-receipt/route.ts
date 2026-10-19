import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import path from "path";
import os from "os";
import fs from "fs";
import { parseReceiptText } from "@/src/lib/ocr";

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

    const localWorker = path.resolve(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js");
    const workerOptions: any = { cachePath: os.tmpdir(), gzip: false };
    if (fs.existsSync(localWorker)) {
      workerOptions.workerPath = localWorker;
    }

    const timeoutPromise = new Promise<{ data?: { text: string } }>((_, reject) => {
      setTimeout(() => reject(new Error("OCR timeout")), 6500);
    });

    worker = await createWorker("eng", 1, workerOptions);
    const ret: any = await Promise.race([
      worker.recognize(buffer),
      timeoutPromise,
    ]);

    const parsed = parseReceiptText(ret?.data?.text || "");
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.warn("[ocr-receipt] Error:", error?.message);
    return NextResponse.json({
      success: false,
      amount: null,
      referenceNumber: null,
      date: null,
      customerName: null,
      error: "Could not auto-read receipt. Please fill in details manually.",
    });
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
