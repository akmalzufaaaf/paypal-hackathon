import type { MilestoneState } from "./types";

const ALLOWED_TRANSITIONS: ReadonlySet<string> = new Set([
  "DRAFT->AUTHORIZED",
  "AUTHORIZED->DELIVERED",
  "DELIVERED->VERIFIED",
  "VERIFIED->CAPTURED",
  "VERIFIED->ESCALATED",
  "ESCALATED->CAPTURED",
  "CAPTURED->RELEASED",
  "VERIFIED->VOIDED",
  "ESCALATED->VOIDED",
]);

export function canTransition(
  from: MilestoneState,
  to: MilestoneState,
): boolean {
  return ALLOWED_TRANSITIONS.has(`${from}->${to}`);
}
