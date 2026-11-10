import {
  errorResponse,
  okResponse,
  parseMilestoneId,
  readOptionalJsonBody,
  requestTime,
} from "@/lib/api";
import { rejectVoid } from "@/lib/workflow";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requestTime();
    const milestoneId = parseMilestoneId((await params).id);
    await readOptionalJsonBody(req);
    await rejectVoid(milestoneId);
    return okResponse();
  } catch (err) {
    return errorResponse(err);
  }
}
