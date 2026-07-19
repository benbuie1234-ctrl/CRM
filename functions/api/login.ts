import { Env, json, errorResponse, sha256Hex, AUTH_COOKIE } from "../_shared";

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
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
};

export const onRequestOptions = () => json({ ok: true });
