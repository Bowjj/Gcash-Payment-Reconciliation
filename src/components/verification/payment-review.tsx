import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImportSummary } from "@/components/verification/import-summary";
import { PreviewTable } from "@/components/verification/preview-table";
import type { UploadParseResult } from "@/app/(app)/verification/new/actions";

interface PaymentReviewProps {
  readonly result: UploadParseResult;
  readonly isProcessing: boolean;
  readonly confirmError: string | null;
  readonly onConfirm: () => void;
  readonly onReset: () => void;
}

export function PaymentReview({
  result,
  isProcessing,
  confirmError,
  onConfirm,
  onReset,
}: PaymentReviewProps) {
  if (!result.success) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm font-medium text-destructive">Failed to parse file</p>
          {result.missingHeaders && result.missingHeaders.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Missing headers: {result.missingHeaders.join(", ")}
            </p>
          )}
          {result.errors && result.errors.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {result.errors.map((error, index) => (
                <div key={index} className="font-mono text-destructive">
                  Row {error.rowIndex}: {error.field} — {error.message}
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" onClick={onReset}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ImportSummary
        filename={result.filename ?? ""}
        totalRows={result.totalRows ?? 0}
        validCount={result.validCount ?? 0}
        errorCount={result.errorCount ?? 0}
        gcashCount={result.summary?.gcashCount ?? 0}
        cashCount={result.summary?.cashCount ?? 0}
        bankCount={result.summary?.bankCount ?? 0}
        unknownMethodCount={result.summary?.unknownMethodCount ?? 0}
        missingHeaders={result.missingHeaders ?? []}
      />
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
                  Row {warning.rowIndex}: {warning.message}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {result.preview && result.preview.length > 0 && (
        <PreviewTable rows={result.preview} totalCount={result.validCount ?? 0} />
      )}
      <div className="flex gap-3">
        <Button
          onClick={onConfirm}
          disabled={isProcessing || (result.validCount ?? 0) === 0}
        >
          {isProcessing ? "Importing..." : "Confirm & Continue to GCash"}
        </Button>
        <Button variant="outline" onClick={onReset} disabled={isProcessing}>
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
