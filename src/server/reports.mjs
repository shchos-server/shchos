import { AuthError, ConfigurationError, settings, requireUser, requireAdmin, permissions, checkOrigin, response } from "./auth.mjs";
import { createReportStore } from "./report-store.mjs";

const MAX_BODY_BYTES = 32768;

async function readReport(req) {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AuthError(415, "json_required");
  }
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) throw new AuthError(413, "payload_too_large");
  const reader = req.body?.getReader();
  if (!reader) throw new AuthError(400, "invalid_report");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AuthError(413, "payload_too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AuthError(400, "invalid_report"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AuthError(400, "invalid_report");
  const { type, requestId } = body;
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!["discord", "minecraft", "other"].includes(type) ||
      typeof requestId !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(requestId) ||
      [...subject].length < 3 || subject.length > 120 || [...comment].length < 20 || comment.length > 5000 ||
      subject.includes("\0") || comment.includes("\0")) throw new AuthError(400, "invalid_report");
  return { type, subject, comment, requestId };
}

export function createReportsHandler(storeFactory = createReportStore) {
  return async function handler(req) {
    try {
      const cfg = settings();
      const url = new URL(req.url);
      if (url.origin !== cfg.origin) throw new AuthError(400, "wrong_origin");
      const admin = url.pathname === "/api/admin/reports";
      if (!admin && url.pathname !== "/api/reports") return response({ error: "not_found" }, 404);
      const method = admin ? "GET" : "POST";
      if (req.method !== method) return response({ error: "method_not_allowed" }, 405, { Allow: method });
      if (admin) {
        await requireAdmin(req, cfg);
        const before = url.searchParams.get("before");
        if (before !== null && (!/^[1-9]\d{0,18}$/.test(before) || BigInt(before) > 9223372036854775807n)) {
          throw new AuthError(400, "invalid_cursor");
        }
        return response(await storeFactory().list(cfg.guildId, before));
      }
      checkOrigin(req, cfg);
      const session = requireUser(req, cfg);
      const report = await readReport(req);
      if (!(await permissions(session, cfg)).isMember) throw new AuthError(403, "not_member");
      const saved = await storeFactory().submit(cfg.guildId, session.user, report);
      if (saved.outcome === "rate_limited") return response({ error: "rate_limited" }, 429, { "Retry-After": "60" });
      if (saved.outcome === "conflict") throw new AuthError(409, "request_conflict");
      if (!["created", "existing"].includes(saved.outcome) || !saved.report_id) throw new Error("Invalid database result");
      return response({ id: saved.report_id }, saved.outcome === "created" ? 201 : 200);
    } catch (error) {
      if (error instanceof AuthError) {
        return response({ error: error.message, ...(error instanceof ConfigurationError ? { issues: error.issues } : {}) }, error.status);
      }
      // Database errors may contain report contents or credentials: never expose them.
      return response({ error: "database_unavailable" }, 503);
    }
  };
}
