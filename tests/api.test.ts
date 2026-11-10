import { describe, expect, it } from "vitest";

import {
  BadRequestError,
  mapError,
  parseDeliverableBody,
  parseMilestoneId,
  parsePolicyBody,
} from "../lib/api";
import { PayPalError } from "../lib/paypal";
import { InvalidTransitionError, PolicyBlocked } from "../lib/workflow";

describe("mapError", () => {
  it("maps PayPalError to 502 with its readable message", () => {
    const err = new PayPalError(
      "MISSING_CREDENTIALS",
      "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set",
      0,
    );
    expect(mapError(err)).toEqual({
      status: 502,
      error: "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set",
    });
  });

  it("maps a PayPal NETWORK_ERROR to 502 with the readable cause", () => {
    const err = new PayPalError(
      "NETWORK_ERROR",
      "PayPal request failed: fetch failed",
      0,
    );
    expect(mapError(err)).toEqual({
      status: 502,
      error: "PayPal request failed: fetch failed",
    });
  });

  it("maps workflow state/validation errors to 400", () => {
    expect(mapError(new InvalidTransitionError("bad transition")).status).toBe(400);
    expect(mapError(new PolicyBlocked("over cap")).status).toBe(400);
    expect(mapError(new Error("milestone not found: nope")).status).toBe(400);
    expect(mapError(new Error("invalid policy value for passThreshold: 101")).status).toBe(400);
    expect(mapError(new BadRequestError("missing field")).status).toBe(400);
  });

  it("maps anything else to a generic 500 without leaking details", () => {
    const mapped = mapError(new Error("boom PAYPAL_CLIENT_SECRET=hunter2"));
    expect(mapped.status).toBe(500);
    expect(mapped.error).toBe("Internal server error");
    expect(mapped.error).not.toContain("hunter2");
  });
});

describe("parseMilestoneId", () => {
  it("accepts the seeded string ids", () => {
    expect(parseMilestoneId("milestone-1")).toBe("milestone-1");
    expect(parseMilestoneId("milestone-2")).toBe("milestone-2");
  });

  it("rejects malformed ids", () => {
    for (const bad of ["", "bad/id", "bad id", "../x", 42, null]) {
      expect(() => parseMilestoneId(bad)).toThrow(BadRequestError);
    }
  });
});

describe("parseDeliverableBody", () => {
  it("requires at least one of note/link/extractedText non-empty", () => {
    expect(() => parseDeliverableBody({})).toThrow(BadRequestError);
    expect(() => parseDeliverableBody({ note: "  " })).toThrow(BadRequestError);
    expect(parseDeliverableBody({ link: "https://example.com/x" }).note).toBe("");
    expect(parseDeliverableBody({ note: "hi" }).note).toBe("hi");
  });

  it("rejects non-string fields", () => {
    expect(() => parseDeliverableBody({ note: 1 })).toThrow(BadRequestError);
  });
});

describe("parsePolicyBody", () => {
  it("requires at least one numeric policy field", () => {
    expect(() => parsePolicyBody({})).toThrow(BadRequestError);
    expect(() => parsePolicyBody({ passThreshold: "80" })).toThrow(BadRequestError);
    expect(parsePolicyBody({ passThreshold: 90 })).toEqual({ passThreshold: 90 });
  });
});
