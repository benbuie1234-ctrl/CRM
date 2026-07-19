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
    });
    setProject(updated);
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
      <Link to={`/clients/${clientId}`} className="mb-6 inline-block text-sm text-slate-500 hover:text-slate-700">
        ← Back to client
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-none bg-transparent text-2xl font-semibold text-slate-900 outline-none"
          />
          <StatusBadge status={status} />
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Project["status"])}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Footage Link</label>
            <input
              value={footageLink}
              onChange={(e) => setFootageLink(e.target.value)}
              placeholder="https://drive.google.com/... or WeTransfer link"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Reference Video Link(s)
            </label>
            <textarea
              value={referenceLinks}
              onChange={(e) => setReferenceLinks(e.target.value)}
              rows={3}
              placeholder={"Example videos the client sent, one link per line"}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Instructions</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              placeholder="Editing notes, brand guidelines, pacing, music preferences, deadlines..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Final Export Link</label>
            <input
              value={exportLink}
              onChange={(e) => setExportLink(e.target.value)}
              placeholder="https://drive.google.com/... final video"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Price</label>
              <div className="flex items-center rounded-lg border border-slate-300 bg-white pl-3 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
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
              <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={paid}
                  onChange={(e) => setPaid(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Paid
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
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
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {copied ? "Copied!" : "Copy Client Share Link"}
            </button>
          </div>
          <button onClick={handleDelete} className="text-sm text-red-600 hover:text-red-700">
            Delete Project
          </button>
        </div>
      </div>
    </div>
  );
}
