import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Project } from "../lib/api";
import StatusBadge from "../components/StatusBadge";

const STATUSES: Project["status"][] = ["in_progress", "review", "delivered"];

export default function ProjectDetail() {
  const { clientId, projectId } = useParams<{ clientId: string; projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState("");
  const [status, setStatus] = useState<Project["status"]>("in_progress");
  const [footageLink, setFootageLink] = useState("");
  const [referenceLinks, setReferenceLinks] = useState("");
  const [instructions, setInstructions] = useState("");
  const [exportLink, setExportLink] = useState("");
  const [price, setPrice] = useState("");
  const [paid, setPaid] = useState(false);
  const [createdDate, setCreatedDate] = useState("");
  const [completedDate, setCompletedDate] = useState("");

  useEffect(() => {
    if (!projectId) return;
    api.getProject(projectId).then((p) => {
      setProject(p);
      setName(p.name);
      setStatus(p.status);
      setFootageLink(p.footage_link || "");
      setReferenceLinks(p.reference_links || "");
      setInstructions(p.instructions || "");
      setExportLink(p.export_link || "");
      setPrice(p.price != null ? String(p.price) : "");
      setPaid(Boolean(p.paid));
      setCreatedDate(p.created_date || "");
      setCompletedDate(p.completed_date || "");
      setLoading(false);
    });
  }, [projectId]);

  async function handleSave() {
    if (!projectId) return;
    setSaving(true);
    const updated = await api.updateProject(projectId, {
      name,
      status,
      footage_link: footageLink || null,
      reference_links: referenceLinks || null,
      instructions: instructions || null,
      export_link: exportLink || null,
      price: price ? Number(price) : null,
      paid: (paid ? 1 : 0) as 0 | 1,
      created_date: createdDate,
      completed_date: completedDate || null,
    });
    setProject(updated);
    setCreatedDate(updated.created_date || "");
    setCompletedDate(updated.completed_date || "");
    setSaving(false);
  }

  async function handleDelete() {
    if (!projectId || !clientId) return;
    if (!confirm(`Delete "${project?.name}"? This can't be undone.`)) return;
    await api.deleteProject(projectId);
    navigate(`/clients/${clientId}`);
  }

  function copyShareLink() {
    if (!project) return;
    const url = `${window.location.origin}/share/${project.share_slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading || !project) {
    return <div className="p-10 text-center text-slate-400">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link to={`/clients/${clientId}`} className="mb-6 inline-block text-sm text-slate-400 hover:text-slate-200">
        ← Back to client
      </Link>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-none bg-transparent text-2xl font-semibold text-slate-100 outline-none"
          />
          <StatusBadge status={status} />
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Project["status"])}
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Created Date</label>
              <input
                type="date"
                value={createdDate}
                onChange={(e) => setCreatedDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Completed Date</label>
              <input
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-500">Auto-fills when status is set to Delivered.</p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Footage Link</label>
            <input
              value={footageLink}
              onChange={(e) => setFootageLink(e.target.value)}
              placeholder="https://drive.google.com/... or WeTransfer link"
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Reference Video Link(s)
            </label>
            <textarea
              value={referenceLinks}
              onChange={(e) => setReferenceLinks(e.target.value)}
              rows={3}
              placeholder={"Example videos the client sent, one link per line"}
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Instructions</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              placeholder="Editing notes, brand guidelines, pacing, music preferences, deadlines..."
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <AiSummarizer onUseSummary={(s) => setInstructions(s)} />

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Final Export Link</label>
            <input
              value={exportLink}
              onChange={(e) => setExportLink(e.target.value)}
              placeholder="https://drive.google.com/... final video"
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-950 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Price</label>
              <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 pl-3 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
                <span className="text-sm text-slate-400">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="500"
                  className="w-full rounded-lg border-none bg-transparent px-2 py-2 text-sm outline-none"
                />
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={paid}
                  onChange={(e) => setPaid(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 text-brand-600 focus:ring-brand-500"
                />
                Paid
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-5">
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={copyShareLink}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              {copied ? "Copied!" : "Copy Client Share Link"}
            </button>
          </div>
          <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-300">
            Delete Project
          </button>
        </div>
      </div>
    </div>
  );
}

function AiSummarizer({ onUseSummary }: { onUseSummary: (summary: string) => void }) {
  const [open, setOpen] = useState(false);
  const [clientMessage, setClientMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function handleSummarize() {
    if (!clientMessage.trim()) return;
    setWorking(true);
    setError("");
    setSummary("");
    try {
      const res = await api.summarize(clientMessage);
      setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-lg border border-brand-500/30 bg-brand-500/5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-brand-300"
      >
        <span>✨ AI Assistant — summarize a client message</span>
        <span className="text-brand-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs text-slate-400">
            Paste the client's raw message (email, text, voice-note transcript) and get a clean editing
            brief back.
          </p>
          <textarea
            value={clientMessage}
            onChange={(e) => setClientMessage(e.target.value)}
            rows={5}
            placeholder="Paste the client's message here..."
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={handleSummarize}
            disabled={working || !clientMessage.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {working ? "Summarizing..." : "Summarize"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {summary && (
            <div className="space-y-2">
              <div className="whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
                {summary}
              </div>
              <button
                type="button"
                onClick={() => onUseSummary(summary)}
                className="rounded-lg border border-brand-500/50 px-3 py-1.5 text-sm font-medium text-brand-300 hover:bg-brand-500/10"
              >
                Use as Instructions ↑
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
