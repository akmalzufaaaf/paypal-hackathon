import type { Role } from "./demo-client";

export interface SessionUser {
  role: Role;
  name: string;
  email: string;
  location: string;
}

const SESSION_KEY = "rilis-session";

/** Demo password shown on the login form. Demo only — not a real credential. */
export const DEMO_PASSWORD = "demo1234";

export const DEMO_ACCOUNTS: SessionUser[] = [
  {
    role: "client",
    name: "Sarah",
    email: "sarah@rilis.demo",
    location: "Austin, US",
  },
  {
    role: "freelancer",
    name: "Bima",
    email: "bima@rilis.demo",
    location: "Yogyakarta, ID",
  },
];

export function getSessionRaw(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function parseSession(raw: string | null): SessionUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (
      (parsed.role === "client" || parsed.role === "freelancer") &&
      typeof parsed.name === "string" &&
      typeof parsed.email === "string"
    ) {
      return parsed;
    }
  } catch {
    // corrupted storage — treat as logged out
  }
  return null;
}

export function getSession(): SessionUser | null {
  return parseSession(getSessionRaw());
}

export function setSession(user: SessionUser): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
