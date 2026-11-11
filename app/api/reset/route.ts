import {
  errorResponse,
  okResponse,
  readOptionalJsonBody,
  requestTime,
} from "@/lib/api";
import { resetDemoFlow } from "@/lib/workflow";

export async function POST(req: Request) {
  try {
    await requestTime();
    await readOptionalJsonBody(req);
    await resetDemoFlow();
    return await okResponse();
  } catch (err) {
    return errorResponse(err);
  }
}
