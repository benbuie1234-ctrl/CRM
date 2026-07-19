import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, BillingType, Client } from "../lib/api";
import Modal from "../components/Modal";
import { formatMoney } from "../lib/format";

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [driveLink, setDriveLink] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("per_project");
  const [retainerAmount, setRetainerAmount] = useState("");

  function refresh() {
    setLoading(true);
    api.listClients().then((c) => {
      setClients(c);
      setLoading(false);
    });
  }

  useEffect(refresh, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createClient({
      name,
      email: email || null,
      drive_link: driveLink || null,
      billing_type: billingType,
      retainer_amount: billingType === "retainer" && retainerAmount ? Number(retainerAmount) : null,
    });
    setShowNew(false);
    setName("");
    setEmail("");
    setDriveLink("");
    setBillingType("per_project");
    setRetainerAmount("");
    refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500">All your video editing clients in one place.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New Client
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          No clients yet. Add your first one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link
              key={c.id}
              to={`/clients/${c.id}`}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <h3 className="font-medium text-slate-900">{c.name}</h3>
              {c.email && <p className="mt-0.5 text-sm text-slate-500">{c.email}</p>}
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {c.project_count ?? 0} project{c.project_count === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-1.5">
                  {c.billing_type === "retainer" && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {formatMoney(c.retainer_amount)}/mo
                    </span>
                  )}
                  {(c.amount_owed ?? 0) > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Owed {formatMoney(c.amount_owed)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <Modal title="New Client" onClose={() => setShowNew(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Client name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="client@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Drive Link</label>
              <input
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="https://drive.google.com/..."
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
              Create Client
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
