import { NextResponse } from "next/server";

import { errorResponse, requestTime } from "@/lib/api";

/**
 * Public runtime config for the browser. The PayPal Client ID is a public
 * app identifier (not a secret), so the server can hand it to the JS SDK
 * at runtime. This keeps funding working on hosts where env vars only
 * exist at runtime (e.g. Docker/Hugging Face Spaces), where a
 * NEXT_PUBLIC_* build-time value would be missing.
 */
export async function GET() {
  try {
    await requestTime();
    const paypalClientId =
      process.env.PAYPAL_CLIENT_ID?.trim() ||
      process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ||
      null;
    return NextResponse.json({ paypalClientId });
  } catch (err) {
    return errorResponse(err);
  }
}
