"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadDropzone } from "@/components/verification/upload-dropzone";
import { ImportSummary } from "@/components/verification/import-summary";
import { PreviewTable } from "@/components/verification/preview-table";
import {
  parseUploadAction,
  confirmImportAction,
  type UploadParseResult,
} from "./actions";

type Step = "upload" | "review" | "importing" | "done";

export default function NewVerificationPage() {
  const [step, setStep] = useState<Step>("upload");
  const [parseResult, setParseResult] = useState<UploadParseResult | null>(null);
  const [isProcessing, startTransition] = useTransition();

  function handleFileSelected(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const result = await parseUploadAction(formData);
      setParseResult(result);
      if (result.success) {
        setStep("review");
      }
    });
  }

  function handleConfirm() {
    if (!parseResult?.preview) return;
    const preview = parseResult.preview;

    setStep("importing");
    startTransition(async () => {
      await confirmImportAction(
        preview.map((r) => ({
          ...r,
          account: "",
          billingPeriod: "",
          notes: "",
          paidBy: "",
          receivedBy: "",
          createdAt: null,
        })),
        parseResult.filename ?? "unknown.xlsx",
      );
      setStep("done");
    });
  }

  function handleReset() {
    setStep("upload");
    setParseResult(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New Verification
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload a Payment Records spreadsheet to start a verification run.
        </p>
      </div>

      {step === "upload" && (
        <UploadDropzone
          onFileSelected={handleFileSelected}
          isProcessing={isProcessing}
        />
      )}

      {step === "review" && parseResult && parseResult.success && (
        <>
          <ImportSummary
            filename={parseResult.filename ?? ""}
            totalRows={parseResult.totalRows ?? 0}
            validCount={parseResult.validCount ?? 0}
            errorCount={parseResult.errorCount ?? 0}
            gcashCount={parseResult.summary?.gcashCount ?? 0}
            cashCount={parseResult.summary?.cashCount ?? 0}
            bankCount={parseResult.summary?.bankCount ?? 0}
            unknownMethodCount={parseResult.summary?.unknownMethodCount ?? 0}
            missingHeaders={parseResult.missingHeaders ?? []}
          />

          {parseResult.errors && parseResult.errors.length > 0 && (
            <Card className="border-amber-200">
              <CardContent className="pt-6">
                <p className="mb-2 text-sm font-medium">
                  Validation Errors ({parseResult.errors.length})
                </p>
                <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {parseResult.errors.map((err, i) => (
                    <div key={i} className="font-mono text-amber-700">
                      Row {err.rowIndex}: {err.field} — {err.message}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {parseResult.preview && parseResult.preview.length > 0 && (
            <PreviewTable
              rows={parseResult.preview}
              totalCount={parseResult.validCount ?? 0}
            />
          )}

          <div className="flex gap-3">
            <Button
              onClick={handleConfirm}
              disabled={isProcessing || (parseResult.validCount ?? 0) === 0}
            >
              {isProcessing ? "Importing..." : "Confirm Import"}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={isProcessing}>
              Upload different file
            </Button>
          </div>
        </>
      )}

      {step === "review" && parseResult && !parseResult.success && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm font-medium text-destructive">
              Failed to parse file
            </p>
            {parseResult.missingHeaders &&
              parseResult.missingHeaders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Missing headers: {parseResult.missingHeaders.join(", ")}
                </p>
              )}
            {parseResult.errors && parseResult.errors.length > 0 && (
              <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {parseResult.errors.map((err, i) => (
                  <div key={i} className="font-mono text-destructive">
                    Row {err.rowIndex}: {err.field} — {err.message}
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" onClick={handleReset}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "importing" && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              Importing records...
            </p>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardContent className="space-y-4 py-12 text-center">
            <p className="text-sm font-medium">Import complete</p>
            <Button variant="outline" onClick={handleReset}>
              Import another file
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
