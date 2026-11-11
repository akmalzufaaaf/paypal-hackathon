"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { loadDemoState, type DemoState } from "./demo-client";
import {
  getSessionRaw,
  parseSession,
  type SessionUser,
} from "./session";

interface AppContextValue {
  session: SessionUser;
  state: DemoState | null;
  loadError: string | null;
  actionError: string | null;
  busyKey: string | null;
  clearActionError: () => void;
  retryLoad: () => void;
  runMutation: (key: string, fn: () => Promise<DemoState>) => Promise<boolean>;
  applyFundingState: (next: DemoState) => void;
  reportFundingError: (message: string) => void;
  fundingPendingChange: (pending: boolean) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const emptySubscribe = () => () => {};

export default function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Session lives in localStorage; useSyncExternalStore keeps SSR output
  // (loading) consistent with the first client render.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const sessionRaw = useSyncExternalStore(
    emptySubscribe,
    getSessionRaw,
    () => null,
  );
  const session = useMemo(() => parseSession(sessionRaw), [sessionRaw]);
  const [state, setState] = useState<DemoState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (mounted && !session) router.replace("/login");
  }, [mounted, session, router]);

  useEffect(() => {
    if (!mounted || !session) return;
    let cancelled = false;
    loadDemoState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(messageOf(err));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, mounted, session]);

  // One global mutation lock for every mutating path (API mutations and
  // PayPal funding). `busyRef` blocks re-entry synchronously (before React
  // re-renders disabled controls), and `seqRef` tags the lock owner: only
  // the current owner's response may replace state or clear the lock, so a
  // late response from a superseded call can never overwrite newer state.
  const busyRef = useRef(false);
  const seqRef = useRef(0);
  const fundingSeqRef = useRef<number | null>(null);

  const acquireLock = useCallback((key: string): number | null => {
    if (busyRef.current) return null;
    busyRef.current = true;
    const seq = ++seqRef.current;
    setBusyKey(key);
    return seq;
  }, []);

  const releaseLock = useCallback((seq: number): void => {
    if (seq !== seqRef.current) return;
    busyRef.current = false;
    setBusyKey(null);
  }, []);

  const applyState = useCallback((next: DemoState, seq: number): boolean => {
    if (seq !== seqRef.current) return false;
    setState(next);
    return true;
  }, []);

  const runMutation = useCallback(
    async (key: string, fn: () => Promise<DemoState>): Promise<boolean> => {
      const seq = acquireLock(key);
      if (seq === null) return false; // another mutation already owns the lock
      setActionError(null);
      try {
        const next = await fn();
        return applyState(next, seq);
      } catch (err) {
        if (seq === seqRef.current) setActionError(messageOf(err));
        return false;
      } finally {
        releaseLock(seq);
      }
    },
    [acquireLock, applyState, releaseLock],
  );

  // PayPal create-order/authorize pending is tracked through the same lock:
  // FundingButton reports each in-flight call, and only a state delivered
  // while that funding sequence still owns the lock is applied.
  const fundingPendingChange = useCallback(
    (pending: boolean): boolean => {
      if (pending) {
        if (fundingSeqRef.current !== null) return false; // already in flight
        const seq = acquireLock("funding");
        if (seq === null) return false;
        fundingSeqRef.current = seq;
        return true;
      }
      const seq = fundingSeqRef.current;
      fundingSeqRef.current = null;
      if (seq !== null) releaseLock(seq);
      return true;
    },
    [acquireLock, releaseLock],
  );

  const applyFundingState = useCallback(
    (next: DemoState): void => {
      const seq = fundingSeqRef.current;
      if (seq === null) return; // stale funding callback — no longer tracked
      setActionError(null);
      applyState(next, seq);
    },
    [applyState],
  );

  if (!mounted) {
    return (
      <main className="panel loading-panel standalone-loading">
        <p>Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="panel loading-panel standalone-loading">
        <p>Redirecting to login…</p>
      </main>
    );
  }

  const value: AppContextValue = {
    session,
    state,
    loadError,
    actionError,
    busyKey,
    clearActionError: () => setActionError(null),
    retryLoad: () => {
      setLoadError(null);
      setReloadKey((key) => key + 1);
    },
    runMutation,
    applyFundingState,
    reportFundingError: (message) => setActionError(message),
    fundingPendingChange,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
