import type { ExportData, ExportPayment, ExportGcash } from "@/lib/export/export-data";

export const exportBusinessId = "10000000-0000-4000-8000-000000000001";
export const exportRunId = "20000000-0000-4000-8000-000000000001";
export function paymentId(n: number) { return `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`; }
export function transactionId(n: number) { return `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`; }

export function exportFixture(): ExportData {
  const payment = (n: number, changes: Partial<ExportPayment>): ExportPayment => ({
    id: paymentId(n), business_id: exportBusinessId, verification_run_id: exportRunId,
    customer: `Customer ${n}`, account: `000${n}`, billing_period: "Sep 2026", amount_decimal: "1000.00", method: "GCASH",
    reference_number: `NOT-FOUND-${n}`, payment_date: "2026-09-21", photo_url: "https://example.com/proof.png",
    automated_status: "NEEDS_REVIEW", automated_reason: "REFERENCE_NOT_FOUND", effective_status: "NEEDS_REVIEW", manual_status: null,
    row_index: n + 1, notes: "Source notes", paid_by: "Customer", received_by: "Cashier", created_at_source: "2026-09-21",
    gcash_transaction_id: null, review_revision: 0, manual_note: null, reviewed_by: null, reviewed_at: null, raw_data: {}, ...changes,
  });
  const payments = [
    payment(1, { customer: "Jake Tirana", reference_number: "0045276500984", amount_decimal: "1300.00", automated_status: "VERIFIED", automated_reason: "REFERENCE_MATCH", effective_status: "VERIFIED", gcash_transaction_id: transactionId(1) }),
    payment(2, { customer: "Reference Not Found", photo_url: "http://example.com/proof.png" }),
    payment(3, { customer: "Missing Reference", reference_number: null, automated_reason: "MISSING_REFERENCE", photo_url: "javascript:alert(1)", payment_date: null }),
    payment(4, { customer: "Duplicate Reference", reference_number: "DUPLICATE", automated_reason: "DUPLICATE_REFERENCE", payment_date: "2026-02-30" }),
    payment(5, { customer: "Cash Customer", method: "CASH", reference_number: null, automated_status: "CASH", automated_reason: "CASH_PAYMENT", effective_status: "CASH" }),
    payment(6, { customer: "Bank Customer", method: "BANK", automated_status: "BANK", automated_reason: "BANK_MANUAL_VERIFICATION", effective_status: "BANK" }),
    payment(7, { customer: "Manual Only Customer", reference_number: "MANUAL-ONLY", effective_status: "VERIFIED", manual_status: "VERIFIED", manual_note: "Confirmed manually with admin", reviewed_by: "reviewer@example.com", reviewed_at: "2026-09-23T10:00:00Z", review_revision: 1 }),
    payment(8, { customer: "Leading Zero Customer", reference_number: "0000203966985", amount_decimal: "500.00", automated_status: "VERIFIED", automated_reason: "REFERENCE_MATCH", effective_status: "VERIFIED", gcash_transaction_id: transactionId(4) }),
    payment(9, { customer: '=HYPERLINK("https://example.com")', notes: "+CMD|'example'!A0", reference_number: "FORMULA-TEXT" }),
  ];
  const gcash: ExportGcash[] = [
    ["0045276500984", "1299.00", "Original transfer", 1], ["DUPLICATE", "1000.00", "Duplicate one", null],
    ["DUPLICATE", "999.00", "Duplicate two", null], ["0000203966985", "500.00", "Another transfer", 8],
    ["UNMATCHED", "50.00", "Unmatched transaction", null], ["UNMATCHED-FORMULA", "25.00", "@untrusted-description", null],
  ].map((values, index) => {
    const ref = String(values[0]);
    const amount = String(values[1]);
    const description = String(values[2]);
    const linkedId = values[3];
    const linked = typeof linkedId === "number" ? payments.find((p) => p.id === paymentId(linkedId)) : undefined;
    return {
      id: transactionId(index + 1), business_id: exportBusinessId, verification_run_id: exportRunId,
      transaction_date: "2026-09-21", description, reference_number: ref, amount_decimal: amount,
      matched_customer: linked?.customer ?? null, matched_payment_id: linked?.id ?? null,
      row_index: (index % 3) + 2, source_order: index,
      raw_data: { filename: "GCash.xlsx", sheet_name: index < 3 ? "September" : "October", source_order: index, source: {
        date: "2026-09-21 08:00 AM", description, ref, debit: amount, credit: "",
        export_source: {
          headers: ["Date and Time", "Account", "Description", "Channel", "Note", "Balance", "REF NO", "Type", "Debit", "Unused", "Credit", "Extra Bank Field"],
          cells: ["2026-09-21 08:00 AM", "00001234", description, "Original channel", "Original note", "5000", ref, "Original type", amount, "", "", `Preserved ${index}`],
          reference_column: 6,
        },
      } },
    };
  });
  return { workspaceName: "Annie Internet", run: {
    id: exportRunId, business_id: exportBusinessId, created_at: "2026-09-23T09:00:00Z", completed_at: "2026-09-23T09:05:00Z",
    payment_filename: "PAYMENTS.xlsx", gcash_filename: "GCash.xlsx", total: 9, verified: 3, needs_review: 4, cash: 1, bank: 1,
  }, payments, gcash };
}
