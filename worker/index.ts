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
const VALID_PROJECT_TYPES = ["project", "reel"];

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

type ProjectInput = {
  name: string;
  status?: string;
  type?: string;
  footage_link?: string | null;
  reference_links?: string | null;
  instructions?: string | null;
  export_link?: string | null;
  price?: number | null;
  paid?: boolean | 0 | 1;
  created_date?: string | null;
  completed_date?: string | null;
};

async function insertProjectRow(env: Env, clientId: string, input: ProjectInput) {
  const id = newId();
  const slug = newSlug();
  const today = new Date().toISOString().slice(0, 10);
  const status = input.status && VALID_STATUSES.includes(input.status) ? input.status : "in_progress";
  const type = input.type && VALID_PROJECT_TYPES.includes(input.type) ? input.type : "project";
  const completedDate = input.completed_date || (status === "delivered" ? today : null);

  await env.DB.prepare(
    `INSERT INTO projects
       (id, client_id, name, status, type, footage_link, reference_links, instructions, export_link, price, paid,
        created_date, completed_date, share_slug)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      clientId,
      input.name.trim(),
      status,
      type,
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

  return env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
}

async function createProject(request: Request, env: Env, clientId: string): Promise<Response> {
  const client = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(clientId).first();
  if (!client) return errorResponse("Client not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  if (!body.name || !String(body.name).trim()) return errorResponse("Project name is required");

  const project = await insertProjectRow(env, clientId, body);
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
  const type = body.type && VALID_PROJECT_TYPES.includes(body.type) ? body.type : ex.type;
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
     SET name = ?, status = ?, type = ?, footage_link = ?, reference_links = ?, instructions = ?, export_link = ?,
         price = ?, paid = ?, created_date = ?, completed_date = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      name,
      status,
      type,
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

async function findProjectByName(
  env: Env,
  clientId: string,
  name: string
): Promise<{ id: string } | null | "ambiguous"> {
  const exact = await env.DB.prepare(`SELECT id FROM projects WHERE client_id = ? AND lower(name) = lower(?)`)
    .bind(clientId, name)
    .first();
  if (exact) return exact as any;

  const { results } = await env.DB.prepare(
    `SELECT id FROM projects WHERE client_id = ? AND lower(name) LIKE '%' || lower(?) || '%'`
  )
    .bind(clientId, name)
    .all();
  if (results.length === 1) return results[0] as any;
  if (results.length > 1) return "ambiguous";
  return null;
}

type ChatAction = {
  type:
    | "create_client"
    | "update_client"
    | "delete_client"
    | "create_project"
    | "update_project"
    | "delete_project";
  client_name?: string;
  new_client_name?: string;
  email?: string;
  drive_link?: string;
  notes?: string;
  billing_type?: string;
  retainer_amount?: number;
  project_name?: string;
  new_project_name?: string;
  project_type?: string;
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
  | { ok: true; client?: any; project?: any; deleted?: string }
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
  if (!client && action.type === "create_project") {
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

  if (action.type === "delete_client") {
    await env.DB.prepare(`DELETE FROM clients WHERE id = ?`).bind(client.id).run();
    return { ok: true, deleted: client.name };
  }

  if (action.type === "create_project") {
    if (!action.project_name) return { ok: false, error: "No project name given" };
    const project = await insertProjectRow(env, client.id, {
      name: action.project_name,
      status: action.status,
      type: action.project_type,
      price: action.price,
      paid: action.paid,
      instructions: action.instructions,
      footage_link: action.footage_link,
      export_link: action.export_link,
      reference_links: action.reference_links,
      created_date: action.created_date,
      completed_date: action.completed_date,
    });
    return { ok: true, project, client };
  }

  if (action.type === "update_project" || action.type === "delete_project") {
    if (!action.project_name) return { ok: false, error: "No project name given" };
    const match = await findProjectByName(env, client.id, action.project_name);
    if (match === "ambiguous") return { ok: false, error: `Multiple projects match "${action.project_name}"` };
    if (!match) return { ok: false, error: `No project found matching "${action.project_name}" for ${client.name}` };

    if (action.type === "delete_project") {
      await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(match.id).run();
      return { ok: true, deleted: action.project_name };
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (action.new_project_name !== undefined) { fields.push("name = ?"); values.push(action.new_project_name); }
    if (action.price !== undefined) { fields.push("price = ?"); values.push(action.price); }
    if (action.paid !== undefined) { fields.push("paid = ?"); values.push(action.paid ? 1 : 0); }
    if (action.status !== undefined && VALID_STATUSES.includes(action.status)) { fields.push("status = ?"); values.push(action.status); }
    if (action.project_type !== undefined && VALID_PROJECT_TYPES.includes(action.project_type)) { fields.push("type = ?"); values.push(action.project_type); }
    if (action.instructions !== undefined) { fields.push("instructions = ?"); values.push(action.instructions); }
    if (action.footage_link !== undefined) { fields.push("footage_link = ?"); values.push(action.footage_link); }
    if (action.export_link !== undefined) { fields.push("export_link = ?"); values.push(action.export_link); }
    if (action.reference_links !== undefined) { fields.push("reference_links = ?"); values.push(action.reference_links); }
    if (action.created_date !== undefined) { fields.push("created_date = ?"); values.push(action.created_date); }
    if (action.completed_date !== undefined) {
      fields.push("completed_date = ?");
      values.push(action.completed_date);
    } else if (action.status === "delivered") {
      const ex = (await env.DB.prepare(`SELECT completed_date FROM projects WHERE id = ?`).bind(match.id).first()) as any;
      if (!ex.completed_date) {
        fields.push("completed_date = ?");
        values.push(new Date().toISOString().slice(0, 10));
      }
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(match.id);
      await env.DB.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(match.id).first();
    return { ok: true, project, client };
  }

  return { ok: false, error: "Unknown action type" };
}

async function aiChat(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as any;
  const history = Array.isArray(body.messages) ? body.messages : [];
  if (history.length === 0) return errorResponse("No messages");

  const { results: clientRows } = await env.DB.prepare(
    `SELECT c.name, c.email, c.billing_type, c.retainer_amount,
       COALESCE(SUM(CASE WHEN p.paid = 0 THEN p.price ELSE 0 END), 0) as amount_owed,
       COUNT(p.id) as project_count
     FROM clients c LEFT JOIN projects p ON p.client_id = c.id
     GROUP BY c.id ORDER BY c.name`
  ).all();
  const { results: projectRows } = await env.DB.prepare(
    `SELECT c.name as client_name, p.name as project_name, p.type, p.status, p.price, p.paid,
       p.created_date, p.completed_date
     FROM projects p JOIN clients c ON c.id = p.client_id
     ORDER BY c.name, p.created_date DESC`
  ).all();
  const today = new Date().toISOString().slice(0, 10);

  const clientSummary = (clientRows as any[])
    .map(
      (c) =>
        `- ${c.name}${c.email ? ` (${c.email})` : ""}: ${c.project_count} project(s), ` +
        (c.billing_type === "retainer"
          ? `retainer $${c.retainer_amount ?? 0}/mo`
          : `owes $${c.amount_owed} from unpaid per-video work`)
    )
    .join("\n");
  const projectSummary = (projectRows as any[])
    .map(
      (p) =>
        `- ${p.client_name} / "${p.project_name}" (${p.type}): status=${p.status}, price=${p.price ?? "unset"}, ` +
        `paid=${p.paid ? "yes" : "no"}, created=${p.created_date}, completed=${p.completed_date ?? "not yet"}`
    )
    .join("\n");

  const systemPrompt =
    "You are the built-in assistant for a freelance video editor's client-management app (a CRM). You can chat, " +
    "summarize messy client messages into clean editing briefs, answer questions about the data below, and — most " +
    "importantly — directly perform ANY action the app itself supports: creating, editing, or deleting clients and " +
    `project/reel cards. Today's date is ${today}.\n\n` +
    "CURRENT CLIENTS:\n" +
    (clientSummary || "(none yet)") +
    "\n\nCURRENT PROJECTS:\n" +
    (projectSummary || "(none yet)") +
    "\n\nUse the data above to answer questions directly (e.g. who owes money, a client's status, how many projects " +
    "someone has) without needing an action block — you already have everything shown above, don't say you can't " +
    "look it up.\n\n" +
    "CRITICAL RULE: do exactly the one thing the user asked, using only the information they actually gave you. " +
    "Never ask a clarifying question for information the user didn't mention and didn't imply is coming — price, " +
    "instructions, footage links, email, etc. are all OPTIONAL and can be added later. Only ask a question if a " +
    "TRULY REQUIRED field is missing: a name for the client/project being created, or which existing client/project " +
    "an update applies to when it's genuinely ambiguous. If the user just says 'add a new client named X', immediately " +
    "emit the action to create it. If they mention a project for a client that doesn't exist yet, just create the " +
    "client too as part of create_project — don't stall to ask permission.\n\n" +
    "EXCEPTION — deletions are the one case where you should pause: before emitting delete_client or delete_project, " +
    "confirm in plain text once ('Delete Q3 Promo for Acme Fitness — you sure? This can't be undone.') and wait for " +
    "the user to say yes/confirm/do it in their next message before actually emitting the action. Don't ask twice.\n\n" +
    "After acting, write ONE short natural-language confirmation sentence, then end your reply with a fenced code " +
    "block labeled action containing exactly ONE JSON object. Available action types and their fields (omit any " +
    "field you don't have a value for):\n" +
    '```action\n{"type":"create_client","client_name":"Damien May","email":"...","drive_link":"...","billing_type":"per_project|retainer","retainer_amount":2000}\n```\n' +
    '```action\n{"type":"update_client","client_name":"Damien May","new_client_name":"...","email":"...","drive_link":"...","notes":"...","billing_type":"...","retainer_amount":2000}\n```\n' +
    '```action\n{"type":"delete_client","client_name":"Damien May"}\n```\n' +
    '```action\n{"type":"create_project","client_name":"Acme Fitness","project_name":"Q3 Promo","project_type":"project|reel","price":500,"paid":false,"status":"in_progress|review|delivered","instructions":"...","footage_link":"...","export_link":"...","reference_links":"...","created_date":"YYYY-MM-DD","completed_date":"YYYY-MM-DD"}\n```\n' +
    '```action\n{"type":"update_project","client_name":"Acme Fitness","project_name":"Q3 Promo","new_project_name":"...","paid":true,"price":500,"status":"delivered", "...(any create_project field)"}\n```\n' +
    '```action\n{"type":"delete_project","client_name":"Acme Fitness","project_name":"Q3 Promo"}\n```\n' +
    "Only include fields the user actually gave you — never guess or invent values. Never emit more than one action " +
    "block per reply. If the request is just conversation or a question you can answer from the data above, reply " +
    "normally with no action block.";

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

    if (path === "/api/ai/chat" && method === "POST") return aiChat(request, env);

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
