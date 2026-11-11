import {
  errorResponse,
  okResponse,
  parseMilestoneId,
  readJsonBody,
  requestTime,
  requireStringField,
} from "@/lib/api";
import { confirmAuthorization } from "@/lib/workflow";

export async function POST(req: Request) {
  try {
    await requestTime();
    const body = await readJsonBody(req);
    const milestoneId = parseMilestoneId(
      requireStringField(body, "milestoneId"),
    );
    const orderId = requireStringField(body, "orderId");
    await confirmAuthorization(milestoneId, orderId);
    return await okResponse();
  } catch (err) {
    return errorResponse(err);
  }
}
