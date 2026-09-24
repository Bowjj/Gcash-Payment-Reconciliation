import Link from "next/link";
import { proofHref, statusLabels } from "@/lib/verification/review";
import type { ReconciliationStatus } from "@/lib/verification/reconcile";
import type { RunSummary } from "@/lib/verification/results-data";

const statusStyles: Record<ReconciliationStatus, string> = {
  VERIFIED: "border-green-200 bg-green-50 text-green-800",
  NEEDS_REVIEW: "border-orange-200 bg-orange-50 text-orange-800",
  CASH: "border-border bg-muted text-foreground",
  BANK: "border-blue-200 bg-blue-50 text-blue-800",
};
export function ResultStatus({ status, manual = false }: { status: ReconciliationStatus; manual?: boolean }) {
  return <span className={`inline-flex flex-wrap gap-1 rounded-md border px-2 py-1 text-xs font-medium ${statusStyles[status]}`}>
    {statusLabels[status]}{manual ? " · manually reviewed" : ""}
  </span>;
}
export function ProofLink({ url }: { url: string | null }) {
  const href = proofHref(url);
  return href ? <a className="text-sm underline underline-offset-4" href={href} target="_blank" rel="noopener noreferrer">View Proof</a>
    : <span className="text-xs text-muted-foreground">No valid proof available</span>;
}
export function ResultSummary({ run }: { run: RunSummary }) {
  const items = [{ label: "Total Payments", value: run.total }, { label: "Verified", value: run.verified },
    { label: "Needs Review", value: run.needs_review }, { label: "Cash", value: run.cash }, { label: "Bank", value: run.bank }];
  return <section aria-label="Effective result counts" className="space-y-2">
    <p className="text-sm text-muted-foreground">Final counts include the latest manual decisions.</p>
    <dl className="grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-5">
      {items.map((item) => <div key={item.label}><dt className="text-sm text-muted-foreground">{item.label}</dt><dd className="text-2xl font-semibold tabular-nums">{item.value}</dd></div>)}
    </dl>
  </section>;
}
export function Pagination({ page, total, href }: { page: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / 25));
  return <nav aria-label="Pagination" className="flex flex-wrap items-center gap-4 text-sm">
    {page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}
    <span>Page {page} of {pages} · {total} records</span>
    {page < pages && <Link className="underline" href={href(page + 1)}>Next</Link>}
  </nav>;
}
