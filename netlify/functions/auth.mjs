import { randomBytes, timingSafeEqual } from "node:crypto";
import { AuthError, ConfigurationError, settings, seal, unseal, cookie, readCookie, response, checkOrigin, requireUser, discord, permissions } from "../../src/server/auth.mjs";

export const config = {
  path: ["/api/auth/discord", "/api/auth/callback", "/api/auth/session", "/api/auth/logout"],
};

function redirect(location, cookies = []) {
  const result = response(null, 303, { Location: location });
  cookies.forEach(value => result.headers.append("Set-Cookie", value));
  return result;
}

function landing(locale) { return locale === "en" ? "/en" : "/uk"; }

function destination(locale, returnTo) {
  return /^\/(uk|en)\/(report|admin)\/?$/.test(returnTo ?? "") ? returnTo : landing(locale);
}

async function callback(req, url, cfg) {
  const state = unseal(readCookie(req, "oauth", cfg), "oauth", cfg);
  const clearState = cookie("oauth", "", 0, cfg);
  const fail = (code) => redirect(`${destination(state?.locale, state?.returnTo)}?auth_error=${code}`, [clearState]);
  const received = Buffer.from(url.searchParams.get("state") ?? "");
  const expected = Buffer.from(state?.nonce ?? "");
  if (!state || received.length !== expected.length || !timingSafeEqual(received, expected)) return fail("invalid_state");
  const issuer = url.searchParams.get("iss");
  if (issuer && issuer !== "https://discord.com") return fail("invalid_state");
  if (url.searchParams.has("error")) return fail("cancelled");
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return fail("failed");
  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "authorization_code",
        code, redirect_uri: cfg.redirectUri,
      }),
    });
    if (!tokenResponse.ok) return fail("failed");
    const token = await tokenResponse.json();
    const lifetime = Math.min(3600, Math.floor(Number(token.expires_in)) - 60);
    if (!Number.isFinite(lifetime) || lifetime <= 0 || typeof token.access_token !== "string") return fail("failed");
    const user = await discord("/users/@me", token.access_token);
    if (!/^\d{17,20}$/.test(user?.id ?? "") || typeof user.username !== "string") return fail("failed");
    const session = seal({
      user: { id: user.id, name: (user.global_name || user.username).slice(0, 100) },
      accessToken: token.access_token, exp: Date.now() + lifetime * 1000,
    }, "session", cfg);
    if (session.length > 3800) return fail("failed");
    return redirect(destination(state.locale, state.returnTo), [clearState, cookie("session", session, lifetime, cfg)]);
  } catch { return fail("failed"); }
}

export default async function handler(req) {
  let cfg;
  try {
    cfg = settings();
    const url = new URL(req.url);
    // Keep login and callback on the configured origin, including deploy previews.
    if (url.origin !== cfg.origin) return response({ error: "wrong_origin" }, 400);
    const path = url.pathname;
    const allowed = path === "/api/auth/logout" ? "POST" : "GET";
    if (req.method !== allowed) return response({ error: "method_not_allowed" }, 405, { Allow: allowed });
    if (path === "/api/auth/discord") {
      const locale = url.searchParams.get("locale") === "en" ? "en" : "uk";
      const nonce = randomBytes(32).toString("base64url");
      const returnTo = destination(locale, url.searchParams.get("returnTo"));
      const state = seal({ nonce, locale, returnTo, exp: Date.now() + 600_000 }, "oauth", cfg);
      const target = new URL("https://discord.com/oauth2/authorize");
      target.search = new URLSearchParams({
        client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code",
        scope: "identify guilds guilds.members.read", state: nonce,
      }).toString();
      return redirect(target.toString(), [cookie("oauth", state, 600, cfg)]);
    }
    if (path === "/api/auth/callback") return await callback(req, url, cfg);
    if (path === "/api/auth/session") {
      const session = requireUser(req, cfg);
      return response({ user: session.user, ...await permissions(session, cfg) });
    }
    if (path === "/api/auth/logout") {
      checkOrigin(req, cfg);
      // Local logout removes the browser session. No Discord account action is taken.
      const result = response({ ok: true });
      result.headers.append("Set-Cookie", cookie("session", "", 0, cfg));
      result.headers.append("Set-Cookie", cookie("oauth", "", 0, cfg));
      return result;
    }
    return response({ error: "not_found" }, 404);
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    const result = response({
      error: error instanceof AuthError ? error.message : "discord_unavailable",
      ...(error instanceof ConfigurationError ? { issues: error.issues } : {}),
    }, status);
    if (cfg && status === 401) result.headers.set("Set-Cookie", cookie("session", "", 0, cfg));
    return result;
  }
}
