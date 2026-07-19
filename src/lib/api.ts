export type Video = {
  id: string;
  client_id: string;
  folder_id: string | null;
  name: string;
  status: "in_progress" | "review" | "delivered";
  footage_link: string | null;
  reference_links: string | null;
  instructions: string | null;
  export_link: string | null;
  price: number | null;
  paid: 0 | 1;
  created_date: string;
  completed_date: string | null;
  share_slug: string;
  created_at: string;
  updated_at: string;
};

export type Folder = {
  id: string;
  client_id: string;
  parent_folder_id: string | null;
  name: string;
  created_at: string;
};

export type BillingType = "per_project" | "retainer";

export type Client = {
  id: string;
  name: string;
  email: string | null;
  drive_link: string | null;
  notes: string | null;
  billing_type: BillingType;
  retainer_amount: number | null;
  share_slug: string;
  created_at: string;
  project_count?: number;
  amount_owed?: number;
};

export type PortalVideo = Pick<
  Video,
  "id" | "folder_id" | "name" | "status" | "footage_link" | "instructions" | "export_link" | "share_slug" | "created_date" | "completed_date"
>;

export type PortalFolder = Pick<Folder, "id" | "parent_folder_id" | "name">;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatAction = {
  ok: boolean;
  client?: Client;
  folder?: Folder;
  video?: Video;
  error?: string;
};

class UnauthorizedError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
  });
  if (res.status === 401) throw new UnauthorizedError("Not authenticated");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { UnauthorizedError };

export const DATA_CHANGED_EVENT = "crm:data-changed";

function notifyDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

export const api = {
  login: (passphrase: string) =>
    request<{ ok: true }>("/login", { method: "POST", body: JSON.stringify({ passphrase }) }),
  logout: () => request<{ ok: true }>("/logout", { method: "POST" }),

  listClients: () => request<Client[]>("/clients"),
  getClient: (id: string) => request<Client>(`/clients/${id}`),
  createClient: async (data: Partial<Client>) => {
    const c = await request<Client>("/clients", { method: "POST", body: JSON.stringify(data) });
    notifyDataChanged();
    return c;
  },
  updateClient: async (id: string, data: Partial<Client>) => {
    const c = await request<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    notifyDataChanged();
    return c;
  },
  deleteClient: async (id: string) => {
    await request<void>(`/clients/${id}`, { method: "DELETE" });
    notifyDataChanged();
  },

  listFolders: (clientId: string) => request<Folder[]>(`/clients/${clientId}/folders`),
  createFolder: async (clientId: string, data: { name: string; parent_folder_id?: string | null }) => {
    const f = await request<Folder>(`/clients/${clientId}/folders`, { method: "POST", body: JSON.stringify(data) });
    notifyDataChanged();
    return f;
  },
  updateFolder: async (id: string, data: { name?: string; parent_folder_id?: string | null }) => {
    const f = await request<Folder>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    notifyDataChanged();
    return f;
  },
  deleteFolder: async (id: string) => {
    await request<void>(`/folders/${id}`, { method: "DELETE" });
    notifyDataChanged();
  },

  listVideos: (clientId: string) => request<Video[]>(`/clients/${clientId}/videos`),
  getVideo: (id: string) => request<Video>(`/videos/${id}`),
  createVideo: async (clientId: string, data: Partial<Video>) => {
    const v = await request<Video>(`/clients/${clientId}/videos`, { method: "POST", body: JSON.stringify(data) });
    notifyDataChanged();
    return v;
  },
  updateVideo: async (id: string, data: Partial<Video>) => {
    const v = await request<Video>(`/videos/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    notifyDataChanged();
    return v;
  },
  deleteVideo: async (id: string) => {
    await request<void>(`/videos/${id}`, { method: "DELETE" });
    notifyDataChanged();
  },

  getShared: (slug: string) =>
    request<{ video: Video; client: { name: string } }>(`/share/${slug}`),

  getClientPortal: (slug: string) =>
    request<{ client: { id: string; name: string }; folders: PortalFolder[]; videos: PortalVideo[] }>(
      `/portal/${slug}`
    ),
  portalCreateFolder: (slug: string, data: { name: string; parent_folder_id?: string | null }) =>
    request<PortalFolder>(`/portal/${slug}/folders`, { method: "POST", body: JSON.stringify(data) }),
  portalUpdateFolder: (slug: string, folderId: string, data: { name?: string; parent_folder_id?: string | null }) =>
    request<PortalFolder>(`/portal/${slug}/folders/${folderId}`, { method: "PATCH", body: JSON.stringify(data) }),
  portalDeleteFolder: (slug: string, folderId: string) =>
    request<void>(`/portal/${slug}/folders/${folderId}`, { method: "DELETE" }),
  portalMoveVideo: (slug: string, videoId: string, folder_id: string | null) =>
    request<PortalVideo>(`/portal/${slug}/videos/${videoId}`, {
      method: "PATCH",
      body: JSON.stringify({ folder_id }),
    }),

  chat: async (messages: ChatMessage[]) => {
    const res = await request<{ reply: string; action?: ChatAction }>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    });
    if (res.action?.ok) notifyDataChanged();
    return res;
  },
};
