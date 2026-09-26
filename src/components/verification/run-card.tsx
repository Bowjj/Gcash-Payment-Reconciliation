import Link from "next/link";
import type { ReactNode } from "react";
import { displayDate } from "@/lib/verification/review";
import type { RunListItem } from "@/lib/verification/run-list";
import { statusStyles } from "./result-shared";

const runLabels = { queued: "Queued", running: "Processing", failed: "Failed", succeeded: "Completed" };

export function RunCard({ run, actions }: { run: RunListItem; actions?: ReactNode }) {
  const completed = run.status === "succeeded";
  const counts = [
    { label: "Total", count: run.total, style: "border-border bg-muted text-foreground" },
    { label: "Verified", count: run.verified, style: statusStyles.VERIFIED },
    { label: "Needs Review", count: run.needs_review, style: statusStyles.NEEDS_REVIEW },
    { label: "Cash", count: run.cash, style: statusStyles.CASH },
    { label: "Bank", count: run.bank, style: statusStyles.BANK },
  ];
  return <article aria-label={`Verification ${run.id.slice(0, 8)}`} className="grid min-w-0 gap-5 rounded-xl border bg-card p-5 text-card-foreground sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6">
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={run.completed_at ?? run.created_at}>{displayDate(run.completed_at ?? run.created_at)}</time>
        <span className={`rounded-md border px-2 py-1 ${run.status === "failed" ? "border-destructive/40 text-destructive" : "border-border"}`}>{runLabels[run.status]}</span>
      </div>
      <dl className="space-y-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">Payment records</dt><dd className="break-words font-medium [overflow-wrap:anywhere]">{run.payment_filename ?? "Payment filename unavailable"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">GCash statement</dt><dd className="break-words [overflow-wrap:anywhere]">{run.gcash_filename ?? "GCash filename unavailable"}</dd></div>
      </dl>
    </div>
    {completed ? <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Final results</p>
      <dl aria-label="Run result counts" className="flex flex-wrap gap-2">
        {counts.map((item) => <div key={item.label} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${item.style}`}>
          <dt className="order-2">{item.label}</dt><dd className="order-1 font-semibold tabular-nums">{item.count}</dd>
        </div>)}
      </dl>
    </div> : <p className="text-sm text-muted-foreground">{run.status === "failed" ? "This verification did not complete." : "Results are available after verification completes."}</p>}
    <div className="flex flex-wrap items-center gap-2 lg:justify-self-start">
      {completed ? <Link className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        href={`/verification/${run.id}`}>View Results</Link>
        : <span className="text-sm font-medium text-muted-foreground">{runLabels[run.status]}</span>}
      {actions}
    </div>
  </article>;
}
