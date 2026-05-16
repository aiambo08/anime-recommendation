"use client";
/**
 * app/dashboard/page.tsx
 * ─────────────────────────────────────────────────────────────
 * /dashboard — Technical Analysis + Battle Royale views.
 *
 * This page is the primary analytical interface of the Nexus.
 * It renders the DashboardView (mode switcher) below the header.
 * Data flows from Zustand (populated via home-page or inline upload).
 */
import { motion } from "framer-motion";
import { NexusHeader }            from "@/components/NexusHeader";
import { DashboardView }          from "@/components/DashboardView";
import { DashboardUploadPanel }   from "@/components/DashboardUploadPanel";
import { NexusStatusOverlay }     from "@/components/NexusStatusOverlay";

export default function DashboardPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <NexusHeader />

      <main className="flex-1 px-6 py-10 mx-auto w-full max-w-screen-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {/* Page header */}
          <div className="mb-8">
            <p className="nt-label mb-2 text-knn">
              SYS://DASHBOARD &gt; ANALYTICAL_MODE &gt; ACTIVE
            </p>
            <h2 className="font-display text-3xl font-black uppercase tracking-[0.08em] text-nt-text md:text-4xl">
              <span className="text-glow-knn">Algorithm</span>{" "}
              <span className="text-nt-muted">Quadrants</span>
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm text-nt-muted">
              Technical visualisations and head-to-head comparison across all four
              recommendation engines.
            </p>
          </div>

          {/* ── Inline upload panel (auto-hides when all models loaded) ── */}
          <DashboardUploadPanel />

          {/* ── Main dashboard views ─────────────────────────────────── */}
          <DashboardView />
        </motion.div>
      </main>

      <footer className="border-t border-nt-border px-6 py-4 mt-8">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between">
          <span className="nt-label">ANIME RECOMMENDATION NEXUS © 2026</span>
          <span className="nt-label text-knn">NEURAL TERMINAL v1.0</span>
        </div>
      </footer>

      {/* ── Fixed debug status overlay (bottom-right) ───────────── */}
      <NexusStatusOverlay />
    </div>
  );
}

