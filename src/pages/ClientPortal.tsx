import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, DATA_CHANGED_EVENT, PortalFolder, PortalVideo } from "../lib/api";
import StatusDropdown from "../components/StatusDropdown";
import Modal from "../components/Modal";
import FolderPicker from "../components/FolderPicker";
import AiChatPanel from "../components/AiChatPanel";
import { readDragPayload, setDragPayload } from "../lib/dnd";
import { VideoStatus } from "../lib/status";

export default function ClientPortal() {
  const { slug } = useParams<{ slug: string }>();
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [folders, setFolders] = useState<PortalFolder[]>([]);
  const [videos, setVideos] = useState<PortalVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<PortalFolder | null>(null);
  const [movingFolder, setMovingFolder] = useState<PortalFolder | null>(null);
  const [movingVideo, setMovingVideo] = useState<PortalVideo | null>(null);
  const [viewingVideo, setViewingVideo] = useState<PortalVideo | null>(null);
  const [dragOverId, setDragOverId] = useState<string | "root" | null>(null);
  const [dragError, setDragError] = useState("");

  function refresh() {
    if (!slug) return;
    api
      .getClientPortal(slug)
      .then((d) => {
        setClient(d.client);
        setFolders(d.folders);
        setVideos(d.videos);
        setLoading(false);
      })
      .catch(() => setError(true));
  }

  useEffect(refresh, [slug]);

  useEffect(() => {
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, [slug]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-slate-400">This link isn't valid.</p>
      </div>
    );
  }

  if (loading || !client || !slug) {
    return <div className="p-10 text-center text-slate-400">Loading...</div>;
  }

  const asFolders = folders as any as { id: string; parent_folder_id: string | null; name: string }[];

  const visibleFolders = folders
    .filter((f) => f.parent_folder_id === currentFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleVideos = videos
    .filter((v) => v.folder_id === currentFolderId)
    .sort((a, b) => (a.created_date < b.created_date ? 1 : -1));

  const breadcrumb: PortalFolder[] = [];
  let cursor = currentFolderId ? folders.find((f) => f.id === currentFolderId) : undefined;
  while (cursor) {
    breadcrumb.unshift(cursor);
    cursor = cursor.parent_folder_id ? folders.find((f) => f.id === cursor!.parent_folder_id) : undefined;
  }

  async function handleDeleteFolder(folder: PortalFolder) {
    if (!confirm(`Delete "${folder.name}"? Anything inside moves up a level.`)) return;
    await api.portalDeleteFolder(slug!, folder.id);
    refresh();
  }

  async function updateVideoStatus(video: PortalVideo, status: VideoStatus) {
    setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, status } : v)));
    if (viewingVideo?.id === video.id) setViewingVideo((v) => (v ? { ...v, status } : v));
    await api.portalUpdateVideo(slug!, video.id, { status });
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
        await api.portalUpdateFolder(slug!, payload.id, { parent_folder_id: targetFolderId });
      } else {
        await api.portalUpdateVideo(slug!, payload.id, { folder_id: targetFolderId });
      }
      refresh();
    } catch (err) {
      setDragError(err instanceof Error ? err.message : "Couldn't move that there");
      setTimeout(() => setDragError(""), 3000);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <div className="min-w-0 flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl">
        <p className="mb-1 text-sm text-slate-400">Video hub for</p>
        <h1 className="mb-6 text-2xl font-semibold text-slate-100">{client.name}</h1>

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
          <button
            onClick={() => setShowNewFolder(true)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            + New Folder
          </button>
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
            Nothing here yet — drag something in.
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
                  <button onClick={() => handleDeleteFolder(f)} className="text-xs text-red-400 hover:text-red-300">
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
                className="cursor-grab rounded-xl border border-slate-800 bg-slate-900 shadow-sm transition hover:border-brand-500 active:cursor-grabbing"
              >
                <button onClick={() => setViewingVideo(v)} className="block w-full p-4 pb-2 text-left">
                  <div className="mb-2 text-3xl">🎬</div>
                  <p className="truncate text-sm font-medium text-slate-100">{v.name}</p>
                </button>
                <div className="px-4 pb-2">
                  <StatusDropdown status={v.status} onChange={(s) => updateVideoStatus(v, s)} />
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
        </div>
      </div>

      {showNewFolder && (
        <NewFolderModal
          onClose={() => setShowNewFolder(false)}
          onCreate={async (name) => {
            await api.portalCreateFolder(slug!, { name, parent_folder_id: currentFolderId });
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
            await api.portalUpdateFolder(slug!, renamingFolder.id, { name });
            setRenamingFolder(null);
            refresh();
          }}
        />
      )}

      {movingFolder && (
        <FolderPicker
          title={`Move "${movingFolder.name}" to...`}
          rootLabel={client.name}
          folders={asFolders as any}
          excludeFolderId={movingFolder.id}
          onClose={() => setMovingFolder(null)}
          onSelect={async (folderId) => {
            await api.portalUpdateFolder(slug!, movingFolder.id, { parent_folder_id: folderId });
            setMovingFolder(null);
            refresh();
          }}
        />
      )}

      {movingVideo && (
        <FolderPicker
          title={`Move "${movingVideo.name}" to...`}
          rootLabel={client.name}
          folders={asFolders as any}
          onClose={() => setMovingVideo(null)}
          onSelect={async (folderId) => {
            await api.portalUpdateVideo(slug!, movingVideo.id, { folder_id: folderId });
            setMovingVideo(null);
            refresh();
          }}
        />
      )}

      {viewingVideo && (
        <Modal title={viewingVideo.name} onClose={() => setViewingVideo(null)}>
          <div className="space-y-4">
            <StatusDropdown status={viewingVideo.status} onChange={(s) => updateVideoStatus(viewingVideo, s)} />
            {viewingVideo.instructions && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Instructions</h3>
                <p className="whitespace-pre-wrap text-sm text-slate-300">{viewingVideo.instructions}</p>
              </div>
            )}
            {viewingVideo.footage_link && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Footage</h3>
                <a
                  href={viewingVideo.footage_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-brand-400 hover:text-brand-300"
                >
                  Open footage link ↗
                </a>
              </div>
            )}
            {viewingVideo.export_link ? (
              <div className="rounded-lg bg-emerald-500/10 p-3">
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-400">Final Export</h3>
                <a
                  href={viewingVideo.export_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Watch / Download Final Video ↗
                </a>
              </div>
            ) : (
              <p className="text-sm text-slate-500">The final export hasn't been posted yet.</p>
            )}
          </div>
        </Modal>
      )}

      <AiChatPanel portalSlug={slug} />
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
