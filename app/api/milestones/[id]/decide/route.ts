import {
  errorResponse,
  okResponse,
  parseMilestoneId,
  readOptionalJsonBody,
  requestTime,
} from "@/lib/api";
import { decide } from "@/lib/workflow";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requestTime();
    const milestoneId = parseMilestoneId((await params).id);
    await readOptionalJsonBody(req);
    const { action } = await decide(milestoneId);
    return okResponse({ action });
  } catch (err) {
    return errorResponse(err);
  }
}
