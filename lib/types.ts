export type ItemVerdict = {
  requirement: string;
  verdict: "pass" | "fail" | "unclear";
  evidence: string;
};

export type PolicyInput = {
  score: number;
  passThreshold: number;
  amountCents: number;
  autoPayLimitCents: number;
  capturedTotalCents: number;
  budgetCapCents: number;
};

export type MilestoneState =
  | "DRAFT"
  | "AUTHORIZED"
  | "DELIVERED"
  | "VERIFIED"
  | "ESCALATED"
  | "CAPTURED"
  | "RELEASED"
  | "VOIDED";
