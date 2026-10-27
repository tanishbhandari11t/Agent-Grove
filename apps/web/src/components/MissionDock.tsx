import { useEffect, useMemo, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import type { Mission } from "@agent-grove/shared";
import { exportMissionPdf } from "../exportPdf";

interface Props {
  mode: string;
  connected: boolean;
  busy: boolean;
  missions: Mission[];
  selected: Mission | null;
  deliveredReport: Mission | null;
  onCloseReport: () => void;
  onSubmit: (prompt: string) => Promise<void>;
  onSelect: (id: string) => void;
  onRetry: () => Promise<void>;
}

export function MissionDock({
  mode,
  connected,
  busy,
  missions,
  selected,
  deliveredReport,
  onCloseReport,
  onSubmit,
  onSelect,
  onRetry,
}: Props) {
  const [open, setOpen] = useState(true);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [activeInboxId, setActiveInboxId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [prompt, setPrompt] = useState(
    "Research the top five AI coding tools, compare pricing and capabilities, and recommend one for a student developer.",
  );

  const inbox = useMemo(
    () =>
      missions.filter((m) => m.status === "completed" && m.report?.content),
    [missions],
  );

  const unreadCount = useMemo(
    () => inbox.filter((m) => !readIds.has(m.id)).length,
    [inbox, readIds],
  );

  const activeInboxItem =
    inbox.find((m) => m.id === activeInboxId) ?? inbox[0] ?? null;

  useEffect(() => {
    // New delivery: mark unread + select it, but don't force-open over the office.
    if (deliveredReport?.report) {
      setActiveInboxId(deliveredReport.id);
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(deliveredReport.id);
        return next;
      });
    }
  }, [deliveredReport]);

  useEffect(() => {
    if (inboxOpen && activeInboxId) {
      setReadIds((prev) => {
        if (prev.has(activeInboxId)) return prev;
        const next = new Set(prev);
        next.add(activeInboxId);
        return next;
      });
    }
  }, [inboxOpen, activeInboxId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    await onSubmit(prompt.trim());
  }

  function openInbox() {
    setInboxOpen(true);
    if (!activeInboxId && inbox[0]) setActiveInboxId(inbox[0].id);
  }

  function openInboxItem(id: string) {
    setActiveInboxId(id);
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    onSelect(id);
  }

  function closeInbox() {
    setInboxOpen(false);
    onCloseReport();
  }

  return (
    <>
      <div className="hud-top">
        <div className="hud-brand">
          <strong>Agent Grove</strong>
          <span>Office of AI employees</span>
        </div>
        <div className="hud-actions">
          <span className={`mode-pill ${mode === "demo" ? "demo" : ""}`}>
            {mode === "live" ? "OpenRouter live" : mode}
            {connected ? "" : " · reconnecting"}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide board" : "Mission board"}
          </button>
        </div>
      </div>

      {open ? (
        <aside className="mission-dock">
          <form className="mission-form" onSubmit={handleSubmit}>
            <label>
              Give the office a mission
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
              />
            </label>
            <div className="btn-row">
              <button className="btn btn-primary" type="submit" disabled={busy || prompt.trim().length < 8}>
                {busy ? "Assigning…" : "Assign work"}
              </button>
              <button type="button" className="btn btn-ghost inbox-btn" onClick={openInbox}>
                Inbox
                {unreadCount > 0 ? <span className="inbox-badge">{unreadCount}</span> : null}
              </button>
              {selected?.status === "failed" ? (
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void onRetry()}>
                  Retry
                </button>
              ) : null}
            </div>
          </form>

          <div className="mission-list compact">
            {missions.slice(0, 6).map((m) => (
              <button
                key={m.id}
                type="button"
                className={`mission-item ${selected?.id === m.id ? "selected" : ""}`}
                onClick={() => onSelect(m.id)}
              >
                <h3>{m.title}</h3>
                <div className="meta">
                  <span className={`badge ${m.status}`}>{m.status}</span>
                </div>
              </button>
            ))}
          </div>

          {selected ? (
            <div className="timeline compact">
              {[...selected.events].slice(-6).reverse().map((ev) => (
                <div key={ev.id} className="timeline-item">
                  <strong>
                    {ev.eventType}
                    {ev.agentId ? ` · ${ev.agentId}` : ""}
                  </strong>
                  <p>{ev.message}</p>
                </div>
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}

      {inboxOpen ? (
        <div className="report-modal" role="dialog" aria-label="Inbox">
          <div className="report-modal-card inbox-card">
            <div className="panel-header">
              <h2>Inbox</h2>
              <div className="btn-row">
                {activeInboxItem?.report ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => exportMissionPdf(activeInboxItem)}
                  >
                    Export PDF
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost" onClick={closeInbox}>
                  Close
                </button>
              </div>
            </div>

            <div className="inbox-layout">
              <div className="inbox-list">
                {inbox.length === 0 ? (
                  <p className="empty-inbox">No reports yet. Assign work and agents will deliver answers here.</p>
                ) : (
                  inbox.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`inbox-item ${activeInboxItem?.id === m.id ? "selected" : ""} ${
                        readIds.has(m.id) ? "" : "unread"
                      }`}
                      onClick={() => openInboxItem(m.id)}
                    >
                      <strong>{m.title}</strong>
                      <span>{new Date(m.finishedAt || m.updatedAt).toLocaleString()}</span>
                    </button>
                  ))
                )}
              </div>

              <div className="inbox-detail">
                {activeInboxItem?.report ? (
                  <>
                    <div className="inbox-detail-meta">
                      <h3>{activeInboxItem.title}</h3>
                      <p>{activeInboxItem.prompt}</p>
                    </div>
                    <div className="report">
                      <ReactMarkdown>{activeInboxItem.report.content}</ReactMarkdown>
                    </div>
                  </>
                ) : (
                  <p className="empty-inbox">Select a report to read it.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
