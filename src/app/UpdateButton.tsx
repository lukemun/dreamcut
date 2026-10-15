"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Served by the local editor service (mcp/runtime-updates.mjs). Absent under `pnpm dev`, and
// never offered by the desktop shell, so the button only appears in the self-updating local web app.
const UPDATE_PATH = "/__dreamcut/update";
const HEALTH_PATH = "/__dreamcut/health";
const CHECK_MS = 10 * 60 * 1000;

export function UpdateButton() {
  const [available, setAvailable] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const check = useCallback(() => {
    fetch(UPDATE_PATH, { cache: "no-store" }).then(response => response.ok ? response.json() : null)
      .then((value: { available?: unknown } | null) => setAvailable(typeof value?.available === "string" ? value.available : null))
      .catch(() => {});
  }, []);
  useEffect(() => {
    check();
    const timer = window.setInterval(check, CHECK_MS);
    window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, [check]);
  const apply = async () => {
    if (!available) return;
    setUpdating(true);
    const response = await fetch(UPDATE_PATH, { method: "POST" }).catch(() => null);
    if (response?.status !== 202) {
      const error = await response?.json().then((value: { error?: string }) => value.error, () => undefined);
      toast.error(error === "busy" ? "DreamCut will update after the current export or analysis finishes." : "DreamCut could not update right now.");
      setUpdating(false);
      check();
      return;
    }
    // The editor restarts from the new version on this address; reload once it answers as that version.
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise(resolve => window.setTimeout(resolve, 750));
      const health = await fetch(HEALTH_PATH, { cache: "no-store" }).then(r => r.ok ? r.json() : null, () => null) as { version?: string } | null;
      if (health?.version === available) { window.location.reload(); return; }
    }
    toast.error("DreamCut did not come back after updating. Ask your agent to open DreamCut again.");
    setUpdating(false);
  };
  if (!available) return null;
  return <Button variant="secondary" size="sm" disabled={updating} onClick={() => void apply()} title={`Update to DreamCut ${available}`}>
    <RefreshCw className={updating ? "animate-spin" : undefined}/>{updating ? "Updating…" : "Update"}
  </Button>;
}
