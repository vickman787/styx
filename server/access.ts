import type { RequestHandler, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  AccessService,
  AccessError,
  type AuthMode,
} from "../lib/auth/service.ts";
export function accessConfig(
  env: NodeJS.ProcessEnv = process.env,
  port = 4173,
) {
  const mode = z
    .enum(["local", "password"])
    .default("local")
    .parse(env.STYX_AUTH_MODE) as AuthMode;
  const origin = new URL(env.STYX_APP_ORIGIN || `http://127.0.0.1:${port}`);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw Error(
      "STYX_APP_ORIGIN must be an HTTP(S) origin without a path or credentials.",
    );
  const loopback = ["127.0.0.1", "localhost"].includes(origin.hostname);
  if (mode === "local" && !loopback)
    throw Error(
      "Local owner mode is restricted to loopback origins. Enable password mode before configuring public access.",
    );
  if (!loopback && origin.protocol !== "https:")
    throw Error("Public password mode requires an HTTPS application origin.");
  return {
    mode,
    origin: origin.origin,
    host: origin.host,
    secure: origin.protocol === "https:",
    cookie:
      origin.protocol === "https:" ? "__Host-styx_session" : "styx_session",
  };
}
export function accessMiddleware(
  auth: AccessService,
  config: ReturnType<typeof accessConfig>,
): RequestHandler {
  const cookie = (req: any) =>
    req.headers.cookie
      ?.split(";")
      .map((part: string) => part.trim())
      .find((part: string) => part.startsWith(config.cookie + "="))
      ?.slice(config.cookie.length + 1);
  const setCookie = (res: Response, token: string) =>
    res.cookie(config.cookie, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: config.secure,
      path: "/",
      maxAge: 12 * 3600000,
    });
  const respond = (res: Response, token: string) =>
    res.json({
      ...auth.session(token),
      identity: auth.session(token)?.username,
      workspace: auth.session(token)?.workspaceId,
    });
  return async (req, res, next) => {
    try {
      const allowedHosts = [
        config.host,
        ...(config.mode === "local"
          ? [config.host.replace("127.0.0.1", "localhost")]
          : []),
      ];
      if (!allowedHosts.includes(req.headers.host || ""))
        throw new AccessError("Untrusted host.", 403);
      if (config.secure)
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
      let token = cookie(req),
        access = auth.session(token);
      if (req.path === "/session" && req.method === "GET") {
        if (!access) {
          if (config.mode === "password")
            auth.checkSessionIssue(req.socket.remoteAddress || "unknown");
          token = auth.issue();
          setCookie(res, token);
        }
        respond(res, token!);
        return;
      }
      if (!access)
        throw new AccessError(
          "Session expired or missing. Reload and sign in again.",
        );
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.origin;
        const allowedOrigins = [
          config.origin,
          ...(config.mode === "local"
            ? [config.origin.replace("127.0.0.1", "localhost")]
            : []),
        ];
        if (
          (config.mode === "password" && !origin) ||
          (origin && !allowedOrigins.includes(origin))
        )
          throw new AccessError("Cross-origin mutation rejected.", 403);
        const csrf = req.headers["x-styx-csrf"];
        // This authenticated, same-origin JSON-RPC route accepts only validated
        // account/key/block reads; the wallet SDK cannot attach our CSRF header.
        const walletRead =
          req.path === "/near/wallet-rpc" && req.method === "POST";
        if (
          !walletRead &&
          (typeof csrf !== "string" ||
            !/^[a-f0-9]{64}$/.test(csrf) ||
            !timingSafeEqual(Buffer.from(csrf), Buffer.from(access.csrf)))
        )
          throw new AccessError("CSRF validation failed.", 403);
      }
      const ip = req.socket.remoteAddress || "unknown";
      if (req.path === "/auth/login" && req.method === "POST") {
        const data = z
          .object({
            username: z.string().min(1).max(80),
            password: z.string().min(1).max(128),
          })
          .strict()
          .parse(req.body);
        const signed = await auth.login(
          data.username,
          data.password,
          ip,
          token!,
        );
        setCookie(res, signed);
        respond(res, signed);
        return;
      }
      if (!access.authenticated)
        throw new AccessError("Sign in to open this workspace.");
      if (req.path === "/auth/logout" && req.method === "POST") {
        auth.revoke(token!);
        res.clearCookie(config.cookie, {
          httpOnly: true,
          sameSite: "strict",
          secure: config.secure,
          path: "/",
        });
        res.json({ ok: true });
        return;
      }
      if (req.path === "/auth/workspace" && req.method === "POST") {
        const { workspaceId } = z
          .object({ workspaceId: z.string().max(64) })
          .strict()
          .parse(req.body);
        const signed = auth.switchWorkspace(token!, workspaceId);
        setCookie(res, signed);
        respond(res, signed);
        return;
      }
      if (req.path === "/auth/password" && req.method === "POST") {
        const { currentPassword, newPassword } = z
          .object({
            currentPassword: z.string().max(128),
            newPassword: z.string().max(128),
          })
          .strict()
          .parse(req.body);
        const signed = await auth.changePassword(
          token!,
          currentPassword,
          newPassword,
          ip,
        );
        setCookie(res, signed);
        respond(res, signed);
        return;
      }
      // Permissions come from the database on every request, never browser claims.
      access = auth.session(token);
      if (!access?.authenticated)
        throw new AccessError("Workspace access was revoked.");
      if (!["GET", "HEAD"].includes(req.method) && access.role !== "owner")
        throw new AccessError(
          "Viewer access is read-only. An owner must perform this action.",
          403,
        );
      res.locals.access = access;
      next();
    } catch (error) {
      next(error);
    }
  };
}
