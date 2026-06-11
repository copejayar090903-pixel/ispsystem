// app/api/mikrotik/test/route.js
import { NextResponse } from "next/server";
import { RouterOSAPI } from "node-routeros";

export async function GET() {
  const conn = new RouterOSAPI({
    host: process.env.MIKROTIK_HOST,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASS,
    port: Number(process.env.MIKROTIK_PORT),
    timeout: 10000,
  });

  try {
    await conn.connect();

    const identity = await conn.write("/system/identity/print");
    const active = await conn.write("/ppp/active/print");

    await conn.close();

    return NextResponse.json({
      success: true,
      message: "Connected to MikroTik successfully.",
      identity,
      active,
    });
  } catch (error) {
    try {
      await conn.close();
    } catch { }

    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      { status: 500 }
    );
  }
}