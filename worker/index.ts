export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI: { run(model: string, options: Record<string, unknown>): Promise<{ response?: string }> };
  ADMIN_PASSPHRASE: string;
  AUTH_SECRET: string;
}

const AUTH_COOKIE = "crm_auth";
const VALID_STATUSES = ["in_progress", "review", "delivered"];
const VALID_BILLING_TYPES = ["per_project", "retainer"];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newId(): string {
  return crypto.randomUUID();
}

function newSlug(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

async function isAuthed(request: Request, env: Env): Promise<boolean> {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
  const token = match?.[1];
  const expected = await sha256Hex(env.AUTH_SECRET);
  return Boolean(token && token === expected);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const passphrase = (body as any).passphrase;

  if (!passphrase || passphrase !== env.ADMIN_PASSPHRASE) {
    return errorResponse("Invalid passphrase", 401);
  }

  const token = await sha256Hex(env.AUTH_SECRET);
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append(
    "Set-Cookie",
    `${AUTH_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
  );
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function handleLogout(): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", `${AUTH_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

// ---------- Clients ----------

async function listClients(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT c.*, COUNT(v.id) as project_count,
       COALESCE(SUM(CASE WHEN v.paid = 0 THEN v.price ELSE 0 END), 0) as amount_owed
     FROM clients c
     LEFT JOIN videos v ON v.client_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  ).all();
  return json(results);
}

type ClientInput = {
  name: string;
  email?: string | null;
  drive_link?: string | null;
  notes?: string | null;
  billing_type?: string | null;
  retainer_amount?: number | null;
};

async function insertClientRow(env: Env, input: ClientInput) {
  const id = newId();
  const slug = newSlug();
  const billingType =
    input.billing_type && VALID_BILLING_TYPES.includes(input.billing_type) ? input.billing_type : "per_project";

  await env.DB.prepare(
    `INSERT INTO clients (id, name, email, drive_link, notes, billing_type, retainer_amount, share_slug)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      input.name.trim(),
      input.email || null,
      input.drive_link || null,
      input.notes || null,
      billingType,
      billingType === "retainer" ? input.retainer_amount ?? null : null,
      slug
    )
    .run();

  return env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
}

async function createClient(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as any;

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return errorResponse("Client name is required");
  }
  if (body.billing_type && !VALID_BILLING_TYPES.includes(body.billing_type)) {
    return errorResponse("Invalid billing type");
  }

  const client = await insertClientRow(env, body);
  return json(client, 201);
}

async function getClient(env: Env, id: string): Promise<Response> {
  const client = await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
  if (!client) return errorResponse("Client not found", 404);
  return json(client);
}

async function updateClient(request: Request, env: Env, id: string): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse("Client not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  const name = body.name ?? (existing as any).name;
  const email = body.email !== undefined ? body.email : (existing as any).email;
  const drive_link = body.drive_link !== undefined ? body.drive_link : (existing as any).drive_link;
  const notes = body.notes !== undefined ? body.notes : (existing as any).notes;
  const billing_type = body.billing_type ?? (existing as any).billing_type;
  const retainer_amount =
    body.retainer_amount !== undefined ? body.retainer_amount : (existing as any).retainer_amount;

  if (!name || !String(name).trim()) return errorResponse("Client name is required");
  if (!VALID_BILLING_TYPES.includes(billing_type)) return errorResponse("Invalid billing type");

  await env.DB.prepare(
    `UPDATE clients
     SET name = ?, email = ?, drive_link = ?, notes = ?, billing_type = ?, retainer_amount = ?
     WHERE id = ?`
  )
    .bind(
      name,
      email,
      drive_link,
      notes,
      billing_type,
      billing_type === "retainer" ? retainer_amount : null,
      id
    )
    .run();

  const updated = await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
  return json(updated);
}

async function deleteClient(env: Env, id: string): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse("Client not found", 404);

  await env.DB.prepare(`DELETE FROM clients WHERE id = ?`).bind(id).run();
  return new Response(null, { status: 204 });
}

// ---------- Folders ----------

async function listFolders(env: Env, clientId: string): Promise<Response> {
  const client = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse("Client not found", 404);

  const { results } = await env.DB.prepare(
    `SELECT * FROM folders WHERE client_id = ? ORDER BY name COLLATE NOCASE`
  )
    .bind(clientId)
    .all();
  return json(results);
}

async function insertFolderRow(env: Env, clientId: string, name: string, parentFolderId: string | null) {
  const id = newId();
  await env.DB.prepare(`INSERT INTO folders (id, client_id, parent_folder_id, name) VALUES (?, ?, ?, ?)`)
    .bind(id, clientId, parentFolderId || null, name.trim())
    .run();
  return env.DB.prepare(`SELECT * FROM folders WHERE id = ?`).bind(id).first();
}

async function createFolder(request: Request, env: Env, clientId: string): Promise<Response> {
  const client = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse("Client not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  if (!body.name || !String(body.name).trim()) return errorResponse("Folder name is required");

  if (body.parent_folder_id) {
    const parent = await env.DB.prepare(`SELECT id FROM folders WHERE id = ? AND client_id = ?`)
      .bind(body.parent_folder_id, clientId)
      .first();
    if (!parent) return errorResponse("Parent folder not found", 404);
  }

  const folder = await insertFolderRow(env, clientId, body.name, body.parent_folder_id || null);
  return json(folder, 201);
}

async function updateFolder(request: Request, env: Env, id: string): Promise<Response> {
  const existing = (await env.DB.prepare(`SELECT * FROM folders WHERE id = ?`).bind(id).first()) as any;
  if (!existing) return errorResponse("Folder not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  const name = body.name !== undefined ? body.name : existing.name;
  const parent_folder_id = body.parent_folder_id !== undefined ? body.parent_folder_id : existing.parent_folder_id;

  if (!name || !String(name).trim()) return errorResponse("Folder name is required");

  if (parent_folder_id) {
    if (parent_folder_id === id) return errorResponse("A folder can't be moved into itself");
    const parent = await env.DB.prepare(`SELECT id FROM folders WHERE id = ? AND client_id = ?`)
      .bind(parent_folder_id, existing.client_id)
      .first();
    if (!parent) return errorResponse("Parent folder not found", 404);
    // prevent creating a cycle by moving a folder under one of its own descendants
    let cursor: any = parent;
    while (cursor) {
      if (cursor.id === id) return errorResponse("Can't move a folder into its own subfolder");
      cursor = cursor.parent_folder_id
        ? await env.DB.prepare(`SELECT id, parent_folder_id FROM folders WHERE id = ?`).bind(cursor.parent_folder_id).first()
        : null;
    }
  }

  await env.DB.prepare(`UPDATE folders SET name = ?, parent_folder_id = ? WHERE id = ?`)
    .bind(name.trim(), parent_folder_id || null, id)
    .run();

  const updated = await env.DB.prepare(`SELECT * FROM folders WHERE id = ?`).bind(id).first();
  return json(updated);
}

async function deleteFolder(env: Env, id: string): Promise<Response> {
  const existing = (await env.DB.prepare(`SELECT * FROM folders WHERE id = ?`).bind(id).first()) as any;
  if (!existing) return errorResponse("Folder not found", 404);

  const parentId = existing.parent_folder_id || null;
  // reparent children (folders and videos) up to this folder's parent instead of deleting them
  await env.DB.prepare(`UPDATE folders SET parent_folder_id = ? WHERE parent_folder_id = ?`).bind(parentId, id).run();
  await env.DB.prepare(`UPDATE videos SET folder_id = ? WHERE folder_id = ?`).bind(parentId, id).run();
  await env.DB.prepare(`DELETE FROM folders WHERE id = ?`).bind(id).run();

  return new Response(null, { status: 204 });
}

// ---------- Videos ----------

type VideoInput = {
  name: string;
  status?: string;
  folder_id?: string | null;
  footage_link?: string | null;
  reference_links?: string | null;
  instructions?: string | null;
  export_link?: string | null;
  price?: number | null;
  paid?: boolean | 0 | 1;
  created_date?: string | null;
  completed_date?: string | null;
};

async function insertVideoRow(env: Env, clientId: string, input: VideoInput) {
  const id = newId();
  const slug = newSlug();
  const today = new Date().toISOString().slice(0, 10);
  const status = input.status && VALID_STATUSES.includes(input.status) ? input.status : "in_progress";
  const completedDate = input.completed_date || (status === "delivered" ? today : null);

  await env.DB.prepare(
    `INSERT INTO videos
       (id, client_id, folder_id, name, status, footage_link, reference_links, instructions, export_link, price, paid,
        created_date, completed_date, share_slug)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      clientId,
      input.folder_id || null,
      input.name.trim(),
      status,
      input.footage_link || null,
      input.reference_links || null,
      input.instructions || null,
      input.export_link || null,
      input.price ?? null,
      input.paid ? 1 : 0,
      input.created_date || today,
      completedDate,
      slug
    )
    .run();

  return env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
}

async function listVideos(env: Env, clientId: string): Promise<Response> {
  const client = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse("Client not found", 404);

  const { results } = await env.DB.prepare(
    `SELECT * FROM videos WHERE client_id = ? ORDER BY created_at DESC`
  )
    .bind(clientId)
    .all();
  return json(results);
}

async function createVideo(request: Request, env: Env, clientId: string): Promise<Response> {
  const client = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse("Client not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  if (!body.name || !String(body.name).trim()) return errorResponse("Video name is required");

  if (body.folder_id) {
    const folder = await env.DB.prepare(`SELECT id FROM folders WHERE id = ? AND client_id = ?`)
      .bind(body.folder_id, clientId)
      .first();
    if (!folder) return errorResponse("Folder not found", 404);
  }

  const video = await insertVideoRow(env, clientId, body);
  return json(video, 201);
}

async function getVideo(env: Env, id: string): Promise<Response> {
  const video = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
  if (!video) return errorResponse("Video not found", 404);
  return json(video);
}

async function updateVideo(request: Request, env: Env, id: string): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse("Video not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  const ex = existing as any;
  const name = body.name ?? ex.name;
  const status = body.status ?? ex.status;
  const folder_id = body.folder_id !== undefined ? body.folder_id : ex.folder_id;
  const footage_link = body.footage_link !== undefined ? body.footage_link : ex.footage_link;
  const reference_links = body.reference_links !== undefined ? body.reference_links : ex.reference_links;
  const instructions = body.instructions !== undefined ? body.instructions : ex.instructions;
  const export_link = body.export_link !== undefined ? body.export_link : ex.export_link;
  const price = body.price !== undefined ? body.price : ex.price;
  const paid = body.paid !== undefined ? (body.paid ? 1 : 0) : ex.paid;
  const created_date = body.created_date !== undefined ? body.created_date : ex.created_date;

  let completed_date = body.completed_date !== undefined ? body.completed_date : ex.completed_date;
  if (status === "delivered" && !completed_date) {
    completed_date = new Date().toISOString().slice(0, 10);
  }
  if (status !== "delivered" && body.completed_date === undefined) {
    completed_date = ex.completed_date;
  }

  if (!name || !String(name).trim()) return errorResponse("Video name is required");
  if (!VALID_STATUSES.includes(status)) return errorResponse("Invalid status");

  if (folder_id) {
    const folder = await env.DB.prepare(`SELECT id FROM folders WHERE id = ? AND client_id = ?`)
      .bind(folder_id, ex.client_id)
      .first();
    if (!folder) return errorResponse("Folder not found", 404);
  }

  await env.DB.prepare(
    `UPDATE videos
     SET name = ?, status = ?, folder_id = ?, footage_link = ?, reference_links = ?, instructions = ?, export_link = ?,
         price = ?, paid = ?, created_date = ?, completed_date = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      name,
      status,
      folder_id || null,
      footage_link,
      reference_links,
      instructions,
      export_link,
      price,
      paid,
      created_date,
      completed_date,
      id
    )
    .run();

  const updated = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
  return json(updated);
}

async function deleteVideo(env: Env, id: string): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT id FROM videos WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse("Video not found", 404);

  await env.DB.prepare(`DELETE FROM videos WHERE id = ?`).bind(id).run();
  return new Response(null, { status: 204 });
}

// ---------- Public share (single video) ----------

async function getShared(env: Env, slug: string): Promise<Response> {
  const video = await env.DB.prepare(`SELECT * FROM videos WHERE share_slug = ?`).bind(slug).first();
  if (!video) return errorResponse("Not found", 404);

  const client = await env.DB.prepare(`SELECT name FROM clients WHERE id = ?`)
    .bind((video as any).client_id)
    .first();

  return json({ video, client });
}

// ---------- Public client portal (folders + videos, client can organize but not edit/delete videos) ----------

async function resolveClientBySlug(env: Env, slug: string): Promise<{ id: string; name: string } | null> {
  const client = await env.DB.prepare(`SELECT id, name FROM clients WHERE share_slug = ?`).bind(slug).first();
  return (client as any) || null;
}

async function getClientPortal(env: Env, slug: string): Promise<Response> {
  const client = await resolveClientBySlug(env, slug);
  if (!client) return errorResponse("Not found", 404);

  const { results: folders } = await env.DB.prepare(
    `SELECT id, parent_folder_id, name FROM folders WHERE client_id = ? ORDER BY name COLLATE NOCASE`
  )
    .bind(client.id)
    .all();

  const { results: videos } = await env.DB.prepare(
    `SELECT id, folder_id, name, status, footage_link, instructions, export_link, share_slug, created_date, completed_date
     FROM videos WHERE client_id = ? ORDER BY created_at DESC`
  )
    .bind(client.id)
    .all();

  return json({ client, folders, videos });
}

async function portalCreateFolder(request: Request, env: Env, slug: string): Promise<Response> {
  const client = await resolveClientBySlug(env, slug);
  if (!client) return errorResponse("Not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  if (!body.name || !String(body.name).trim()) return errorResponse("Folder name is required");

  if (body.parent_folder_id) {
    const parent = await env.DB.prepare(`SELECT id FROM folders WHERE id = ? AND client_id = ?`)
      .bind(body.parent_folder_id, client.id)
      .first();
    if (!parent) return errorResponse("Parent folder not found", 404);
  }

  const folder = await insertFolderRow(env, client.id, body.name, body.parent_folder_id || null);
  return json(folder, 201);
}

async function portalUpdateFolder(request: Request, env: Env, slug: string, folderId: string): Promise<Response> {
  const client = await resolveClientBySlug(env, slug);
  if (!client) return errorResponse("Not found", 404);

  const folder = await env.DB.prepare(`SELECT * FROM folders WHERE id = ? AND client_id = ?`)
    .bind(folderId, client.id)
    .first();
  if (!folder) return errorResponse("Folder not found", 404);

  return updateFolder(request, env, folderId);
}

async function portalDeleteFolder(env: Env, slug: string, folderId: string): Promise<Response> {
  const client = await resolveClientBySlug(env, slug);
  if (!client) return errorResponse("Not found", 404);

  const folder = await env.DB.prepare(`SELECT id FROM folders WHERE id = ? AND client_id = ?`)
    .bind(folderId, client.id)
    .first();
  if (!folder) return errorResponse("Folder not found", 404);

  return deleteFolder(env, folderId);
}

async function portalUpdateVideo(request: Request, env: Env, slug: string, videoId: string): Promise<Response> {
  const client = await resolveClientBySlug(env, slug);
  if (!client) return errorResponse("Not found", 404);

  const existing = (await env.DB.prepare(`SELECT * FROM videos WHERE id = ? AND client_id = ?`)
    .bind(videoId, client.id)
    .first()) as any;
  if (!existing) return errorResponse("Video not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;

  const folderId = body.folder_id !== undefined ? body.folder_id || null : existing.folder_id;
  if (folderId) {
    const folder = await env.DB.prepare(`SELECT id FROM folders WHERE id = ? AND client_id = ?`)
      .bind(folderId, client.id)
      .first();
    if (!folder) return errorResponse("Folder not found", 404);
  }

  let status = existing.status;
  let completed_date = existing.completed_date;
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return errorResponse("Invalid status");
    status = body.status;
    if (status === "delivered" && !completed_date) {
      completed_date = new Date().toISOString().slice(0, 10);
    }
  }

  await env.DB.prepare(
    `UPDATE videos SET folder_id = ?, status = ?, completed_date = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(folderId, status, completed_date, videoId)
    .run();

  const updated = await env.DB.prepare(
    `SELECT id, folder_id, name, status, footage_link, instructions, export_link, share_slug, created_date, completed_date
     FROM videos WHERE id = ?`
  )
    .bind(videoId)
    .first();
  return json(updated);
}

// ---------- AI chat ----------

async function findClientByName(env: Env, name: string): Promise<{ id: string; name: string } | null | "ambiguous"> {
  const exact = await env.DB.prepare(`SELECT id, name FROM clients WHERE lower(name) = lower(?)`)
    .bind(name)
    .first();
  if (exact) return exact as any;

  const { results } = await env.DB.prepare(`SELECT id, name FROM clients WHERE lower(name) LIKE '%' || lower(?) || '%'`)
    .bind(name)
    .all();
  if (results.length === 1) return results[0] as any;
  if (results.length > 1) return "ambiguous";
  return null;
}

async function findVideoByName(
  env: Env,
  clientId: string,
  name: string
): Promise<{ id: string } | null | "ambiguous"> {
  const exact = await env.DB.prepare(`SELECT id FROM videos WHERE client_id = ? AND lower(name) = lower(?)`)
    .bind(clientId, name)
    .first();
  if (exact) return exact as any;

  const { results } = await env.DB.prepare(
    `SELECT id FROM videos WHERE client_id = ? AND lower(name) LIKE '%' || lower(?) || '%'`
  )
    .bind(clientId, name)
    .all();
  if (results.length === 1) return results[0] as any;
  if (results.length > 1) return "ambiguous";
  return null;
}

async function findFolderByName(
  env: Env,
  clientId: string,
  name: string
): Promise<{ id: string } | null | "ambiguous"> {
  const exact = await env.DB.prepare(`SELECT id FROM folders WHERE client_id = ? AND lower(name) = lower(?)`)
    .bind(clientId, name)
    .first();
  if (exact) return exact as any;

  const { results } = await env.DB.prepare(
    `SELECT id FROM folders WHERE client_id = ? AND lower(name) LIKE '%' || lower(?) || '%'`
  )
    .bind(clientId, name)
    .all();
  if (results.length === 1) return results[0] as any;
  if (results.length > 1) return "ambiguous";
  return null;
}

type ChatAction = {
  type: "create_client" | "update_client" | "create_folder" | "create_video" | "update_video";
  client_name?: string;
  new_client_name?: string;
  email?: string;
  drive_link?: string;
  notes?: string;
  billing_type?: string;
  retainer_amount?: number;
  folder_name?: string;
  parent_folder_name?: string;
  video_name?: string;
  new_video_name?: string;
  move_to_folder?: string;
  price?: number;
  paid?: boolean;
  status?: string;
  instructions?: string;
  footage_link?: string;
  export_link?: string;
  reference_links?: string;
  created_date?: string;
  completed_date?: string;
};

type ChatActionResult =
  | { ok: true; client?: any; folder?: any; video?: any }
  | { ok: false; error: string };

async function runChatAction(env: Env, action: ChatAction): Promise<ChatActionResult> {
  if (!action.client_name) return { ok: false, error: "No client name given" };

  if (action.type === "create_client") {
    const existing = await findClientByName(env, action.client_name);
    if (existing && existing !== "ambiguous") {
      return { ok: false, error: `A client called "${existing.name}" already exists` };
    }
    const client = await insertClientRow(env, {
      name: action.client_name,
      email: action.email,
      drive_link: action.drive_link,
      billing_type: action.billing_type,
      retainer_amount: action.retainer_amount,
    });
    return { ok: true, client };
  }

  let client = await findClientByName(env, action.client_name);
  if (client === "ambiguous") return { ok: false, error: `Multiple clients match "${action.client_name}" — be more specific` };
  if (!client && action.type === "create_video") {
    client = await insertClientRow(env, { name: action.client_name });
  }
  if (!client) return { ok: false, error: `No client found matching "${action.client_name}"` };

  if (action.type === "update_client") {
    const ex = (await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(client.id).first()) as any;
    const name = action.new_client_name ?? ex.name;
    const email = action.email !== undefined ? action.email : ex.email;
    const drive_link = action.drive_link !== undefined ? action.drive_link : ex.drive_link;
    const notes = action.notes !== undefined ? action.notes : ex.notes;
    const billing_type =
      action.billing_type && VALID_BILLING_TYPES.includes(action.billing_type) ? action.billing_type : ex.billing_type;
    const retainer_amount = action.retainer_amount !== undefined ? action.retainer_amount : ex.retainer_amount;

    await env.DB.prepare(
      `UPDATE clients SET name = ?, email = ?, drive_link = ?, notes = ?, billing_type = ?, retainer_amount = ? WHERE id = ?`
    )
      .bind(name, email, drive_link, notes, billing_type, billing_type === "retainer" ? retainer_amount : null, client.id)
      .run();

    const updated = await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(client.id).first();
    return { ok: true, client: updated };
  }

  if (action.type === "create_folder") {
    if (!action.folder_name) return { ok: false, error: "No folder name given" };
    let parentId: string | null = null;
    if (action.parent_folder_name) {
      const parent = await findFolderByName(env, client.id, action.parent_folder_name);
      if (parent === "ambiguous") return { ok: false, error: `Multiple folders match "${action.parent_folder_name}"` };
      if (!parent) return { ok: false, error: `No folder found matching "${action.parent_folder_name}"` };
      parentId = parent.id;
    }
    const folder = await insertFolderRow(env, client.id, action.folder_name, parentId);
    return { ok: true, folder, client };
  }

  if (action.type === "create_video") {
    if (!action.video_name) return { ok: false, error: "No video name given" };
    let folderId: string | null = null;
    if (action.move_to_folder) {
      const folder = await findFolderByName(env, client.id, action.move_to_folder);
      if (folder === "ambiguous") return { ok: false, error: `Multiple folders match "${action.move_to_folder}"` };
      if (folder) folderId = folder.id;
    }
    const video = await insertVideoRow(env, client.id, {
      name: action.video_name,
      status: action.status,
      folder_id: folderId,
      price: action.price,
      paid: action.paid,
      instructions: action.instructions,
      footage_link: action.footage_link,
      export_link: action.export_link,
      reference_links: action.reference_links,
      created_date: action.created_date,
      completed_date: action.completed_date,
    });
    return { ok: true, video, client };
  }

  if (action.type === "update_video") {
    if (!action.video_name) return { ok: false, error: "No video name given" };
    const match = await findVideoByName(env, client.id, action.video_name);
    if (match === "ambiguous") return { ok: false, error: `Multiple videos match "${action.video_name}"` };
    if (!match) return { ok: false, error: `No video found matching "${action.video_name}" for ${client.name}` };

    const fields: string[] = [];
    const values: unknown[] = [];
    if (action.new_video_name !== undefined) { fields.push("name = ?"); values.push(action.new_video_name); }
    if (action.price !== undefined) { fields.push("price = ?"); values.push(action.price); }
    if (action.paid !== undefined) { fields.push("paid = ?"); values.push(action.paid ? 1 : 0); }
    if (action.status !== undefined && VALID_STATUSES.includes(action.status)) { fields.push("status = ?"); values.push(action.status); }
    if (action.instructions !== undefined) { fields.push("instructions = ?"); values.push(action.instructions); }
    if (action.footage_link !== undefined) { fields.push("footage_link = ?"); values.push(action.footage_link); }
    if (action.export_link !== undefined) { fields.push("export_link = ?"); values.push(action.export_link); }
    if (action.reference_links !== undefined) { fields.push("reference_links = ?"); values.push(action.reference_links); }
    if (action.created_date !== undefined) { fields.push("created_date = ?"); values.push(action.created_date); }

    if (action.move_to_folder !== undefined) {
      if (!action.move_to_folder) {
        fields.push("folder_id = ?");
        values.push(null);
      } else {
        const folder = await findFolderByName(env, client.id, action.move_to_folder);
        if (folder === "ambiguous") return { ok: false, error: `Multiple folders match "${action.move_to_folder}"` };
        if (!folder) return { ok: false, error: `No folder found matching "${action.move_to_folder}"` };
        fields.push("folder_id = ?");
        values.push(folder.id);
      }
    }

    if (action.completed_date !== undefined) {
      fields.push("completed_date = ?");
      values.push(action.completed_date);
    } else if (action.status === "delivered") {
      const ex = (await env.DB.prepare(`SELECT completed_date FROM videos WHERE id = ?`).bind(match.id).first()) as any;
      if (!ex.completed_date) {
        fields.push("completed_date = ?");
        values.push(new Date().toISOString().slice(0, 10));
      }
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(match.id);
      await env.DB.prepare(`UPDATE videos SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    const video = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(match.id).first();
    return { ok: true, video, client };
  }

  return { ok: false, error: "Unknown action type" };
}

async function aiChat(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as any;
  const history = Array.isArray(body.messages) ? body.messages : [];
  if (history.length === 0) return errorResponse("No messages");

  const { results: clientRows } = await env.DB.prepare(
    `SELECT c.name, c.email, c.billing_type, c.retainer_amount,
       COALESCE(SUM(CASE WHEN v.paid = 0 THEN v.price ELSE 0 END), 0) as amount_owed,
       COUNT(v.id) as video_count
     FROM clients c LEFT JOIN videos v ON v.client_id = c.id
     GROUP BY c.id ORDER BY c.name`
  ).all();
  const { results: folderRows } = await env.DB.prepare(
    `SELECT c.name as client_name, f.name as folder_name, f.parent_folder_id
     FROM folders f JOIN clients c ON c.id = f.client_id ORDER BY c.name, f.name`
  ).all();
  const { results: videoRows } = await env.DB.prepare(
    `SELECT c.name as client_name, v.name as video_name, v.status, v.price, v.paid,
       v.created_date, v.completed_date, f.name as folder_name
     FROM videos v JOIN clients c ON c.id = v.client_id
     LEFT JOIN folders f ON f.id = v.folder_id
     ORDER BY c.name, v.created_date DESC`
  ).all();
  const today = new Date().toISOString().slice(0, 10);

  const clientSummary = (clientRows as any[])
    .map(
      (c) =>
        `- ${c.name}${c.email ? ` (${c.email})` : ""}: ${c.video_count} video(s), ` +
        (c.billing_type === "retainer"
          ? `retainer $${c.retainer_amount ?? 0}/mo`
          : `owes $${c.amount_owed} from unpaid work`)
    )
    .join("\n");
  const folderSummary = (folderRows as any[])
    .map((f) => `- ${f.client_name} / folder "${f.folder_name}"`)
    .join("\n");
  const videoSummary = (videoRows as any[])
    .map(
      (v) =>
        `- ${v.client_name} / ${v.folder_name ? `"${v.folder_name}"/` : "(unfiled)/"}"${v.video_name}": ` +
        `status=${v.status}, price=${v.price ?? "unset"}, paid=${v.paid ? "yes" : "no"}, ` +
        `created=${v.created_date}, completed=${v.completed_date ?? "not yet"}`
    )
    .join("\n");

  const systemPrompt =
    "You are the built-in assistant for a freelance video editor's client-management app (a CRM). Clients each have " +
    "a nested folder tree (like Finder) that holds video cards. You can chat, summarize messy client messages into " +
    "clean instructions, answer questions using the data below, and perform actions: create/edit clients, create " +
    "folders, and create/edit videos (including moving a video into a folder). " +
    `Today's date is ${today}.\n\n` +
    "CURRENT CLIENTS:\n" + (clientSummary || "(none yet)") +
    "\n\nCURRENT FOLDERS:\n" + (folderSummary || "(none yet)") +
    "\n\nCURRENT VIDEOS:\n" + (videoSummary || "(none yet)") +
    "\n\nUse this data to answer questions directly (who owes money, a video's status, what's in a folder) without " +
    "needing an action block — you already have it, don't say you can't look it up.\n\n" +
    "YOU CANNOT DELETE ANYTHING. There is no delete action available to you at all — if the user asks you to delete " +
    "or remove a client, folder, or video, tell them you can't do that and they should use the delete button in the " +
    "app themselves. Never claim to have deleted something.\n\n" +
    "CRITICAL RULE: do exactly the one thing the user asked, using only the information they actually gave you. " +
    "Never ask a clarifying question for information the user didn't mention — price, instructions, links, email, " +
    "which folder, etc. are all OPTIONAL and can be added/organized later. Only ask if a TRULY REQUIRED name is " +
    "missing, or an existing client/video/folder reference is genuinely ambiguous. If a client mentioned doesn't " +
    "exist yet, creating a video for them auto-creates the client too — don't ask permission first.\n\n" +
    "After acting, write ONE short natural-language confirmation sentence, then end your reply with a fenced code " +
    "block labeled action containing exactly ONE JSON object. Available action types (omit fields you don't have):\n" +
    '```action\n{"type":"create_client","client_name":"Damien May","email":"...","billing_type":"per_project|retainer","retainer_amount":2000}\n```\n' +
    '```action\n{"type":"update_client","client_name":"Damien May","new_client_name":"...","email":"...","notes":"...","billing_type":"...","retainer_amount":2000}\n```\n' +
    '```action\n{"type":"create_folder","client_name":"Acme Fitness","folder_name":"Reels","parent_folder_name":"..."}\n```\n' +
    '```action\n{"type":"create_video","client_name":"Acme Fitness","video_name":"Q3 Promo","move_to_folder":"Reels","price":500,"paid":false,"status":"in_progress|review|delivered","instructions":"...","footage_link":"...","export_link":"..."}\n```\n' +
    '```action\n{"type":"update_video","client_name":"Acme Fitness","video_name":"Q3 Promo","new_video_name":"...","paid":true,"price":500,"status":"delivered","move_to_folder":"Reels"}\n```\n' +
    "Only include fields the user actually gave you — never guess or invent values. Never emit more than one action " +
    "block per reply — if the user's message asks for multiple separate actions (e.g. 'create a folder and move a " +
    "video into it'), only do the FIRST one, and your confirmation sentence must say only what that one action did " +
    "plus that you'll do the rest once they confirm/ask (never claim to have done something you didn't actually put " +
    "in the action block). If the request is just conversation or answerable from the data above, reply normally " +
    "with no action block.";

  const messages = [{ role: "system", content: systemPrompt }, ...history];

  let result;
  try {
    result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages, max_tokens: 1000 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI request failed";
    return errorResponse(`AI error: ${message}`, 502);
  }

  const raw = result.response ?? "";
  const actionMatch = raw.match(/```action\s*([\s\S]*?)```/);
  const actionBody = actionMatch ? actionMatch[1].trim() : "";
  let reply = actionMatch ? raw.slice(0, actionMatch.index).trim() : raw.trim();
  let actionResult: (ChatActionResult & { error?: string }) | undefined;

  if (actionBody) {
    try {
      const action = JSON.parse(actionBody) as ChatAction;
      if (action && action.type) {
        actionResult = await runChatAction(env, action);
      }
    } catch {
      actionResult = { ok: false, error: "Couldn't understand the action the AI produced — try rephrasing." };
    }
  }

  if (!reply) reply = actionResult?.ok ? "Done." : actionResult?.error || "...";

  return json({ reply, action: actionResult });
}

// ---------- Portal AI chat (scoped to one client, organize-only, never deletes) ----------

type PortalChatAction = {
  type: "create_folder" | "update_folder" | "move_video" | "update_video_status";
  folder_name?: string;
  new_folder_name?: string;
  parent_folder_name?: string;
  video_name?: string;
  status?: string;
};

function isRootSentinel(name?: string): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return n === "" || n === "root" || n === "home";
}

async function runPortalChatAction(
  env: Env,
  clientId: string,
  action: PortalChatAction
): Promise<ChatActionResult> {
  if (action.type === "create_folder") {
    if (!action.folder_name) return { ok: false, error: "No folder name given" };
    let parentId: string | null = null;
    if (action.parent_folder_name && !isRootSentinel(action.parent_folder_name)) {
      const parent = await findFolderByName(env, clientId, action.parent_folder_name);
      if (parent === "ambiguous") return { ok: false, error: `Multiple folders match "${action.parent_folder_name}"` };
      if (!parent) return { ok: false, error: `No folder found matching "${action.parent_folder_name}"` };
      parentId = parent.id;
    }
    const folder = await insertFolderRow(env, clientId, action.folder_name, parentId);
    return { ok: true, folder };
  }

  if (action.type === "update_folder") {
    if (!action.folder_name) return { ok: false, error: "No folder name given" };
    const match = await findFolderByName(env, clientId, action.folder_name);
    if (match === "ambiguous") return { ok: false, error: `Multiple folders match "${action.folder_name}"` };
    if (!match) return { ok: false, error: `No folder found matching "${action.folder_name}"` };

    const existing = (await env.DB.prepare(`SELECT * FROM folders WHERE id = ?`).bind(match.id).first()) as any;
    const name = action.new_folder_name || existing.name;
    let parentId = existing.parent_folder_id;
    if (action.parent_folder_name !== undefined) {
      if (isRootSentinel(action.parent_folder_name)) {
        parentId = null;
      } else {
        const parent = await findFolderByName(env, clientId, action.parent_folder_name);
        if (parent === "ambiguous") return { ok: false, error: `Multiple folders match "${action.parent_folder_name}"` };
        if (!parent) return { ok: false, error: `No folder found matching "${action.parent_folder_name}"` };
        if (parent.id === match.id) return { ok: false, error: "Can't move a folder into itself" };
        parentId = parent.id;
      }
    }
    await env.DB.prepare(`UPDATE folders SET name = ?, parent_folder_id = ? WHERE id = ?`)
      .bind(name.trim(), parentId, match.id)
      .run();
    const folder = await env.DB.prepare(`SELECT * FROM folders WHERE id = ?`).bind(match.id).first();
    return { ok: true, folder };
  }

  if (action.type === "move_video") {
    if (!action.video_name) return { ok: false, error: "No video name given" };
    const match = await findVideoByName(env, clientId, action.video_name);
    if (match === "ambiguous") return { ok: false, error: `Multiple videos match "${action.video_name}"` };
    if (!match) return { ok: false, error: `No video found matching "${action.video_name}"` };

    let folderId: string | null = null;
    if (!isRootSentinel(action.folder_name)) {
      const folder = await findFolderByName(env, clientId, action.folder_name!);
      if (folder === "ambiguous") return { ok: false, error: `Multiple folders match "${action.folder_name}"` };
      if (!folder) return { ok: false, error: `No folder found matching "${action.folder_name}"` };
      folderId = folder.id;
    }
    await env.DB.prepare(`UPDATE videos SET folder_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(folderId, match.id)
      .run();
    const video = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(match.id).first();
    return { ok: true, video };
  }

  if (action.type === "update_video_status") {
    if (!action.video_name) return { ok: false, error: "No video name given" };
    if (!action.status || !VALID_STATUSES.includes(action.status)) return { ok: false, error: "Invalid status" };
    const match = await findVideoByName(env, clientId, action.video_name);
    if (match === "ambiguous") return { ok: false, error: `Multiple videos match "${action.video_name}"` };
    if (!match) return { ok: false, error: `No video found matching "${action.video_name}"` };

    const existing = (await env.DB.prepare(`SELECT completed_date FROM videos WHERE id = ?`).bind(match.id).first()) as any;
    const completedDate =
      action.status === "delivered" && !existing.completed_date
        ? new Date().toISOString().slice(0, 10)
        : existing.completed_date;

    await env.DB.prepare(
      `UPDATE videos SET status = ?, completed_date = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(action.status, completedDate, match.id)
      .run();
    const video = await env.DB.prepare(`SELECT * FROM videos WHERE id = ?`).bind(match.id).first();
    return { ok: true, video };
  }

  return { ok: false, error: "Unknown action type" };
}

async function portalAiChat(request: Request, env: Env, slug: string): Promise<Response> {
  const client = await resolveClientBySlug(env, slug);
  if (!client) return errorResponse("Not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  const history = Array.isArray(body.messages) ? body.messages : [];
  if (history.length === 0) return errorResponse("No messages");

  const { results: folderRows } = await env.DB.prepare(
    `SELECT name, parent_folder_id FROM folders WHERE client_id = ? ORDER BY name`
  )
    .bind(client.id)
    .all();
  const { results: videoRows } = await env.DB.prepare(
    `SELECT v.name, v.status, f.name as folder_name
     FROM videos v LEFT JOIN folders f ON f.id = v.folder_id
     WHERE v.client_id = ? ORDER BY v.created_at DESC`
  )
    .bind(client.id)
    .all();

  const folderSummary = (folderRows as any[]).map((f) => `- "${f.name}"`).join("\n");
  const videoSummary = (videoRows as any[])
    .map((v) => `- ${v.folder_name ? `"${v.folder_name}"/` : "(unfiled)/"}"${v.name}": status=${v.status}`)
    .join("\n");

  const systemPrompt =
    `You are the assistant on ${client.name}'s video hub page — a client-facing portal for a freelance video editor. ` +
    "You are talking directly to the client, not the editor. You can chat, and you can help them organize their own " +
    "folders and videos: create folders, rename or move folders, move a video into a folder, and update a video's " +
    "status (In Progress / Waiting for Review / Posted). " +
    "\n\nYOUR FOLDERS:\n" + (folderSummary || "(none yet)") +
    "\n\nYOUR VIDEOS:\n" + (videoSummary || "(none yet)") +
    "\n\nHARD LIMITS — never violate these: you CANNOT delete anything (no folders, no videos) — tell them to use " +
    "the delete button themselves. You CANNOT rename, edit, or delete a video itself (name, price, instructions, " +
    "links are the editor's to manage) — you can only move it between folders and change its status. You have no " +
    "visibility into pricing, payments, or any other client's data, and cannot create/edit clients. If asked to do " +
    "anything outside organizing folders and moving/status-updating videos, say you can't do that here.\n\n" +
    "CRITICAL RULE: do exactly the one thing asked, using only the info given. Don't ask for optional details. Only " +
    "ask if a required name is missing or a reference is genuinely ambiguous.\n\n" +
    "After acting, write ONE short confirmation sentence, then end with a fenced code block labeled action containing " +
    "ONE JSON object:\n" +
    '```action\n{"type":"create_folder","folder_name":"Reels","parent_folder_name":"..."}\n```\n' +
    '```action\n{"type":"update_folder","folder_name":"Reels","new_folder_name":"...","parent_folder_name":"root|..."}\n```\n' +
    '```action\n{"type":"move_video","video_name":"Q3 Promo","folder_name":"Reels|root"}\n```\n' +
    '```action\n{"type":"update_video_status","video_name":"Q3 Promo","status":"in_progress|review|delivered"}\n```\n' +
    "Use \"root\" for parent_folder_name/folder_name to mean the top level. Never emit more than one action block — " +
    "if asked for multiple separate actions in one message (e.g. 'make a folder and move a video into it'), only do " +
    "the FIRST one and say only what that one action did, plus that you'll do the rest once they ask again (never " +
    "claim to have done something you didn't actually put in the action block). " +
    "If it's just conversation, reply normally with no action block.";

  const messages = [{ role: "system", content: systemPrompt }, ...history];

  let result;
  try {
    result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages, max_tokens: 800 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI request failed";
    return errorResponse(`AI error: ${message}`, 502);
  }

  const raw = result.response ?? "";
  const actionMatch = raw.match(/```action\s*([\s\S]*?)```/);
  const actionBody = actionMatch ? actionMatch[1].trim() : "";
  let reply = actionMatch ? raw.slice(0, actionMatch.index).trim() : raw.trim();
  let actionResult: (ChatActionResult & { error?: string }) | undefined;

  if (actionBody) {
    try {
      const action = JSON.parse(actionBody) as PortalChatAction;
      if (action && action.type) {
        actionResult = await runPortalChatAction(env, client.id, action);
      }
    } catch {
      actionResult = { ok: false, error: "Couldn't understand the action the AI produced — try rephrasing." };
    }
  }

  if (!reply) reply = actionResult?.ok ? "Done." : actionResult?.error || "...";

  return json({ reply, action: actionResult });
}

// ---------- Router ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (path === "/api/login" && method === "POST") {
      return handleLogin(request, env);
    }
    if (path === "/api/logout" && method === "POST") {
      return handleLogout();
    }

    const shareMatch = path.match(/^\/api\/share\/([^/]+)$/);
    if (shareMatch && method === "GET") {
      return getShared(env, shareMatch[1]);
    }

    const portalMatch = path.match(/^\/api\/portal\/([^/]+)$/);
    if (portalMatch && method === "GET") {
      return getClientPortal(env, portalMatch[1]);
    }
    const portalFoldersMatch = path.match(/^\/api\/portal\/([^/]+)\/folders$/);
    if (portalFoldersMatch && method === "POST") {
      return portalCreateFolder(request, env, portalFoldersMatch[1]);
    }
    const portalFolderMatch = path.match(/^\/api\/portal\/([^/]+)\/folders\/([^/]+)$/);
    if (portalFolderMatch && method === "PATCH") {
      return portalUpdateFolder(request, env, portalFolderMatch[1], portalFolderMatch[2]);
    }
    if (portalFolderMatch && method === "DELETE") {
      return portalDeleteFolder(env, portalFolderMatch[1], portalFolderMatch[2]);
    }
    const portalVideoMatch = path.match(/^\/api\/portal\/([^/]+)\/videos\/([^/]+)$/);
    if (portalVideoMatch && method === "PATCH") {
      return portalUpdateVideo(request, env, portalVideoMatch[1], portalVideoMatch[2]);
    }

    const portalAiMatch = path.match(/^\/api\/portal\/([^/]+)\/ai\/chat$/);
    if (portalAiMatch && method === "POST") {
      return portalAiChat(request, env, portalAiMatch[1]);
    }

    if (!(await isAuthed(request, env))) {
      return errorResponse("Unauthorized", 401);
    }

    if (path === "/api/ai/chat" && method === "POST") return aiChat(request, env);

    if (path === "/api/clients" && method === "GET") return listClients(env);
    if (path === "/api/clients" && method === "POST") return createClient(request, env);

    const clientMatch = path.match(/^\/api\/clients\/([^/]+)$/);
    if (clientMatch && method === "GET") return getClient(env, clientMatch[1]);
    if (clientMatch && method === "PATCH") return updateClient(request, env, clientMatch[1]);
    if (clientMatch && method === "DELETE") return deleteClient(env, clientMatch[1]);

    const clientFoldersMatch = path.match(/^\/api\/clients\/([^/]+)\/folders$/);
    if (clientFoldersMatch && method === "GET") return listFolders(env, clientFoldersMatch[1]);
    if (clientFoldersMatch && method === "POST") return createFolder(request, env, clientFoldersMatch[1]);

    const folderMatch = path.match(/^\/api\/folders\/([^/]+)$/);
    if (folderMatch && method === "PATCH") return updateFolder(request, env, folderMatch[1]);
    if (folderMatch && method === "DELETE") return deleteFolder(env, folderMatch[1]);

    const clientVideosMatch = path.match(/^\/api\/clients\/([^/]+)\/videos$/);
    if (clientVideosMatch && method === "GET") return listVideos(env, clientVideosMatch[1]);
    if (clientVideosMatch && method === "POST") return createVideo(request, env, clientVideosMatch[1]);

    const videoMatch = path.match(/^\/api\/videos\/([^/]+)$/);
    if (videoMatch && method === "GET") return getVideo(env, videoMatch[1]);
    if (videoMatch && method === "PATCH") return updateVideo(request, env, videoMatch[1]);
    if (videoMatch && method === "DELETE") return deleteVideo(env, videoMatch[1]);

    return errorResponse("Not found", 404);
  },
};
