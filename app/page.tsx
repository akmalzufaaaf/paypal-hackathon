"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getSession } from "@/components/session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getSession() ? "/dashboard" : "/login");
  }, [router]);

  return (
    <main className="panel loading-panel standalone-loading">
      <p>Loading Rilis…</p>
    </main>
  );
}
