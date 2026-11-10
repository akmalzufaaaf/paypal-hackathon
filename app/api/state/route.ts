import { NextResponse } from "next/server";

import { errorResponse, requestTime } from "@/lib/api";
import { getState } from "@/lib/repo";

export async function GET() {
  try {
    await requestTime();
    return NextResponse.json(getState());
  } catch (err) {
    return errorResponse(err);
  }
}
