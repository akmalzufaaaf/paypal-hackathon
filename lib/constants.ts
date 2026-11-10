export const DEMO = {
  budgetCapCents: 100000,
  autoPayLimitCents: 25000,
  passThreshold: 80,
};

export const MILESTONE1_CHECKLIST: string[] = [
  "At least two distinct primary logo concepts for the coffee startup brand",
  "A coffee cup motif incorporated into the main logo mark",
  "Editable vector source files delivered in SVG format",
  "A colour palette showing primary and secondary brand colours",
  "Stacked and horizontal lockup variations for light and dark backgrounds, plus a monochrome version",
];

export const MILESTONE2_CHECKLIST: string[] = [
  "Typography system with heading and body font pairings",
  "Business card and letterhead designs ready for print",
  "Social media templates for Instagram posts and stories",
  "Coffee bag packaging design using the new brand colours",
  "Brand guidelines document covering usage rules, spacing and tone of voice",
];

// Covers exactly 4 of the 5 Milestone-1 requirements by keyword (logo,
// coffee, SVG/vector, colour palette); the lockup-variations item is
// deliberately absent so the deterministic fallback scores it 80.
export const SAMPLE_DELIVERABLE_NOTE: string =
  "Hi Sarah, the primary logo concepts are ready: two distinct logo directions for the startup, each built around a coffee cup motif drawn into the main mark. I have attached the editable vector source files in SVG format, plus a colour palette sheet showing the primary and secondary brand colours. The cup motif and the palette work together across both directions, so pick your favourite and I will refine it from there. Thanks, Bima";
