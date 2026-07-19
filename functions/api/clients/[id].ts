import { Env, json, errorResponse } from "../../_shared";

const VALID_BILLING_TYPES = ["per_project", "retainer"];

export const onRequestGet = async ({ env, params }: { env: Env; params: { id: string } }) => {
  const client = await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(params.id).first();
  if (!client) return errorResponse("Client not found", 404);
  return json(client);
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
  const existing = await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(params.id).first();
  if (!existing) return errorResponse("Client not found", 404);

  const body = (await request.json().catch(() => ({}))) as any;
  const name = body.name ?? existing.name;
  const email = body.email !== undefined ? body.email : existing.email;
  const drive_link = body.drive_link !== undefined ? body.drive_link : existing.drive_link;
  const notes = body.notes !== undefined ? body.notes : existing.notes;
  const billing_type = body.billing_type ?? existing.billing_type;
  const retainer_amount =
    body.retainer_amount !== undefined ? body.retainer_amount : existing.retainer_amount;

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
      params.id
    )
    .run();

  const updated = await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(params.id).first();
  return json(updated);
};

export const onRequestDelete = async ({ env, params }: { env: Env; params: { id: string } }) => {
  const existing = await env.DB.prepare(`SELECT id FROM clients WHERE id = ?`).bind(params.id).first();
  if (!existing) return errorResponse("Client not found", 404);

  await env.DB.prepare(`DELETE FROM clients WHERE id = ?`).bind(params.id).run();
  return new Response(null, { status: 204 });
};
