import {
  errorResponse,
  okResponse,
  parseMilestoneId,
  readJsonBody,
  requestTime,
  requireStringField,
} from "@/lib/api";
import { fundMilestone } from "@/lib/workflow";

export async function POST(req: Request) {
  try {
    await requestTime();
    const body = await readJsonBody(req);
    const milestoneId = parseMilestoneId(
      requireStringField(body, "milestoneId"),
    );
    const { orderId } = await fundMilestone(milestoneId);
    return await okResponse({ orderId });
  } catch (err) {
    return errorResponse(err);
  }
}
