import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GcashPreviewTable } from "@/components/verification/gcash-preview-table";
import { GcashSummary } from "@/components/verification/gcash-summary";
import type { GcashUploadParseResult } from "@/app/(app)/verification/new/gcash-actions";

interface GcashReviewProps {
  readonly result: GcashUploadParseResult;
  readonly isProcessing: boolean;
  readonly confirmError: string | null;
  readonly onConfirm: () => void;
  readonly onRetry: () => void;
}

export function GcashReview({
  result,
  isProcessing,
  confirmError,
  onConfirm,
  onRetry,
}: GcashReviewProps) {
  if (!result.success) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm font-medium text-destructive">Failed to parse GCash file</p>
          {result.errors && result.errors.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {result.errors.map((error, index) => (
                <div key={index} className="font-mono text-destructive">
                  Row {error.rowIndex}: {error.field} — {error.message}
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" onClick={onRetry}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <GcashSummary
        filename={result.filename ?? ""}
        totalRows={result.totalRows ?? 0}
        validCount={result.validCount ?? 0}
        errorCount={result.errorCount ?? 0}
        incomingCount={result.summary?.incomingCount ?? 0}
        outgoingCount={result.summary?.outgoingCount ?? 0}
        unknownDirectionCount={result.summary?.unknownDirectionCount ?? 0}
        duplicateReferenceCount={result.summary?.duplicateReferenceCount ?? 0}
        duplicateTransactionCount={result.summary?.duplicateTransactionCount ?? 0}
      />
      {result.sheetsProcessed && result.sheetsProcessed.length > 1 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-800">
              Processed {result.sheetsProcessed.length} sheets. Transactions have been
              auto-detected per transaction.
            </p>
          </CardContent>
        </Card>
      )}
      {result.errors && result.errors.length > 0 && (
        <Card className="border-amber-200">
          <CardContent className="pt-6">
            <p className="mb-2 text-sm font-medium">Validation Errors ({result.errors.length})</p>
            <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {result.errors.map((error, index) => (
                <div key={index} className="font-mono text-amber-700">
                  Row {error.rowIndex}: {error.field} — {error.message}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {result.warnings && result.warnings.length > 0 && (
        <Card className="border-blue-200">
          <CardContent className="pt-6">
            <p className="mb-2 text-sm font-medium">Import Warnings ({result.warnings.length})</p>
            <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {result.warnings.map((warning, index) => (
                <div key={index} className="font-mono text-blue-700">
                  {warning.sheetName ? `${warning.sheetName}, ` : ""}Row {warning.rowIndex}: {warning.message}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {result.preview && result.preview.length > 0 && (
        <GcashPreviewTable rows={result.preview} totalCount={result.validCount ?? 0} />
      )}
      <div className="flex gap-3">
        <Button
          onClick={onConfirm}
          disabled={isProcessing || (result.validCount ?? 0) === 0}
        >
          {isProcessing ? "Importing..." : "Confirm GCash Import"}
        </Button>
        <Button variant="outline" onClick={onRetry} disabled={isProcessing}>
          Upload different file
        </Button>
      </div>
      {confirmError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-destructive">{confirmError}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
