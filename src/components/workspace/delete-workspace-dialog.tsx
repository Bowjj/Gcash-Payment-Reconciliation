"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteWorkspace } from "@/app/(app)/settings/delete-workspace-action";

export function DeleteWorkspaceDialog({ workspace }: { workspace: { id: string; name: string } }) {
  const router = useRouter();
  const cancel = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    if (pending || step !== 2 || name !== workspace.name) return;
    setPending(true); setError(null);
    try {
      const response = await deleteWorkspace({ workspaceId: workspace.id, confirmation: name });
      if (!response.success) { setError(response.error); setPending(false); return; }
      setOpen(false);
      router.replace("/dashboard?workspaceDeleted=1");
      router.refresh();
    } catch { setError("Could not delete workspace. Please try again."); setPending(false); }
  }
  return <section aria-labelledby="danger-zone-title" className="space-y-4 rounded-xl border border-destructive/25 bg-card p-5 sm:p-6">
    <div><h2 id="danger-zone-title" className="font-semibold">Danger Zone</h2>
      <p className="mt-1 text-sm text-muted-foreground">Active workspace: <strong className="break-words text-foreground [overflow-wrap:anywhere]">{workspace.name}</strong></p></div>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="max-w-xl text-sm text-muted-foreground">Permanently delete this workspace and all its verification records. Your account and other workspaces will remain.</p>
      <AlertDialog.Root open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setStep(1); setName(""); setError(null); } }}>
        <AlertDialog.Trigger render={<Button variant="destructive" className="min-h-11 px-4" />}>Delete Workspace</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Popup initialFocus={cancel} className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-xl border bg-card p-5 text-card-foreground shadow-md">
            <AlertDialog.Title className="text-lg font-semibold">Delete Workspace?</AlertDialog.Title>
            <AlertDialog.Description className="text-sm leading-relaxed text-muted-foreground">Delete <strong className="break-words text-foreground [overflow-wrap:anywhere]">{workspace.name}</strong> and all data owned by it. This action cannot be undone.</AlertDialog.Description>
            {step === 1 ? <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>All verification runs and imported Payment/GCash records</li>
              <li>Reconciliation results, manual reviews, and run audit history</li>
              <li>Saved source workbooks and workspace memberships</li>
            </ul> : <div className="space-y-2 text-sm">
              <label htmlFor="confirm-workspace-name" className="block font-medium">Type workspace name exactly</label>
              <p className="break-words [overflow-wrap:anywhere]">{workspace.name}</p>
              <input ref={input} id="confirm-workspace-name" autoComplete="off" spellCheck={false} value={name} disabled={pending}
                onChange={(event) => setName(event.target.value)} className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3" />
            </div>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialog.Close render={<Button ref={cancel} variant="outline" disabled={pending} className="min-h-11 px-4" />}>Cancel</AlertDialog.Close>
              {step === 1 ? <Button variant="outline" className="min-h-11 px-4" onClick={() => { setStep(2); requestAnimationFrame(() => input.current?.focus()); }}>Continue</Button>
                : <Button variant="destructive" className="min-h-11 max-w-full whitespace-normal px-4" disabled={pending || name !== workspace.name} onClick={confirm}>{pending ? "Deleting…" : "Delete Workspace Permanently"}</Button>}
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  </section>;
}
