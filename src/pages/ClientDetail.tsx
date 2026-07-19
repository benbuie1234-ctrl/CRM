import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, BillingType, Client, Project } from "../lib/api";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { formatMoney } from "../lib/format";

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [copiedPortal, setCopiedPortal] = useState(false);

  function refresh() {
    if (!clientId) return;
    setLoading(true);
    Promise.all([api.getClient(clientId), api.listProjects(clientId)]).then(([c, p]) => {
      setClient(c);
      setProjects(p);
      setLoading(false);
    });
  }

  useEffect(refresh, [clientId]);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !projectName.trim()) return;
    await api.createProject(clientId, { name: projectName, status: "in_progress" });
    setShowNew(false);
    setProjectName("");
    refresh();
  }

  async function handleDeleteClient() {
    if (!clientId) return;
    if (!confirm(`Delete ${client?.name} and all their projects? This can't be undone.`)) return;
    await api.deleteClient(clientId);
    navigate("/");
  }

  function copyPortalLink() {
    if (!client) return;
    const url = `${window.location.origin}/portal/${client.share_slug}`;
    navigator.clipboard.writeText(url);
    setCopiedPortal(true);
    setTimeout(() => setCopiedPortal(false), 1500);
  }

  async function togglePaid(project: Project, paid: boolean) {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, paid: (paid ? 1 : 0) as 0 | 1 } : p)));
    await api.updateProject(project.id, { paid: (paid ? 1 : 0) as 0 | 1 });
  }

  if (loading || !client) {
    return <div className="p-10 text-center text-slate-400">Loading...</div>;
  }

  const amountOwed = projects
    .filter((p) => !p.paid && p.price)
    .reduce((sum, p) => sum + (p.price || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/" className="mb-6 inline-block text-sm text-slate-400 hover:text-slate-200">
        ← All clients
      </Link>

      <div className="mb-8 flex items-start justify-between rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">{client.name}</h1>
          {client.email && <p className="mt-1 text-sm text-slate-400">{client.email}</p>}
          {client.drive_link && (
            <a
              href={client.drive_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-400 hover:text-brand-300"
            >
              Open Drive Folder ↗
            </a>
          )}
          {client.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{client.notes}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {client.billing_type === "retainer" && (
              <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-sm font-medium text-indigo-400">
                {formatMoney(client.retainer_amount)} / month retainer
              </span>
            )}
            {amountOwed > 0 ? (
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-400">
                Owes {formatMoney(amountOwed)} from per-video work
              </span>
            ) : (
              client.billing_type !== "retainer" && (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-400">
                  Paid up
                </span>
              )
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyPortalLink}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            {copiedPortal ? "Copied!" : "Copy Client Portal Link"}
          </button>
          <button
            onClick={() => setShowEditClient(true)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Edit
          </button>
          <button
            onClick={handleDeleteClient}
            className="rounded-lg border border-red-900 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Projects</h2>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-400">
          No projects yet for this client.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-800 bg-slate-900 shadow-sm transition hover:border-brand-500 hover:shadow-md"
            >
              <Link to={`/clients/${clientId}/projects/${p.id}`} className="block p-5 pb-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-medium text-slate-100">{p.name}</h3>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-xs text-slate-400">
                  {p.export_link ? "Final export ready" : p.footage_link ? "Footage linked" : "Not started"}
                </p>
              </Link>
              <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3">
                <span className={`text-xs font-medium ${p.price != null ? "text-slate-300" : "text-slate-600"}`}>
                  {p.price != null ? formatMoney(p.price) : "No price set"}
                </span>
                <label
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(p.paid)}
                    onChange={(e) => togglePaid(p, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className={p.paid ? "text-emerald-400" : "text-amber-400"}>
                    {p.paid ? "Paid" : "Unpaid"}
                  </span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <Modal title="New Project" onClose={() => setShowNew(false)}>
          <form onSubmit={handleCreateProject} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Project Name</label>
              <input
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. Q3 Brand Video"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Create Project
            </button>
          </form>
        </Modal>
      )}

      {showEditClient && (
        <EditClientModal
          client={client}
          onClose={() => setShowEditClient(false)}
          onSaved={() => {
            setShowEditClient(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function EditClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email || "");
  const [driveLink, setDriveLink] = useState(client.drive_link || "");
  const [notes, setNotes] = useState(client.notes || "");
  const [billingType, setBillingType] = useState<BillingType>(client.billing_type);
  const [retainerAmount, setRetainerAmount] = useState(
    client.retainer_amount != null ? String(client.retainer_amount) : ""
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await api.updateClient(client.id, {
      name,
      email: email || null,
      drive_link: driveLink || null,
      notes: notes || null,
      billing_type: billingType,
      retainer_amount: billingType === "retainer" && retainerAmount ? Number(retainerAmount) : null,
    });
    onSaved();
  }

  return (
    <Modal title="Edit Client" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Drive Link</label>
          <input
            value={driveLink}
            onChange={(e) => setDriveLink(e.target.value)}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Billing</label>
          <select
            value={billingType}
            onChange={(e) => setBillingType(e.target.value as BillingType)}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="per_project">Per Video / Project</option>
            <option value="retainer">Monthly Retainer</option>
          </select>
        </div>
        {billingType === "retainer" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Retainer Amount / Month</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={retainerAmount}
              onChange={(e) => setRetainerAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="2000"
            />
          </div>
        )}
        <button
          type="submit"
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Save Changes
        </button>
      </form>
    </Modal>
  );
}
