"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveManualReview } from "@/app/(app)/verification/[runId]/payments/[paymentId]/actions";

export function ManualReviewForm({ workspaceId, runId, paymentId, revision, status }: {
  workspaceId: string; runId: string; paymentId: string; revision: number; status: "VERIFIED" | "NEEDS_REVIEW";
}) {
  const [state, action, pending] = useActionState(saveManualReview, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="runId" value={runId} />
    <input type="hidden" name="paymentId" value={paymentId} /><input type="hidden" name="revision" value={revision} />
    <div>
      <label htmlFor="manual-status" className="block text-sm font-medium">Manual decision</label>
      <select id="manual-status" name="status" defaultValue={status} className="mt-1 block w-full rounded-md border p-2" disabled={pending}>
        <option value="VERIFIED">Mark Verified</option><option value="NEEDS_REVIEW">Keep / Mark Needs Review</option>
      </select>
    </div>
    <label className="block text-sm font-medium">Manual note (optional)
      <textarea name="note" rows={3} maxLength={1000} className="mt-1 block w-full rounded-md border p-2" placeholder="What did you confirm?" disabled={pending} />
    </label>
    <p className="text-xs text-muted-foreground">Up to 1,000 characters. This changes the final status only; it does not select or attach a GCash transaction.</p>
    <Button disabled={pending} type="submit">{pending ? "Saving decision…" : "Save decision"}</Button>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state.success && <p role="status" className="text-sm">{state.success}</p>}
  </form>;
}
