import { Env, json, errorResponse, newId } from "../../_shared";

const VALID_BILLING_TYPES = ["per_project", "retainer"];

export const onRequestGet = async ({ env }: { env: Env }) => {
  const { results } = await env.DB.prepare(
    `SELECT c.*, COUNT(p.id) as project_count,
       COALESCE(SUM(CASE WHEN c.billing_type = 'per_project' AND p.paid = 0 THEN p.price ELSE 0 END), 0) as amount_owed
     FROM clients c
     LEFT JOIN projects p ON p.client_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  ).all();
  return json(results);
};

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
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
  await env.DB.prepare(
    `INSERT INTO clients (id, name, email, drive_link, notes, billing_type, retainer_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      name.trim(),
      email || null,
      drive_link || null,
      notes || null,
      billingType,
      billingType === "retainer" ? retainer_amount ?? null : null
    )
    .run();

  const client = await env.DB.prepare(`SELECT * FROM clients WHERE id = ?`).bind(id).first();
  return json(client, 201);
};
