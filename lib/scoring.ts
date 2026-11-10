import type { ItemVerdict } from "./types";

export function computeScore(items: ItemVerdict[]): number {
  if (items.length === 0) {
    return 0;
  }
  const passCount = items.filter((item) => item.verdict === "pass").length;
  return Math.round((100 * passCount) / items.length);
}
