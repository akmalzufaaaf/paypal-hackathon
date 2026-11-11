import {
  errorResponse,
  okResponse,
  parseMilestoneId,
  readOptionalJsonBody,
  requestTime,
} from "@/lib/api";
import { rerunPolicy } from "@/lib/workflow";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requestTime();
    const milestoneId = parseMilestoneId((await params).id);
    await readOptionalJsonBody(req);
    const { action } = await rerunPolicy(milestoneId);
    return await okResponse({ action });
  } catch (err) {
    return errorResponse(err);
  }
}
