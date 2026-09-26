"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { searchHistory } from "@/app/(app)/history/actions";
import type { HistoryCategory, HistoryPageData } from "@/lib/verification/run-list";
import { RunCard } from "./run-card";
import { DeleteRunDialog } from "./delete-run-dialog";

const categories: { value: HistoryCategory; label: string }[] = [
  { value: "all", label: "All" }, { value: "attention", label: "Needs Attention" }, { value: "clear", label: "No Outstanding Review" },
];

export function HistoryBrowser({ workspaceId, initial, canDelete = false }: { workspaceId: string; initial: HistoryPageData; canDelete?: boolean }) {
  const [result, setResult] = useState(initial);
  const [search, setSearch] = useState(initial.search);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [pending, startTransition] = useTransition();
  const version = useRef(0);
  function load(category: HistoryCategory, search: string, page: number) {
    const current = ++version.current;
    setError(null);
    startTransition(async () => {
      try {
        const response = await searchHistory({ workspaceId, category, search, page });
        if (current !== version.current) return;
        if (response.success) setResult(response.data);
        else setError(response.error);
      } catch {
        if (current === version.current) setError("Could not load verification history. Please try again.");
      }
    });
  }
  const filtered = result.category !== "all" || !!result.search;
  function deleted(id: string) {
    ++version.current;
    setResult((current) => ({ ...current, runs: current.runs.filter((run) => run.id !== id), total: Math.max(0, current.total - 1) }));
    setMessage("Verification run deleted.");
    heading.current?.focus();
    const page = Math.min(result.page, Math.max(1, Math.ceil((result.total - 1) / 25)));
    load(result.category, result.search, page);
  }
  const pages = Math.max(1, Math.ceil(result.total / 25));
  return <div className="space-y-5">
    <section aria-label="History filters" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">{categories.map((category) => <button key={category.value} type="button" disabled={pending}
        aria-pressed={result.category === category.value} onClick={() => load(category.value, search, 1)}
        className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60 ${result.category === category.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
        {category.label}
      </button>)}</div>
      <p className="text-xs text-muted-foreground">All includes queued, processing, failed, and completed runs. The review filters apply to completed runs; No Outstanding Review can include Cash and Bank payments.</p>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); load(result.category, search, 1); }}>
        <label className="min-w-0 flex-1 text-sm font-medium">Search payment or GCash filename
          <input className="mt-1 block min-h-11 w-full rounded-lg border px-3 text-sm font-normal" type="search" maxLength={100}
            value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Enter part of a filename" />
        </label>
        <Button className="min-h-11 px-4" type="submit" disabled={pending}>Search History</Button>
      </form>
    </section>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    <section aria-labelledby="history-runs-title" aria-busy={pending} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 ref={heading} tabIndex={-1} id="history-runs-title" className="font-semibold">Verification Runs</h2>
        <p aria-live="polite" className="text-sm text-muted-foreground">{pending ? "Loading runs…" : `${result.total} run${result.total === 1 ? "" : "s"}`}</p>
      </div>
      {result.runs.length > 0 ? <ul className="space-y-4">{result.runs.map((run) => <li key={run.id}><RunCard run={run} actions={canDelete ? <DeleteRunDialog run={run} disabled={pending} onDeleted={deleted} /> : undefined} /></li>)}</ul>
        : <div className="space-y-4 rounded-xl border border-dashed bg-card p-6 text-center sm:p-10">
          <p className="font-medium">{filtered ? "No verification runs match this filter." : "No verification runs yet in this workspace."}</p>
          {filtered ? <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => { setSearch(""); load("all", "", 1); }}>Clear filters</Button>
            : <Link className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" href="/verification/new">New Verification</Link>}
        </div>}
      {result.total > 0 && <nav aria-label="History pagination" className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="outline" className="min-h-11" disabled={pending || result.page <= 1} onClick={() => load(result.category, result.search, result.page - 1)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {result.page} of {pages}</span>
        <Button variant="outline" className="min-h-11" disabled={pending || result.page >= pages} onClick={() => load(result.category, result.search, result.page + 1)}>Next</Button>
      </nav>}
    </section>
  </div>;
}
