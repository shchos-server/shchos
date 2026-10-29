import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class AuthError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}

export function settings() {
  const { SITE_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID, SESSION_SECRET } = process.env;
  if (!SITE_URL || !/^\d{17,20}$/.test(DISCORD_CLIENT_ID ?? "") || !DISCORD_CLIENT_SECRET ||
      !/^\d{17,20}$/.test(DISCORD_GUILD_ID ?? "") || !/^[a-f\d]{64}$/i.test(SESSION_SECRET ?? "")) {
    throw new AuthError(503, "not_configured");
  }
  let site;
  try { site = new URL(SITE_URL); } catch { throw new AuthError(503, "not_configured"); }
  const local = site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname);
  if ((!local && site.protocol !== "https:") || site.username || site.password ||
      site.pathname !== "/" || site.search || site.hash) throw new AuthError(503, "not_configured");
  const roles = (process.env.DISCORD_ADMIN_ROLE_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean);
  if (roles.some(id => !/^\d{17,20}$/.test(id))) throw new AuthError(503, "not_configured");
  return {
    origin: site.origin, secure: !local, clientId: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET, guildId: DISCORD_GUILD_ID, roles,
    key: Buffer.from(SESSION_SECRET, "hex"),
    redirectUri: `${site.origin}/api/auth/callback`,
  };
}

// Authenticated encryption keeps the Discord access token out of browser JS
// and binds cookies to their purpose and configured site.
export function seal(payload, purpose, cfg) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cfg.key, iv);
  cipher.setAAD(Buffer.from(`${cfg.origin}:${purpose}:v1`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function unseal(value, purpose, cfg) {
  try {
    if (!value || value.length > 3800 || !/^[\w-]+$/.test(value)) return null;
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", cfg.key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(`${cfg.origin}:${purpose}:v1`));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
    return Number.isFinite(payload.exp) && payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function cookieName(purpose, cfg) {
  return `${cfg.secure ? "__Host-" : ""}shchos_${purpose}`;
}

export function cookie(purpose, value, maxAge, cfg) {
  return `${cookieName(purpose, cfg)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.secure ? "; Secure" : ""}`;
}

export function readCookie(req, purpose, cfg) {
  const name = `${cookieName(purpose, cfg)}=`;
  return (req.headers.get("cookie") ?? "").split(";").map(v => v.trim()).find(v => v.startsWith(name))?.slice(name.length);
}

export function response(body, status = 200, headers = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Netlify-CDN-Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff", ...headers,
    },
  });
}

export function checkOrigin(req, cfg) {
  if (req.headers.get("origin") !== cfg.origin) throw new AuthError(403, "invalid_origin");
}

export function requireUser(req, cfg = settings()) {
  const session = unseal(readCookie(req, "session", cfg), "session", cfg);
  if (!session || !/^\d{17,20}$/.test(session.user?.id ?? "") || typeof session.accessToken !== "string") {
    throw new AuthError(401, "unauthorized");
  }
  return session;
}

export async function discord(path, accessToken) {
  let result;
  try {
    result = await fetch(`https://discord.com/api/v10${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000),
    });
  } catch { throw new AuthError(503, "discord_unavailable"); }
  if (result.status === 401) throw new AuthError(401, "unauthorized");
  if (result.status === 404) return null;
  if (!result.ok) throw new AuthError(503, "discord_unavailable");
  return result.json();
}

export async function permissions(session, cfg = settings()) {
  // Never trust a stored isAdmin flag: Discord permissions can change mid-session.
  const guilds = await discord("/users/@me/guilds?limit=200", session.accessToken);
  if (!Array.isArray(guilds)) throw new AuthError(503, "discord_unavailable");
  const guild = guilds.find(item => item.id === cfg.guildId);
  if (!guild) return { isMember: false, isAdmin: false };
  if (guild.owner === true || (BigInt(guild.permissions ?? "0") & 8n) !== 0n) {
    return { isMember: true, isAdmin: true };
  }
  if (!cfg.roles.length) return { isMember: true, isAdmin: false };
  const member = await discord(`/users/@me/guilds/${cfg.guildId}/member`, session.accessToken);
  return { isMember: !!member, isAdmin: !!member?.roles?.some(id => cfg.roles.includes(id)) };
}

// Future report-reading endpoints must call this before querying the database.
export async function requireAdmin(req, cfg = settings()) {
  const session = requireUser(req, cfg);
  if (!(await permissions(session, cfg)).isAdmin) throw new AuthError(403, "forbidden");
  return session.user;
}
