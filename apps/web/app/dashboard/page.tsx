import { Suspense } from "react";

import { DashboardApp } from "../../components/dashboard-app";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="loading-screen" aria-busy="true">
          <span className="spinner" /> Loading your workspace…
        </main>
      }
    >
      <DashboardApp />
    </Suspense>
  );
}
