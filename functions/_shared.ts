export interface Env {
  DB: D1Database;
  ADMIN_PASSPHRASE: string;
  AUTH_SECRET: string;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newId(): string {
  return crypto.randomUUID();
}

export function newSlug(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export const AUTH_COOKIE = "crm_auth";
