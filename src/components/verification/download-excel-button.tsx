"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DownloadExcelButton({ runId }: { runId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/verification/${encodeURIComponent(runId)}/export`, { cache: "no-store" });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Export failed.");
      }
      if (!response.headers.get("content-type")?.includes("spreadsheetml.sheet")) throw new Error("Please sign in and reopen this verification before exporting.");
      const filename = /filename="([A-Za-z0-9_.-]+\.xlsx)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "Payment_Verification_Report.xlsx";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not download the report. Try again.");
    } finally { setPending(false); }
  }
  return <div className="space-y-2"><Button onClick={download} disabled={pending}>{pending ? "Preparing Excel Report…" : "Download Excel Report"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
