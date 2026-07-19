export type Project = {
  id: string;
  client_id: string;
  name: string;
  status: "in_progress" | "review" | "delivered";
  footage_link: string | null;
  reference_links: string | null;
  instructions: string | null;
  export_link: string | null;
  price: number | null;
  paid: 0 | 1;
  share_slug: string;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  project_count?: number;
  amount_owed?: number;
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

export const api = {
  login: (passphrase: string) =>
    request<{ ok: true }>("/login", { method: "POST", body: JSON.stringify({ passphrase }) }),
  logout: () => request<{ ok: true }>("/logout", { method: "POST" }),

  listClients: () => request<Client[]>("/clients"),
  getClient: (id: string) => request<Client>(`/clients/${id}`),
  createClient: (data: Partial<Client>) =>
    request<Client>("/clients", { method: "POST", body: JSON.stringify(data) }),
  updateClient: (id: string, data: Partial<Client>) =>
    request<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteClient: (id: string) => request<void>(`/clients/${id}`, { method: "DELETE" }),

  listProjects: (clientId: string) => request<Project[]>(`/clients/${clientId}/projects`),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (clientId: string, data: Partial<Project>) =>
    request<Project>(`/clients/${clientId}/projects`, { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  getShared: (slug: string) =>
    request<{ project: Project; client: { name: string } }>(`/share/${slug}`),

  summarize: (text: string) =>
    request<{ summary: string }>("/ai/summarize", { method: "POST", body: JSON.stringify({ text }) }),
};
