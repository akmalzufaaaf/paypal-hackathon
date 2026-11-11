import type { ReactNode } from "react";

import AppProvider from "@/components/AppProvider";
import AppShell from "@/components/AppShell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
