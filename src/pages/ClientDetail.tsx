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

  if (loading || !client) {
    return <div className="p-10 text-center text-slate-400">Loading...</div>;
  }

  const amountOwed = projects
    .filter((p) => !p.paid && p.price)
    .reduce((sum, p) => sum + (p.price || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/" className="mb-6 inline-block text-sm text-slate-500 hover:text-slate-700">
        ← All clients
      </Link>

      <div className="mb-8 flex items-start justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{client.name}</h1>
          {client.email && <p className="mt-1 text-sm text-slate-500">{client.email}</p>}
          {client.drive_link && (
            <a
              href={client.drive_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Open Drive Folder ↗
            </a>
          )}
          {client.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{client.notes}</p>}

          <div className="mt-4">
            {client.billing_type === "retainer" ? (
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
                {formatMoney(client.retainer_amount)} / month retainer
              </span>
            ) : (
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  amountOwed > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {amountOwed > 0 ? `Owes ${formatMoney(amountOwed)}` : "Paid up"}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowEditClient(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            onClick={handleDeleteClient}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          No projects yet for this client.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/clients/${clientId}/projects/${p.id}`}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium text-slate-900">{p.name}</h3>
                <StatusBadge status={p.status} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {p.export_link ? "Final export ready" : p.footage_link ? "Footage linked" : "Not started"}
                </p>
                {p.price != null && (
                  <span
                    className={`text-xs font-medium ${p.paid ? "text-emerald-600" : "text-amber-600"}`}
                  >
                    {formatMoney(p.price)} {p.paid ? "· Paid" : "· Unpaid"}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <Modal title="New Project" onClose={() => setShowNew(false)}>
          <form onSubmit={handleCreateProject} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Project Name</label>
              <input
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
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
          <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Drive Link</label>
          <input
            value={driveLink}
            onChange={(e) => setDriveLink(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Billing</label>
          <select
            value={billingType}
            onChange={(e) => setBillingType(e.target.value as BillingType)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="per_project">Per Video / Project</option>
            <option value="retainer">Monthly Retainer</option>
          </select>
        </div>
        {billingType === "retainer" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Retainer Amount / Month</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={retainerAmount}
              onChange={(e) => setRetainerAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
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
