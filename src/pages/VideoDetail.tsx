import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Client, Folder, Video } from "../lib/api";
import StatusDropdown from "../components/StatusDropdown";
import FolderPicker from "../components/FolderPicker";
import { VideoStatus } from "../lib/status";

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function VideoDetail() {
  const { clientId, videoId } = useParams<{ clientId: string; videoId: string }>();
  const navigate = useNavigate();
  const [video, setVideo] = useState<Video | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMove, setShowMove] = useState(false);

  const [name, setName] = useState("");
  const [footageLink, setFootageLink] = useState("");
  const [referenceLinks, setReferenceLinks] = useState("");
  const [instructions, setInstructions] = useState("");
  const [exportLink, setExportLink] = useState("");
  const [createdDate, setCreatedDate] = useState("");
  const [completedDate, setCompletedDate] = useState("");
  const [priceInput, setPriceInput] = useState("");

  function loadFromVideo(v: Video) {
    setVideo(v);
    setName(v.name);
    setFootageLink(v.footage_link || "");
    setReferenceLinks(v.reference_links || "");
    setInstructions(v.instructions || "");
    setExportLink(v.export_link || "");
    setCreatedDate(v.created_date || "");
    setCompletedDate(v.completed_date || "");
    setPriceInput(v.price != null ? String(v.price) : "");
  }

  useEffect(() => {
    if (!videoId || !clientId) return;
    Promise.all([api.getVideo(videoId), api.listFolders(clientId), api.getClient(clientId)]).then(
      ([v, f, c]) => {
        loadFromVideo(v);
        setFolders(f);
        setClient(c);
        setLoading(false);
      }
    );
  }, [videoId, clientId]);

  async function handleSave() {
    if (!videoId) return;
    setSaving(true);
    const updated = await api.updateVideo(videoId, {
      name,
      footage_link: footageLink || null,
      reference_links: referenceLinks || null,
      instructions: instructions || null,
      export_link: exportLink || null,
      created_date: createdDate,
      completed_date: completedDate || null,
    });
    loadFromVideo(updated);
    setSaving(false);
    setEditing(false);
  }

  function handleCancelEdit() {
    if (video) loadFromVideo(video);
    setEditing(false);
  }

  async function handleStatusChange(status: VideoStatus) {
    if (!videoId) return;
    const updated = await api.updateVideo(videoId, { status });
    loadFromVideo(updated);
  }

  async function handlePaidChange(paid: boolean) {
    if (!videoId) return;
    const updated = await api.updateVideo(videoId, { paid: (paid ? 1 : 0) as 0 | 1 });
    loadFromVideo(updated);
  }

  async function handlePriceBlur() {
    if (!videoId) return;
    const val = priceInput ? Number(priceInput) : null;
    if (val === video?.price) return;
    const updated = await api.updateVideo(videoId, { price: val });
    loadFromVideo(updated);
  }

  async function handleMoveTo(folderId: string | null) {
    if (!videoId) return;
    setShowMove(false);
    const updated = await api.updateVideo(videoId, { folder_id: folderId });
    loadFromVideo(updated);
  }

  async function handleDelete() {
    if (!videoId || !clientId) return;
    if (!confirm(`Delete "${video?.name}"? This can't be undone.`)) return;
    await api.deleteVideo(videoId);
    navigate(`/clients/${clientId}`);
  }

  function copyShareLink() {
    if (!video) return;
    const url = `${window.location.origin}/share/${video.share_slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading || !video || !client) {
    return <div className="p-10 text-center text-slate-400">Loading...</div>;
  }

  const folderName = video.folder_id ? folders.find((f) => f.id === video.folder_id)?.name : null;
  const referenceList = referenceLinks.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link to={`/clients/${clientId}`} className="mb-6 inline-block text-sm text-slate-400 hover:text-slate-200">
        ← Back to client
      </Link>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <div className="mb-1 flex items-start justify-between gap-3">
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-none bg-transparent text-2xl font-semibold text-slate-100 outline-none"
            />
          ) : (
            <h1 className="text-2xl font-semibold text-slate-100">{video.name}</h1>
          )}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              title="Edit details"
              className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-brand-500 hover:text-brand-400"
            >
              ✏️
            </button>
          )}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <StatusDropdown status={video.status} onChange={handleStatusChange} />
          <button
            onClick={() => setShowMove(true)}
            className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
          >
            📁 {folderName || client.name}
          </button>
        </div>

        {!editing ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</p>
                <p className="text-slate-200">{formatDate(video.created_date)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Completed</p>
                <p className="text-slate-200">{formatDate(video.completed_date)}</p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Raw Footage</p>
              {video.footage_link ? (
                <a
                  href={video.footage_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-brand-400 hover:text-brand-300"
                >
                  Open footage link ↗
                </a>
              ) : (
                <p className="text-sm text-slate-500">Not linked yet.</p>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Reference Video(s)</p>
              {referenceList.length > 0 ? (
                <ul className="space-y-0.5">
                  {referenceList.map((link, i) => (
                    <li key={i}>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-400 hover:text-brand-300"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">None.</p>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Instructions</p>
              {video.instructions ? (
                <p className="whitespace-pre-wrap text-sm text-slate-200">{video.instructions}</p>
              ) : (
                <p className="text-sm text-slate-500">
                  No instructions yet — paste the client's message into the AI Assistant and ask it to summarize
                  them here.
                </p>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Final Export</p>
              {video.export_link ? (
                <a
                  href={video.export_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
                >
                  Watch / Download Final Video ↗
                </a>
              ) : (
                <p className="text-sm text-slate-500">Not delivered yet.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
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
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Raw Footage / Download Link</label>
              <input
                value={footageLink}
                onChange={(e) => setFootageLink(e.target.value)}
                placeholder="https://drive.google.com/... or WeTransfer link"
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Reference Video Link(s)</label>
              <textarea
                value={referenceLinks}
                onChange={(e) => setReferenceLinks(e.target.value)}
                rows={3}
                placeholder="Example videos the client sent, one link per line"
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

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Final Export Link</label>
              <input
                value={exportLink}
                onChange={(e) => setExportLink(e.target.value)}
                placeholder="https://drive.google.com/... final video"
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg bg-slate-950 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Price</label>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 pl-3 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
              <span className="text-sm text-slate-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                onBlur={handlePriceBlur}
                placeholder="500"
                className="w-full rounded-lg border-none bg-transparent px-2 py-2 text-sm outline-none"
              />
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(video.paid)}
                onChange={(e) => handlePaidChange(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 text-brand-600 focus:ring-brand-500"
              />
              Paid
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-5">
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={copyShareLink}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                {copied ? "Copied!" : "Copy Client Share Link"}
              </button>
            )}
          </div>
          <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-300">
            Delete Video
          </button>
        </div>
      </div>

      {showMove && (
        <FolderPicker
          title="Move to..."
          rootLabel={client.name}
          folders={folders}
          onClose={() => setShowMove(false)}
          onSelect={handleMoveTo}
        />
      )}
    </div>
  );
}
