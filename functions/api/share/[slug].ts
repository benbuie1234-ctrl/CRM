import { Env, json, errorResponse } from "../../_shared";

export const onRequestGet = async ({ env, params }: { env: Env; params: { slug: string } }) => {
  const project = await env.DB.prepare(`SELECT * FROM projects WHERE share_slug = ?`)
    .bind(params.slug)
    .first();
  if (!project) return errorResponse("Not found", 404);

  const client = await env.DB.prepare(`SELECT name FROM clients WHERE id = ?`)
    .bind((project as any).client_id)
    .first();

  return json({ project, client });
};
