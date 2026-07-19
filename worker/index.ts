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

async function listClients(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT c.*, COUNT(p.id) as project_count,
       COALESCE(SUM(CASE WHEN p.paid = 0 THEN p.price ELSE 0 END), 0) as amount_owed
     FROM clients c
     LEFT JOIN projects p ON p.client_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  ).all();
  return json(results);
}

async function createClient(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const { name, email, drive_link, notes, billing_type, retainer_amount } = body as any;

  if (!name || typeof name !== "string" || !name.trim()) {
    return errorResponse("Client name is required");
  }
  const billingType = billing_type || "per_project";
  if (!VALID_BILLING_TYPES.includes(billingType)) {
    return errorResponse("Invalid billing type");
  }

  const id = newId();
  const slug = newSlug();
  await env.DB.prepare(
    `INSERT INTO clients (id, name, email, drive_link, notes, billing_type, retainer_amount, share_slug)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      name.trim(),
      email || null,
      drive_link || null,
      notes || null,
      billingType,
      billingType === "retainer" ? retainer_amount ?? null : null,
      slug
    )
    .run();

  const client = await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
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

async function listProjects(env: Env, clientId: string): Promise<Response> {
  const client = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse("Client not found", 404);

  const { results } = await env.DB.prepare(
    `SELECT * FROM projects WHERE client_id = ? ORDER BY created_at DESC`
  )
    .bind(clientId)
    .all();
  return json(results);
}

async function createProject(request: Request, env: Env, clientId: string): Promise<Response> {
  const client = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse("Client not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  const { name, status, footage_link, reference_links, instructions, export_link, price, paid, created_date } =
    body;

  if (!name || !String(name).trim()) return errorResponse("Project name is required");

  const id = newId();
  const slug = newSlug();
  const today = new Date().toISOString().slice(0, 10);
  const completedDate = status === "delivered" ? today : null;

  await env.DB.prepare(
    `INSERT INTO projects
       (id, client_id, name, status, footage_link, reference_links, instructions, export_link, price, paid,
        created_date, completed_date, share_slug)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      clientId,
      name.trim(),
      status || "in_progress",
      footage_link || null,
      reference_links || null,
      instructions || null,
      export_link || null,
      price ?? null,
      paid ? 1 : 0,
      created_date || today,
      completedDate,
      slug
    )
    .run();

  const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  return json(project, 201);
}

async function getProject(env: Env, id: string): Promise<Response> {
  const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  if (!project) return errorResponse("Project not found", 404);
  return json(project);
}

async function updateProject(request: Request, env: Env, id: string): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse("Project not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  const ex = existing as any;
  const name = body.name ?? ex.name;
  const status = body.status ?? ex.status;
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

  if (!name || !String(name).trim()) return errorResponse("Project name is required");
  if (!VALID_STATUSES.includes(status)) return errorResponse("Invalid status");

  await env.DB.prepare(
    `UPDATE projects
     SET name = ?, status = ?, footage_link = ?, reference_links = ?, instructions = ?, export_link = ?,
         price = ?, paid = ?, created_date = ?, completed_date = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      name,
      status,
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

  const updated = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  return json(updated);
}

async function deleteProject(env: Env, id: string): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT id FROM projects WHERE id = ?`).bind(id).first();
  if (!existing) return errorResponse("Project not found", 404);

  await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
  return new Response(null, { status: 204 });
}

async function getCalendar(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.status, p.created_date, p.completed_date, p.client_id, c.name as client_name
     FROM projects p
     JOIN clients c ON c.id = p.client_id`
  ).all();
  return json(results);
}

async function summarizeInstructions(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as any;
  const text = body.text;
  if (!text || typeof text !== "string" || !text.trim()) {
    return errorResponse("Paste the client's message first");
  }
  if (text.length > 20000) {
    return errorResponse("Message is too long (20k character max)");
  }

  let result;
  try {
    result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
      {
        role: "system",
        content:
          "You are an assistant for a freelance video editor. The user will paste a raw message from a client " +
          "describing what they want for a video edit. Summarize it into a clean, actionable brief the editor can " +
          "work from. Use short bullet points grouped under these headings when relevant: Deliverable (format, " +
          "length, aspect ratio, platform), Style & Tone, Music/Audio, Specific Edit Notes, Deadline, Open Questions " +
          "(anything unclear or missing the editor should ask the client about). Keep only information actually in " +
          "the message — never invent details. Be concise.",
      },
      { role: "user", content: text },
      ],
      max_tokens: 800,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI request failed";
    return errorResponse(`AI error: ${message}`, 502);
  }

  return json({ summary: result.response ?? "" });
}

async function getShared(env: Env, slug: string): Promise<Response> {
  const project = await env.DB.prepare(`SELECT * FROM projects WHERE share_slug = ?`).bind(slug).first();
  if (!project) return errorResponse("Not found", 404);

  const client = await env.DB.prepare(`SELECT name FROM clients WHERE id = ?`)
    .bind((project as any).client_id)
    .first();

  return json({ project, client });
}

async function getClientPortal(env: Env, slug: string): Promise<Response> {
  const client = await env.DB.prepare(`SELECT id, name FROM clients WHERE share_slug = ?`)
    .bind(slug)
    .first();
  if (!client) return errorResponse("Not found", 404);

  const { results } = await env.DB.prepare(
    `SELECT id, name, status, footage_link, instructions, export_link, share_slug, created_date, completed_date
     FROM projects WHERE client_id = ? ORDER BY created_at DESC`
  )
    .bind((client as any).id)
    .all();

  return json({ client, projects: results });
}

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

    if (!(await isAuthed(request, env))) {
      return errorResponse("Unauthorized", 401);
    }

    if (path === "/api/ai/summarize" && method === "POST") return summarizeInstructions(request, env);
    if (path === "/api/calendar" && method === "GET") return getCalendar(env);

    if (path === "/api/clients" && method === "GET") return listClients(env);
    if (path === "/api/clients" && method === "POST") return createClient(request, env);

    const clientMatch = path.match(/^\/api\/clients\/([^/]+)$/);
    if (clientMatch && method === "GET") return getClient(env, clientMatch[1]);
    if (clientMatch && method === "PATCH") return updateClient(request, env, clientMatch[1]);
    if (clientMatch && method === "DELETE") return deleteClient(env, clientMatch[1]);

    const clientProjectsMatch = path.match(/^\/api\/clients\/([^/]+)\/projects$/);
    if (clientProjectsMatch && method === "GET") return listProjects(env, clientProjectsMatch[1]);
    if (clientProjectsMatch && method === "POST")
      return createProject(request, env, clientProjectsMatch[1]);

    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && method === "GET") return getProject(env, projectMatch[1]);
    if (projectMatch && method === "PATCH") return updateProject(request, env, projectMatch[1]);
    if (projectMatch && method === "DELETE") return deleteProject(env, projectMatch[1]);

    return errorResponse("Not found", 404);
  },
};
