import { Folder } from "../lib/api";
import Modal from "./Modal";

function isDescendant(folders: Folder[], candidateId: string, ancestorId: string): boolean {
  let cursor = folders.find((f) => f.id === candidateId);
  while (cursor?.parent_folder_id) {
    if (cursor.parent_folder_id === ancestorId) return true;
    cursor = folders.find((f) => f.id === cursor!.parent_folder_id);
  }
  return false;
}

function sortedTree(folders: Folder[], parentId: string | null, depth: number): { folder: Folder; depth: number }[] {
  const children = folders
    .filter((f) => f.parent_folder_id === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return children.flatMap((f) => [{ folder: f, depth }, ...sortedTree(folders, f.id, depth + 1)]);
}

export default function FolderPicker({
  title,
  rootLabel = "Root",
  folders,
  excludeFolderId,
  onClose,
  onSelect,
}: {
  title: string;
  rootLabel?: string;
  folders: Folder[];
  excludeFolderId?: string;
  onClose: () => void;
  onSelect: (folderId: string | null) => void;
}) {
  const rows = sortedTree(folders, null, 0).filter(
    ({ folder }) =>
      !excludeFolderId || (folder.id !== excludeFolderId && !isDescendant(folders, folder.id, excludeFolderId))
  );

  return (
    <Modal title={title} onClose={onClose}>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        <button
          onClick={() => onSelect(null)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
        >
          🏠 {rootLabel}
        </button>
        {rows.map(({ folder, depth }) => (
          <button
            key={folder.id}
            onClick={() => onSelect(folder.id)}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            className="flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm text-slate-200 hover:bg-slate-800"
          >
            📁 {folder.name}
          </button>
        ))}
        {rows.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No other folders yet.</p>}
      </div>
    </Modal>
  );
}
