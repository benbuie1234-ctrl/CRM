import { Env, json, errorResponse, newId, newSlug } from "../../../_shared";

export const onRequestGet = async ({ env, params }: { env: Env; params: { id: string } }) => {
  const client = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(params.id).first();
  if (!client) return errorResponse("Client not found", 404);

  const { results } = await env.DB.prepare(
    `SELECT * FROM projects WHERE client_id = ? ORDER BY created_at DESC`
  )
    .bind(params.id)
    .all();
  return json(results);
};

export const onRequestPost = async ({
  request,
  env,
  params,
}: {
  request: Request;
  env: Env;
  params: { id: string };
}) => {
  const client = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(params.id).first();
  if (!client) return errorResponse("Client not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  const { name, status, footage_link, reference_links, instructions, export_link, price, paid } = body;

  if (!name || !String(name).trim()) return errorResponse("Project name is required");

  const id = newId();
  const slug = newSlug();

  await env.DB.prepare(
    `INSERT INTO projects
       (id, client_id, name, status, footage_link, reference_links, instructions, export_link, price, paid, share_slug)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      params.id,
      name.trim(),
      status || "in_progress",
      footage_link || null,
      reference_links || null,
      instructions || null,
      export_link || null,
      price ?? null,
      paid ? 1 : 0,
      slug
    )
    .run();

  const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();
  return json(project, 201);
};
