import { authorizedRun } from "@/lib/verification/results-server";
import { loadVerificationExport } from "@/lib/export/load-export";
import { exportFilename, operationalWorkbookExport } from "@/lib/export/verification-workbook";
import { ExportLimitError, XLSX_MIME } from "@/lib/export/export-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { supabase, workspace } = await authorizedRun(runId);
  const kind = new URL(request.url).searchParams.get("file");
  if (kind !== "payments" && kind !== "gcash") return Response.json({ error: "Choose Payment Records or GCash." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  try {
    const data = await loadVerificationExport(supabase, workspace.id, runId);
    const { buffer, annotationConflicts } = await operationalWorkbookExport(data, kind);
    return new Response(buffer, { headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${exportFilename(data, kind)}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
      "X-GCash-Annotation-Conflicts": String(annotationConflicts),
    } });
  } catch (error) {
    return Response.json({ error: error instanceof ExportLimitError ? error.message : "Could not generate this report. Refresh the results and try again." },
      { status: error instanceof ExportLimitError ? 413 : 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
