"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ShieldIcon, WalletIcon } from "@/components/icons";
import JourneyStepper from "@/components/JourneyStepper";
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  initials,
  setSession,
  type SessionUser,
} from "@/components/session";

export default function LoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState<SessionUser>(DEMO_ACCOUNTS[0]);
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function pickAccount(next: SessionUser) {
    setAccount(next);
    setEmail(next.email);
    setError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim().toLowerCase() !== account.email) {
      setError(`That email does not match the ${account.name} demo account.`);
      return;
    }
    if (password !== DEMO_PASSWORD) {
      setError("Wrong password — use the demo password shown below.");
      return;
    }
    setError(null);
    setSubmitting(true);
    // Brief pause so the button's loading state is visible (form feedback).
    window.setTimeout(() => {
      setSession(account);
      router.replace("/dashboard");
    }, 450);
  }

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="About Rilis">
        <div className="login-brand-inner">
          <span className="brand-mark large" aria-hidden="true">
            R
          </span>
          <h1>Rilis</h1>
          <p className="login-tagline">
            The freelancer money agent. PayPal holds the money, AI checks the
            work, policy decides the payment.
          </p>
          <div className="login-journey" aria-hidden="true">
            <JourneyStepper state="DELIVERED" />
          </div>
          <ul className="login-points">
            <li>
              <WalletIcon className="nav-icon" />
              Real PayPal sandbox authorization holds — money reserved, not paid
            </li>
            <li>
              <ShieldIcon className="nav-icon" />
              The AI advises. Deterministic policy disposes: capture, escalate,
              or void
            </li>
          </ul>
        </div>
      </section>

      <section className="login-form-wrap" aria-label="Sign in">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Welcome back</h2>
          <p className="muted">
            Sign in with a seeded demo account. No registration, no real money.
          </p>

          <fieldset className="account-picker">
            <legend>Choose an account</legend>
            <div className="account-options">
              {DEMO_ACCOUNTS.map((candidate) => (
                <button
                  key={candidate.email}
                  type="button"
                  className={
                    candidate.email === account.email
                      ? "account-option selected"
                      : "account-option"
                  }
                  aria-pressed={candidate.email === account.email}
                  onClick={() => pickAccount(candidate)}
                >
                  <span className="avatar" aria-hidden="true">
                    {initials(candidate.name)}
                  </span>
                  <span>
                    <strong>{candidate.name}</strong>
                    <small>
                      {candidate.role === "client" ? "Client" : "Freelancer"} ·{" "}
                      {candidate.location}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Demo password"
              required
            />
          </label>

          <p className="hint">
            Demo password for both accounts: <strong>{DEMO_PASSWORD}</strong>
          </p>

          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="btn primary login-submit"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : `Sign in as ${account.name}`}
          </button>

          <p className="muted small login-note">
            Demo login only — the session is stored in your browser and the
            PayPal flow runs entirely on the sandbox.
          </p>
        </form>
      </section>
    </main>
  );
}
