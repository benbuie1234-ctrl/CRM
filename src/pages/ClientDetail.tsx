import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, BillingType, Client, DATA_CHANGED_EVENT, Folder, Video } from "../lib/api";
import Modal from "../components/Modal";
import FolderPicker from "../components/FolderPicker";
import StatusBadge from "../components/StatusBadge";
import { formatMoney } from "../lib/format";
import { readDragPayload, setDragPayload } from "../lib/dnd";

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewVideo, setShowNewVideo] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [movingFolder, setMovingFolder] = useState<Folder | null>(null);
  const [movingVideo, setMovingVideo] = useState<Video | null>(null);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | "root" | null>(null);
  const [dragError, setDragError] = useState("");

  function refresh() {
    if (!clientId) return;
    Promise.all([api.getClient(clientId), api.listFolders(clientId), api.listVideos(clientId)]).then(
      ([c, f, v]) => {
        setClient(c);
        setFolders(f);
        setVideos(v);
        setLoading(false);
      }
    );
  }

  useEffect(() => {
    setLoading(true);
    setCurrentFolderId(null);
    refresh();
  }, [clientId]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, [clientId]);

  async function handleDeleteClient() {
    if (!clientId) return;
    if (!confirm(`Delete ${client?.name} and everything inside? This can't be undone.`)) return;
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

  async function togglePaid(video: Video, paid: boolean) {
    setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, paid: (paid ? 1 : 0) as 0 | 1 } : v)));
    await api.updateVideo(video.id, { paid: (paid ? 1 : 0) as 0 | 1 });
  }

  async function handleDeleteFolder(folder: Folder) {
    if (!confirm(`Delete "${folder.name}"? Anything inside moves up a level — nothing gets deleted.`)) return;
    await api.deleteFolder(folder.id);
    refresh();
  }

  async function handleDropOn(targetFolderId: string | null, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    const payload = readDragPayload(e);
    if (!payload) return;
    if (payload.kind === "folder" && payload.id === targetFolderId) return;
    setDragError("");
    try {
      if (payload.kind === "folder") {
        await api.updateFolder(payload.id, { parent_folder_id: targetFolderId });
      } else {
        await api.updateVideo(payload.id, { folder_id: targetFolderId });
      }
      refresh();
    } catch (err) {
      setDragError(err instanceof Error ? err.message : "Couldn't move that there");
      setTimeout(() => setDragError(""), 3000);
    }
  }

  if (loading || !client || !clientId) {
    return <div className="p-10 text-center text-slate-400">Loading...</div>;
  }

  const amountOwed = videos.filter((v) => !v.paid && v.price).reduce((sum, v) => sum + (v.price || 0), 0);

  const visibleFolders = folders
    .filter((f) => f.parent_folder_id === currentFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleVideos = videos
    .filter((v) => v.folder_id === currentFolderId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const breadcrumb: Folder[] = [];
  let cursor = currentFolderId ? folders.find((f) => f.id === currentFolderId) : undefined;
  while (cursor) {
    breadcrumb.unshift(cursor);
    cursor = cursor.parent_folder_id ? folders.find((f) => f.id === cursor!.parent_folder_id) : undefined;
  }

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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button
            onClick={() => setCurrentFolderId(null)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverId("root");
            }}
            onDragLeave={() => setDragOverId((prev) => (prev === "root" ? null : prev))}
            onDrop={(e) => handleDropOn(null, e)}
            className={`rounded px-2 py-1 ${
              currentFolderId === null ? "font-semibold text-slate-100" : "text-slate-400 hover:text-slate-200"
            } ${dragOverId === "root" ? "bg-brand-500/20 ring-1 ring-brand-500" : ""}`}
          >
            🏠 {client.name}
          </button>
          {breadcrumb.map((f, i) => (
            <span key={f.id} className="flex items-center gap-1">
              <span className="text-slate-600">/</span>
              <button
                onClick={() => setCurrentFolderId(f.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverId(f.id);
                }}
                onDragLeave={() => setDragOverId((prev) => (prev === f.id ? null : prev))}
                onDrop={(e) => handleDropOn(f.id, e)}
                className={`rounded px-2 py-1 ${
                  i === breadcrumb.length - 1
                    ? "font-semibold text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                } ${dragOverId === f.id ? "bg-brand-500/20 ring-1 ring-brand-500" : ""}`}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewFolder(true)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            + New Folder
          </button>
          <button
            onClick={() => setShowNewVideo(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + New Video
          </button>
        </div>
      </div>

      {dragError && (
        <p className="mb-3 rounded-lg border border-red-900 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {dragError}
        </p>
      )}

      {visibleFolders.length === 0 && visibleVideos.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverId(currentFolderId ?? "root");
          }}
          onDragLeave={() => setDragOverId(null)}
          onDrop={(e) => handleDropOn(currentFolderId, e)}
          className={`rounded-xl border border-dashed p-12 text-center text-slate-400 ${
            dragOverId === (currentFolderId ?? "root") && dragOverId !== null
              ? "border-brand-500 bg-brand-500/5"
              : "border-slate-700"
          }`}
        >
          Empty folder. Add a video or make a subfolder — or drag one in.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibleFolders.map((f) => (
            <div
              key={f.id}
              draggable
              onDragStart={(e) => setDragPayload(e, { kind: "folder", id: f.id })}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverId(f.id);
              }}
              onDragLeave={() => setDragOverId((prev) => (prev === f.id ? null : prev))}
              onDrop={(e) => handleDropOn(f.id, e)}
              className={`group relative cursor-grab rounded-xl border bg-slate-900 p-4 shadow-sm transition active:cursor-grabbing ${
                dragOverId === f.id ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500" : "border-slate-800 hover:border-brand-500"
              }`}
            >
              <button onClick={() => setCurrentFolderId(f.id)} className="block w-full text-left">
                <div className="mb-2 text-3xl">📁</div>
                <p className="truncate text-sm font-medium text-slate-100">{f.name}</p>
                <p className="text-xs text-slate-500">
                  {folders.filter((sub) => sub.parent_folder_id === f.id).length +
                    videos.filter((v) => v.folder_id === f.id).length}{" "}
                  item(s)
                </p>
              </button>
              <div className="mt-2 flex gap-2 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() => setRenamingFolder(f)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Rename
                </button>
                <button onClick={() => setMovingFolder(f)} className="text-xs text-slate-400 hover:text-slate-200">
                  Move
                </button>
                <button
                  onClick={() => handleDeleteFolder(f)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {visibleVideos.map((v) => (
            <div
              key={v.id}
              draggable
              onDragStart={(e) => setDragPayload(e, { kind: "video", id: v.id })}
              className="cursor-grab rounded-xl border border-slate-800 bg-slate-900 shadow-sm transition hover:border-brand-500 hover:shadow-md active:cursor-grabbing"
            >
              <Link to={`/clients/${clientId}/videos/${v.id}`} className="block p-4 pb-2">
                <div className="mb-2 text-3xl">🎬</div>
                <div className="mb-1 flex items-center justify-between gap-1">
                  <p className="truncate text-sm font-medium text-slate-100">{v.name}</p>
                </div>
                <StatusBadge status={v.status} />
                <p className="mt-1 text-xs text-slate-400">
                  {v.export_link ? "Final export ready" : v.footage_link ? "Footage linked" : "Not started"}
                </p>
              </Link>
              <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2">
                <span className={`text-xs font-medium ${v.price != null ? "text-slate-300" : "text-slate-600"}`}>
                  {v.price != null ? formatMoney(v.price) : "No price"}
                </span>
                <label className="flex items-center gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={Boolean(v.paid)}
                    onChange={(e) => togglePaid(v, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className={v.paid ? "text-emerald-400" : "text-amber-400"}>{v.paid ? "Paid" : "Unpaid"}</span>
                </label>
              </div>
              <div className="border-t border-slate-800 px-4 py-2">
                <button
                  onClick={() => setMovingVideo(v)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Move to folder
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewFolder && (
        <NewFolderModal
          onClose={() => setShowNewFolder(false)}
          onCreate={async (name) => {
            if (!clientId) return;
            await api.createFolder(clientId, { name, parent_folder_id: currentFolderId });
            setShowNewFolder(false);
            refresh();
          }}
        />
      )}

      {renamingFolder && (
        <NewFolderModal
          title="Rename Folder"
          initialName={renamingFolder.name}
          onClose={() => setRenamingFolder(null)}
          onCreate={async (name) => {
            await api.updateFolder(renamingFolder.id, { name });
            setRenamingFolder(null);
            refresh();
          }}
        />
      )}

      {movingFolder && (
        <FolderPicker
          title={`Move "${movingFolder.name}" to...`}
          folders={folders}
          excludeFolderId={movingFolder.id}
          onClose={() => setMovingFolder(null)}
          onSelect={async (folderId) => {
            await api.updateFolder(movingFolder.id, { parent_folder_id: folderId });
            setMovingFolder(null);
            refresh();
          }}
        />
      )}

      {movingVideo && (
        <FolderPicker
          title={`Move "${movingVideo.name}" to...`}
          folders={folders}
          onClose={() => setMovingVideo(null)}
          onSelect={async (folderId) => {
            await api.updateVideo(movingVideo.id, { folder_id: folderId });
            setMovingVideo(null);
            refresh();
          }}
        />
      )}

      {showNewVideo && (
        <Modal title="New Video" onClose={() => setShowNewVideo(false)}>
          <NewVideoForm
            onCreate={async (name) => {
              if (!clientId) return;
              await api.createVideo(clientId, { name, folder_id: currentFolderId });
              setShowNewVideo(false);
              refresh();
            }}
          />
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

function NewFolderModal({
  title = "New Folder",
  initialName = "",
  onClose,
  onCreate,
}: {
  title?: string;
  initialName?: string;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
        className="space-y-3"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Save
        </button>
      </form>
    </Modal>
  );
}

function NewVideoForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
      className="space-y-3"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Video Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          placeholder="e.g. Q3 Brand Video"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Create Video
      </button>
    </form>
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
