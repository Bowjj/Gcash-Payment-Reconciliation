"use client";

import { useRef, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteVerificationRun } from "@/app/(app)/history/delete-action";
import { displayDate } from "@/lib/verification/review";
import type { RunListItem } from "@/lib/verification/run-list";

export function DeleteRunDialog({ run, disabled, onDeleted }: {
  run: RunListItem; disabled: boolean; onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await deleteVerificationRun({ workspaceId: run.business_id, runId: run.id });
      if (!response.success) { setError("Could not delete verification run."); return; }
      setOpen(false);
      onDeleted(run.id);
    } catch {
      setError("Could not delete verification run.");
    } finally { setPending(false); }
  }
  return <AlertDialog.Root open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(null); } }}>
    <AlertDialog.Trigger render={<Button variant="ghost" className="min-h-11 gap-1.5 px-3 text-muted-foreground hover:bg-destructive/5 hover:text-destructive" disabled={disabled} />}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
      Delete
    </AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
      <AlertDialog.Popup initialFocus={cancel} className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-xl border bg-card p-5 text-card-foreground shadow-md">
        <AlertDialog.Title className="text-lg font-semibold tracking-tight">Delete Verification Run?</AlertDialog.Title>
        <AlertDialog.Description className="text-sm leading-relaxed text-muted-foreground">Permanently remove this run, its Payment and GCash records, reconciliation results, and manual-review audit history. This cannot be undone.</AlertDialog.Description>
        <dl className="space-y-2 border-y py-3 text-sm">
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">Payment file</dt><dd className="break-words [overflow-wrap:anywhere]">{run.payment_filename ?? "Unavailable"}</dd></div>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">GCash file</dt><dd className="break-words [overflow-wrap:anywhere]">{run.gcash_filename ?? "Unavailable"}</dd></div>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{run.completed_at ? "Verified on" : "Created on"}</dt><dd>{displayDate(run.completed_at ?? run.created_at)}</dd></div>
        </dl>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <AlertDialog.Close render={<Button ref={cancel} variant="outline" className="min-h-11 px-4" disabled={pending} />}>Cancel</AlertDialog.Close>
          <Button variant="destructive" className="min-h-11 px-4" disabled={pending} onClick={confirm}>{pending ? "Deleting…" : "Delete Verification"}</Button>
        </div>
      </AlertDialog.Popup>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
