"use client";

import { useEffect, useState } from "react";
import { Download, ReceiptText } from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import type { StudioWorkspace } from "@/lib/studio/types";

type Entry = {
  id: string;
  entry_kind: string;
  credits: number;
  authoritative: boolean;
  generation_id: string | null;
  created_at: string;
};
export function LedgerView({ workspace }: { workspace: StudioWorkspace }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    apiRequest<{ entries: Entry[] }>(`/api/ledger?workspaceId=${workspace.id}`)
      .then((result) => setEntries(result.entries))
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Ledger could not be loaded",
        ),
      );
  }, [workspace.id]);
  return (
    <section>
      <header className="view-heading">
        <div>
          <p className="eyebrow">IMMUTABLE USAGE</p>
          <h1>Usage ledger</h1>
          <p>
            Estimated reservations, releases, and authoritative recorded credits
            are kept distinct.
          </p>
        </div>
        {(workspace.role === "owner" || workspace.role === "admin") && (
          <a
            className="button secondary"
            href={`/api/ledger/export?workspaceId=${workspace.id}`}
          >
            <Download /> Export hardened CSV
          </a>
        )}
      </header>
      {error && <p className="error-banner">{error}</p>}
      {entries.length ? (
        <div className="ledger-table" role="table" aria-label="Usage entries">
          <div role="row" className="ledger-head">
            <span>Time</span>
            <span>Entry</span>
            <span>Status</span>
            <span>Credits</span>
          </div>
          {entries.map((entry) => (
            <div role="row" key={entry.id}>
              <time>{new Date(entry.created_at).toLocaleString()}</time>
              <span>{entry.entry_kind.replaceAll("_", " ")}</span>
              <span className={entry.authoritative ? "recorded" : "estimated"}>
                {entry.authoritative ? "Recorded" : "Estimated"}
              </span>
              <strong>{entry.credits}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ReceiptText />
          <h2>No usage entries</h2>
          <p>
            Reservations appear here before any external submission is
            attempted.
          </p>
        </div>
      )}
    </section>
  );
}
