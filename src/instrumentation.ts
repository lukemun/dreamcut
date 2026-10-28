import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Without its own DSN, the server reports only while signed in to DreamCut (cloud-telemetry.ts).
    void import("./lib/observability/cloud-sentry-server").then(m => m.refreshServerCloudSentry())
      .catch(error => console.error("[cloud-telemetry] not started", error));
    // Keeps a signed-in creator's style in step with their DreamCut account while the editor runs.
    try { (await import("./lib/local-store/cloud-style-sync")).startStyleSyncLoop(); }
    catch (error) { console.error("[cloud-style-sync] not started", error); }
    try { (await import("./lib/local-store/editing-evidence-sync")).startEditingEvidenceSync(); }
    catch (error) { console.error("[editing-evidence-sync] not started", error); }
  }
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
