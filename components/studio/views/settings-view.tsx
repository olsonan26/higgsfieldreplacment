"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/client/api";
import type { StudioWorkspace } from "@/lib/studio/types";

type SettingsData = {
  workspace: {
    id: string;
    name: string;
    monthly_credit_limit: number;
    daily_generation_limit: number;
    max_concurrent_generations: number;
    retention_days: number;
  };
  role: StudioWorkspace["role"];
  members: Array<{
    user_id: string;
    role: StudioWorkspace["role"];
    generation_allowed: boolean;
    monthly_credit_limit: number | null;
    daily_generation_limit: number | null;
    profile: { display_name: string } | null;
  }>;
  modelPolicies: Array<{
    model_capability_id: string;
    estimated_credit_reserve: number;
    enabled: boolean;
  }>;
  capabilities: Array<{
    id: string;
    appModelKey: string;
    displayName: string;
    modelMaker: string;
    mediaKind: string;
  }>;
  readiness?: Record<string, boolean>;
};

export function SettingsView({ workspace }: { workspace: StudioWorkspace }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [policies, setPolicies] = useState<
    Record<string, { reserve: number; enabled: boolean }>
  >({});
  const [limits, setLimits] = useState({
    monthly: 0,
    daily: 10,
    concurrent: 3,
    retention: 30,
  });
  const load = useCallback(async () => {
    setError("");
    try {
      const result = await apiRequest<SettingsData>(
        `/api/settings?workspaceId=${workspace.id}`,
      );
      setData(result);
      setLimits({
        monthly: result.workspace.monthly_credit_limit,
        daily: result.workspace.daily_generation_limit,
        concurrent: result.workspace.max_concurrent_generations,
        retention: result.workspace.retention_days,
      });
      setPolicies(
        Object.fromEntries(
          result.capabilities.map((capability) => {
            const current = result.modelPolicies.find(
              (policy) => policy.model_capability_id === capability.id,
            );
            return [
              capability.id,
              {
                reserve: current?.estimated_credit_reserve || 1,
                enabled: current?.enabled || false,
              },
            ];
          }),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Settings could not be loaded",
      );
    }
  }, [workspace.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const canAdmin = workspace.role === "owner" || workspace.role === "admin";
  async function saveLimits() {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          kind: "workspace",
          workspaceId: workspace.id,
          monthlyCreditLimit: limits.monthly,
          dailyGenerationLimit: limits.daily,
          maxConcurrentGenerations: limits.concurrent,
          retentionDays: limits.retention,
        }),
      });
      setStatus("Workspace guardrails updated.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Limits could not be updated",
      );
    } finally {
      setBusy(false);
    }
  }
  async function savePolicy(capabilityId: string) {
    setBusy(true);
    setError("");
    const policy = policies[capabilityId];
    try {
      await apiRequest("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          kind: "modelPolicy",
          workspaceId: workspace.id,
          capabilityId,
          estimatedCreditReserve: policy.reserve,
          enabled: policy.enabled,
        }),
      });
      setStatus("Model spending policy updated.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Model policy could not be updated",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggleMember(member: SettingsData["members"][number]) {
    setBusy(true);
    try {
      await apiRequest("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          kind: "member",
          workspaceId: workspace.id,
          userId: member.user_id,
          generationAllowed: !member.generation_allowed,
        }),
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Member policy could not be updated",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <header className="view-heading">
        <div>
          <p className="eyebrow">WORKSPACE GOVERNANCE</p>
          <h1>Settings & controls</h1>
          <p>
            Access, quotas, model reserves, retention, and deployment readiness.
            Service credentials are never entered in the browser.
          </p>
        </div>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="success-banner" role="status">
          {status}
        </p>
      )}
      {!data ? (
        <p>Loading workspace policy…</p>
      ) : (
        <div className="settings-sections">
          <section className="panel">
            <div className="panel-title">
              <span>
                <ShieldCheck /> Workspace guardrails
              </span>
              <small>{data.role}</small>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Monthly credit limit</span>
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  value={limits.monthly}
                  onChange={(event) =>
                    setLimits((current) => ({
                      ...current,
                      monthly: Number(event.target.value),
                    }))
                  }
                  disabled={!canAdmin}
                />
                <small>Hard cap; 0 means all spend is blocked.</small>
              </label>
              <label className="field">
                <span>Daily generation limit</span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={limits.daily}
                  onChange={(event) =>
                    setLimits((current) => ({
                      ...current,
                      daily: Number(event.target.value),
                    }))
                  }
                  disabled={!canAdmin}
                />
              </label>
              <label className="field">
                <span>Concurrent generations</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={limits.concurrent}
                  onChange={(event) =>
                    setLimits((current) => ({
                      ...current,
                      concurrent: Number(event.target.value),
                    }))
                  }
                  disabled={!canAdmin}
                />
              </label>
              <label className="field">
                <span>Retention days</span>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={limits.retention}
                  onChange={(event) =>
                    setLimits((current) => ({
                      ...current,
                      retention: Number(event.target.value),
                    }))
                  }
                  disabled={!canAdmin}
                />
              </label>
            </div>
            {canAdmin && (
              <button
                className="button primary"
                onClick={saveLimits}
                disabled={busy}
              >
                Save guardrails
              </button>
            )}
          </section>
          <section className="panel">
            <div className="panel-title">
              <span>Model spending policies</span>
              <small>Admin configured</small>
            </div>
            <p className="muted">
              A conservative reserve is charged as estimated before submission
              and released when an authoritative receipt arrives. Disabled or
              unconfigured models cannot spend.
            </p>
            <div className="policy-list">
              {data.capabilities.map((capability) => (
                <div key={capability.id}>
                  <span>
                    <b>{capability.displayName}</b>
                    <small>
                      {capability.modelMaker} · {capability.mediaKind}
                    </small>
                  </span>
                  <label>
                    <span>Reserve</span>
                    <input
                      type="number"
                      min="0.0001"
                      max="100000"
                      step="0.0001"
                      value={policies[capability.id]?.reserve || 1}
                      onChange={(event) =>
                        setPolicies((current) => ({
                          ...current,
                          [capability.id]: {
                            ...current[capability.id],
                            reserve: Number(event.target.value),
                          },
                        }))
                      }
                      disabled={!canAdmin}
                    />
                  </label>
                  <label className="compact-toggle">
                    <input
                      type="checkbox"
                      checked={policies[capability.id]?.enabled || false}
                      onChange={(event) =>
                        setPolicies((current) => ({
                          ...current,
                          [capability.id]: {
                            ...current[capability.id],
                            enabled: event.target.checked,
                          },
                        }))
                      }
                      disabled={!canAdmin}
                    />{" "}
                    Enabled
                  </label>
                  {canAdmin && (
                    <button
                      className="button subtle"
                      onClick={() => savePolicy(capability.id)}
                      disabled={busy}
                    >
                      Save
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <span>Members</span>
              <small>{data.members.length}</small>
            </div>
            <div className="member-list">
              {data.members.map((member) => (
                <div key={member.user_id}>
                  <span>
                    <b>{member.profile?.display_name || "Workspace member"}</b>
                    <small>{member.role}</small>
                  </span>
                  <label className="compact-toggle">
                    <input
                      type="checkbox"
                      checked={member.generation_allowed}
                      onChange={() => toggleMember(member)}
                      disabled={!canAdmin || busy}
                    />{" "}
                    Generation allowed
                  </label>
                  <small>
                    Monthly {member.monthly_credit_limit ?? "workspace cap"} ·
                    Daily {member.daily_generation_limit ?? "workspace cap"}
                  </small>
                </div>
              ))}
            </div>
          </section>
          {data.readiness && (
            <section className="panel">
              <div className="panel-title">
                <span>Deployment readiness</span>
                <small>Server checked</small>
              </div>
              <div className="readiness-list">
                {Object.entries(data.readiness).map(([key, ready]) => (
                  <div key={key}>
                    {ready ? (
                      <CheckCircle2 className="ready" />
                    ) : (
                      <XCircle className="not-ready" />
                    )}
                    <span>
                      <b>{key.replace(/([A-Z])/g, " $1")}</b>
                      <small>
                        {ready
                          ? "Configured"
                          : "Missing from server environment"}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted">
                Missing credentials keep readiness red and generation disabled;
                no browser key entry or misleading fallback is provided.
              </p>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
