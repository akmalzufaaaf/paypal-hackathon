import {
  errorResponse,
  okResponse,
  parseDeliverableBody,
  parseMilestoneId,
  readJsonBody,
  requestTime,
} from "@/lib/api";
import { submitDeliverable } from "@/lib/workflow";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requestTime();
    const milestoneId = parseMilestoneId((await params).id);
    const input = parseDeliverableBody(await readJsonBody(req));
    await submitDeliverable(milestoneId, input);
    return okResponse();
  } catch (err) {
    return errorResponse(err);
  }
}
