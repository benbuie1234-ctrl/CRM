import { AUTH_COOKIE } from "../_shared";

export const onRequestPost = async () => {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", `${AUTH_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
