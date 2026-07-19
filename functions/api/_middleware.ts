import { Env, errorResponse, sha256Hex, AUTH_COOKIE } from "../_shared";

export const onRequest = async (context: {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const isPublic = url.pathname === "/api/login" || url.pathname.startsWith("/api/share/");
  if (isPublic) {
    return next();
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
  const token = match?.[1];
  const expected = await sha256Hex(env.AUTH_SECRET);

  if (!token || token !== expected) {
    return errorResponse("Unauthorized", 401);
  }

  return next();
};
