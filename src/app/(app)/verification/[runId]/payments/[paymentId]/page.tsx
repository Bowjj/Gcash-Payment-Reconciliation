import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManualReviewForm } from "@/components/verification/manual-review-form";
import { Pagination, ProofLink, ResultStatus } from "@/components/verification/result-shared";
import { authorizedRun } from "@/lib/verification/results-server";
import { auditSchema, gcashResultSchema, paymentDetailSchema, type GcashResult } from "@/lib/verification/results-data";
import { canReview, displayDate, displayMoney, reasonMessages, resultsQuerySchema } from "@/lib/verification/review";

function TransactionDetails({ row }: { row: GcashResult }) {
  return <dl className="grid gap-3 text-sm sm:grid-cols-2">
    {[['Date', displayDate(row.transaction_date)], ['Description', row.description ?? "—"], ['Reference', row.reference_number ?? "—"],
      ['GCash Amount', displayMoney(row.amount_decimal)], ['Matched Customer', row.matched_customer ?? "—"], ['Source Row', String(row.row_index)]].map(([label, value]) =>
      <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words [overflow-wrap:anywhere]">{value}</dd></div>)}
  </dl>;
}

export default async function PaymentDetailPage({ params, searchParams }: {
  params: Promise<{ runId: string; paymentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { runId, paymentId } = await params;
  const { workspace, membership, supabase } = await authorizedRun(runId);
  if (!z.uuid().safeParse(paymentId).success) notFound();
  const query = await searchParams;
  const auditPage = resultsQuerySchema.parse({ page: query["auditPage"] }).page;
  const candidatePage = resultsQuerySchema.parse({ page: query["candidatePage"] }).page;
  const base = `/verification/${runId}/payments/${paymentId}`;
  const { data, error } = await supabase.from("payment_results").select("*").eq("id", paymentId)
    .eq("business_id", workspace.id).eq("verification_run_id", runId).maybeSingle();
  if (error) throw new Error("Could not load payment details.");
  if (!data) notFound();
  const payment = paymentDetailSchema.parse(data);
  let matched: GcashResult | null = null;
  let candidates: GcashResult[] = [];
  let candidateCount = 0;
  if (payment.gcash_transaction_id) {
    const { data: g, error: gError } = await supabase.from("gcash_results").select("*").eq("id", payment.gcash_transaction_id)
      .eq("business_id", workspace.id).eq("verification_run_id", runId).single();
    if (gError) throw new Error("Could not load matched GCash transaction.");
    matched = gcashResultSchema.parse(g);
  }
  if (payment.reference_number && ["DUPLICATE_REFERENCE", "DUPLICATE_PAYMENT_REFERENCE"].includes(payment.automated_reason)) {
    const { data: rows, count, error: candidateError } = await supabase.from("gcash_results").select("*", { count: "exact" })
      .eq("business_id", workspace.id).eq("verification_run_id", runId).eq("reference_number", payment.reference_number)
      .order("source_order").order("id").range((candidatePage - 1) * 25, candidatePage * 25 - 1);
    if (candidateError) throw new Error("Could not load reference candidates.");
    candidates = z.array(gcashResultSchema).parse(rows ?? []);
    candidateCount = count ?? 0;
  }
  const { data: auditRows, count: auditCount, error: auditError } = await supabase.from("verification_actions").select("*", { count: "exact" })
    .eq("payment_id", paymentId).eq("business_id", workspace.id).eq("verification_run_id", runId)
    .order("revision", { ascending: false }).range((auditPage - 1) * 25, auditPage * 25 - 1);
  if (auditError) throw new Error("Could not load review history.");
  const audit = z.array(auditSchema).parse(auditRows ?? []);
  const fields = [
    ["Customer", payment.customer], ["Account", payment.account], ["Billing Period", payment.billing_period],
    ["Payment Amount", displayMoney(payment.amount_decimal)], ["Method", payment.method], ["Reference #", payment.reference_number],
    ["Payment Date", displayDate(payment.payment_date)], ["Notes", payment.notes], ["Paid By", payment.paid_by],
    ["Received By", payment.received_by], ["Created At", displayDate(payment.created_at_source)],
  ];
  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="space-y-2"><Link href={`/verification/${runId}`} className="text-sm underline">Back to Results</Link>
      <h1 className="break-words text-2xl font-semibold">Payment Details</h1><p>{workspace.name} · {payment.customer}</p>
    </header>
    <section aria-label="Final decision" className="space-y-2 rounded-xl border p-4"><h2 className="font-semibold">Final Status</h2>
      <ResultStatus status={payment.effective_status} manual={!!payment.manual_status} />
      {payment.manual_status && <p className="text-sm">{payment.manual_note || "No note provided."}<br />Reviewed by {payment.reviewed_by ?? "Workspace reviewer"} · {displayDate(payment.reviewed_at)}</p>}
    </section>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Payment Information</CardTitle></CardHeader><CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words [overflow-wrap:anywhere]">{value || "—"}</dd></div>)}</dl>
        <ProofLink url={payment.photo_url} />
        <details className="text-sm"><summary className="cursor-pointer">Preserved source fields</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(payment.raw_data, null, 2)}</pre></details>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Automated Result</CardTitle></CardHeader><CardContent className="space-y-3">
        <ResultStatus status={payment.automated_status} /><p className="break-all font-mono text-xs">{payment.automated_reason}</p>
        <p className="text-sm">{reasonMessages[payment.automated_reason] ?? payment.automated_reason}</p>
        <p className="text-xs text-muted-foreground">The original automated decision is retained after manual review.</p>
      </CardContent></Card>
    </div>
    {matched && <Card><CardHeader><CardTitle>Matched GCash Transaction</CardTitle></CardHeader><CardContent><TransactionDetails row={matched} /></CardContent></Card>}
    {candidateCount > 0 && <section aria-label="Exact-reference candidates" className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">Exact-reference GCash candidates ({candidateCount})</h2>
      <p className="text-sm text-muted-foreground">These rows remain ambiguous. No candidate is chosen by amount, date, or manual status resolution.</p>
      {candidates.map((row) => <div key={row.id} className="border-t pt-4"><TransactionDetails row={row} /></div>)}
      <Pagination page={candidatePage} total={candidateCount} href={(page) => `${base}?candidatePage=${page}&auditPage=${auditPage}`} />
    </section>}
    <Card><CardHeader><CardTitle>Manual Review</CardTitle></CardHeader><CardContent>
      {canReview(membership.role, payment.automated_status) ? <ManualReviewForm workspaceId={workspace.id} runId={runId} paymentId={paymentId} revision={payment.review_revision} status={payment.manual_status ?? "NEEDS_REVIEW"} />
        : <p className="text-sm text-muted-foreground">{payment.automated_status === "NEEDS_REVIEW" ? "Only workspace owners and admins can save manual decisions." : "Manual status changes are limited to payments whose automated result needs review. Cash, bank, and automatically verified payments retain their status."}</p>}
    </CardContent></Card>
    <section aria-label="Audit trail" className="space-y-4 rounded-xl border p-4"><h2 className="font-semibold">Audit Trail</h2>
      {audit.length === 0 ? <p className="text-sm text-muted-foreground">No manual decisions recorded.</p> : <ol className="space-y-4">{audit.map((entry) => <li key={entry.id} className="space-y-2 border-t pt-4 text-sm">
        <p className="flex flex-wrap items-center gap-2"><ResultStatus status={entry.previous_status} /><span>to</span><ResultStatus status={entry.new_status} /></p>
        <p className="break-words">{entry.actor_email ?? entry.actor_id} · {displayDate(entry.created_at)} · Revision {entry.revision}</p>
        <p className="whitespace-pre-wrap break-words">{entry.note || "No note provided."}</p>
      </li>)}</ol>}
      <Pagination page={auditPage} total={auditCount ?? 0} href={(page) => `${base}?auditPage=${page}&candidatePage=${candidatePage}`} />
    </section>
  </div>;
}
