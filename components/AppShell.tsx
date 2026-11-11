"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useApp } from "./AppProvider";
import {
  ActivityIcon,
  DashboardIcon,
  LogoutIcon,
  MilestonesIcon,
  ProfileIcon,
  ShieldIcon,
} from "./icons";
import { clearSession, initials } from "./session";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/milestones", label: "Milestones", Icon: MilestonesIcon },
  { href: "/activity", label: "Activity", Icon: ActivityIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/milestones") {
    return pathname === "/milestones" || pathname.startsWith("/milestones/");
  }
  return pathname === href;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { session, actionError, clearActionError } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/dashboard" className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span>
            <strong>Rilis</strong>
            <small>Freelancer Money Agent</small>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={isActive(pathname, href) ? "nav-link active" : "nav-link"}
              aria-current={isActive(pathname, href) ? "page" : undefined}
            >
              <Icon className="nav-icon" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-trust">
          <ShieldIcon className="trust-icon" />
          <p>
            PayPal sandbox only. Payouts in the ledger are{" "}
            <strong>Simulated payout</strong>.
          </p>
        </div>

        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {initials(session.name)}
          </span>
          <span className="sidebar-user-meta">
            <strong>{session.name}</strong>
            <small>
              {session.role === "client" ? "Client" : "Freelancer"} ·{" "}
              {session.location}
            </small>
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={logout}
            aria-label="Log out"
            title="Log out"
          >
            <LogoutIcon className="nav-icon" />
          </button>
        </div>
      </aside>

      <div className="workspace-body">
        <header className="mobile-topbar">
          <Link href="/dashboard" className="sidebar-brand compact">
            <span className="brand-mark" aria-hidden="true">
              R
            </span>
            <strong>Rilis</strong>
          </Link>
          <span className="sandbox-badge">Sandbox</span>
        </header>

        {actionError ? (
          <div className="alert global-alert" role="alert">
            <span>{actionError}</span>
            <button
              type="button"
              className="btn ghost small-btn"
              onClick={clearActionError}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {children}

        <nav className="bottom-nav" aria-label="Mobile navigation">
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={isActive(pathname, href) ? "nav-link active" : "nav-link"}
              aria-current={isActive(pathname, href) ? "page" : undefined}
            >
              <Icon className="nav-icon" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
