import {
  errorResponse,
  okResponse,
  parsePolicyBody,
  readJsonBody,
  requestTime,
} from "@/lib/api";
import { updatePolicy } from "@/lib/workflow";

export async function PATCH(req: Request) {
  try {
    await requestTime();
    const patch = parsePolicyBody(await readJsonBody(req));
    await updatePolicy(patch);
    return okResponse();
  } catch (err) {
    return errorResponse(err);
  }
}
