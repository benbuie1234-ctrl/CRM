import { Env, json, errorResponse } from "../../_shared";

const VALID_STATUSES = ["in_progress", "review", "delivered"];

export const onRequestGet = async ({ env, params }: { env: Env; params: { id: string } }) => {
  const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(params.id).first();
  if (!project) return errorResponse("Project not found", 404);
  return json(project);
};

export const onRequestPatch = async ({
  request,
  env,
  params,
}: {
  request: Request;
  env: Env;
  params: { id: string };
}) => {
  const existing = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(params.id).first();
  if (!existing) return errorResponse("Project not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  const name = body.name ?? existing.name;
  const status = body.status ?? existing.status;
  const footage_link = body.footage_link !== undefined ? body.footage_link : existing.footage_link;
  const reference_links =
    body.reference_links !== undefined ? body.reference_links : existing.reference_links;
  const instructions = body.instructions !== undefined ? body.instructions : existing.instructions;
  const export_link = body.export_link !== undefined ? body.export_link : existing.export_link;
  const price = body.price !== undefined ? body.price : existing.price;
  const paid = body.paid !== undefined ? (body.paid ? 1 : 0) : existing.paid;

  if (!name || !String(name).trim()) return errorResponse("Project name is required");
  if (!VALID_STATUSES.includes(status)) return errorResponse("Invalid status");

  await env.DB.prepare(
    `UPDATE projects
     SET name = ?, status = ?, footage_link = ?, reference_links = ?, instructions = ?, export_link = ?,
         price = ?, paid = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(name, status, footage_link, reference_links, instructions, export_link, price, paid, params.id)
    .run();

  const updated = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(params.id).first();
  return json(updated);
};

export const onRequestDelete = async ({ env, params }: { env: Env; params: { id: string } }) => {
  const existing = await env.DB.prepare(`SELECT id FROM projects WHERE id = ?`).bind(params.id).first();
  if (!existing) return errorResponse("Project not found", 404);

  await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(params.id).run();
  return new Response(null, { status: 204 });
};
