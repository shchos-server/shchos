import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/auth.mjs";
import { settings, seal, unseal, cookie, requireAdmin, requireUser } from "../src/server/auth.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const userId = "123456789012345678";
const guildId = "223456789012345678";
const roleId = "323456789012345678";

function setup() {
  Object.assign(process.env, {
    SITE_URL: "https://example.com", DISCORD_CLIENT_ID: userId,
    DISCORD_CLIENT_SECRET: "test-client-secret", DISCORD_GUILD_ID: guildId,
    DISCORD_ADMIN_ROLE_IDS: "", SESSION_SECRET: "ab".repeat(32),
  });
  return settings();
}

function sessionCookie(cfg, extra = {}) {
  return cookie("session", seal({
    user: { id: userId, name: "Test" }, accessToken: "private-token",
    exp: Date.now() + 60000, ...extra,
  }, "session", cfg), 60, cfg).split(";")[0];
}

function request(path, headers = {}, method = "GET") {
  return new Request(`https://example.com/api/auth/${path}`, { method, headers });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

test("login uses a registered callback, minimal scopes and protected state cookie", async () => {
  setup();
  const result = await handler(request("discord?locale=en&returnTo=https://evil.example"));
  assert.equal(result.status, 303);
  const target = new URL(result.headers.get("location"));
  assert.equal(target.origin, "https://discord.com");
  assert.equal(target.searchParams.get("redirect_uri"), "https://example.com/api/auth/callback");
  assert.equal(target.searchParams.get("scope"), "identify guilds guilds.members.read");
  assert.ok(target.searchParams.get("state").length >= 32);
  assert.match(result.headers.get("set-cookie"), /__Host-shchos_oauth=.*HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("callback rejects missing, expired and mismatched state before contacting Discord", async () => {
  const cfg = setup();
  globalThis.fetch = () => { throw new Error("Must not call Discord"); };
  for (const state of [null, { nonce: "expected", exp: Date.now() - 1 }, { nonce: "different", exp: Date.now() + 60000 }]) {
    const headers = state ? { cookie: cookie("oauth", seal(state, "oauth", cfg), 60, cfg) } : {};
    const result = await handler(request("callback?code=code&state=expected", headers));
    assert.match(result.headers.get("location"), /auth_error=invalid_state/);
    assert.match(result.headers.get("set-cookie"), /Max-Age=0/);
    assert.doesNotMatch(result.headers.get("set-cookie"), /shchos_session/);
  }
});

test("callback establishes a bounded encrypted session without exposing Discord tokens", async () => {
  const cfg = setup();
  const start = await handler(request("discord?locale=en"));
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    if (calls === 1) {
      assert.equal(url, "https://discord.com/api/oauth2/token");
      assert.equal(options.method, "POST");
      assert.equal(options.body.get("client_secret"), "test-client-secret");
      assert.equal(options.body.get("redirect_uri"), cfg.redirectUri);
      return Response.json({ access_token: "private-token", expires_in: 604800 });
    }
    assert.equal(options.headers.Authorization, "Bearer private-token");
    return Response.json({ id: userId, username: "Test", global_name: "Tester" });
  };
  const result = await handler(request(`callback?code=test&state=${state}`, { cookie: start.headers.getSetCookie()[0].split(";")[0] }));
  assert.equal(result.headers.get("location"), "/en");
  const session = result.headers.getSetCookie().find(value => value.startsWith("__Host-shchos_session="));
  assert.match(session, /Max-Age=3600/);
  assert.ok(!session.includes("private-token"));
  const userSession = requireUser(request("session", { cookie: session.split(";")[0] }), cfg);
  assert.equal(userSession.user.id, userId);
  assert.equal(userSession.user.name, "Tester");
  assert.equal(calls, 2);
});

test("cancelled and failed OAuth return UI error codes and no session", async () => {
  const cfg = setup();
  const stateCookie = cookie("oauth", seal({ nonce: "test", locale: "en", exp: Date.now() + 60000 }, "oauth", cfg), 60, cfg);
  const cancelled = await handler(request("callback?state=test&error=access_denied", { cookie: stateCookie }));
  assert.equal(cancelled.headers.get("location"), "/en?auth_error=cancelled");
  globalThis.fetch = async () => new Response("Failure", { status: 500 });
  const failed = await handler(request("callback?state=test&code=test", { cookie: stateCookie }));
  assert.equal(failed.headers.get("location"), "/en?auth_error=failed");
  assert.doesNotMatch(failed.headers.get("set-cookie"), /shchos_session/);
});

test("cookies reject tampering, wrong purpose, other sites and expiry", () => {
  const cfg = setup();
  const value = seal({ exp: Date.now() + 60000 }, "session", cfg);
  assert.ok(unseal(value, "session", cfg));
  assert.equal(unseal((value[0] === "A" ? "B" : "A") + value.slice(1), "session", cfg), null);
  assert.equal(unseal(value, "oauth", cfg), null);
  assert.equal(unseal(value, "session", { ...cfg, origin: "https://evil.example" }), null);
  assert.equal(unseal(seal({ exp: Date.now() - 1 }, "session", cfg), "session", cfg), null);
});

test("anonymous sessions are 401 and missing configuration fails closed", async () => {
  setup();
  assert.equal((await handler(request("session"))).status, 401);
  delete process.env.SESSION_SECRET;
  const result = await handler(request("discord"));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: "not_configured" });
});

test("session returns only public user information and live admin status", async () => {
  const cfg = setup();
  globalThis.fetch = async () => Response.json([{ id: guildId, permissions: "8" }]);
  const result = await handler(request("session", { cookie: sessionCookie(cfg) }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { user: { id: userId, name: "Test" }, isMember: true, isAdmin: true });
});

test("owner, Administrator and configured roles authorize; removed roles immediately deny", async () => {
  const cfg = { ...setup(), roles: [roleId] };
  const req = request("session", { cookie: sessionCookie(cfg) });
  for (const guild of [{ id: guildId, owner: true }, { id: guildId, permissions: "8" }]) {
    globalThis.fetch = async () => Response.json([guild]);
    assert.equal((await requireAdmin(req, cfg)).id, userId);
  }
  let roles = [roleId];
  globalThis.fetch = async url => Response.json(url.includes("/member") ? { roles } : [{ id: guildId, permissions: "0" }]);
  assert.equal((await requireAdmin(req, cfg)).id, userId);
  roles = [];
  await assert.rejects(() => requireAdmin(req, cfg), error => error.status === 403);
});

test("another guild and forged client flags never grant access", async () => {
  const cfg = setup();
  const req = request("session", { cookie: sessionCookie(cfg, { isAdmin: true }) });
  globalThis.fetch = async () => Response.json([{ id: "923456789012345678", owner: true, permissions: "8" }]);
  await assert.rejects(() => requireAdmin(req, cfg), error => error.status === 403);
});

test("Discord outages and revoked OAuth tokens fail closed", async () => {
  const cfg = setup();
  for (const status of [429, 500, 401]) {
    globalThis.fetch = async () => new Response("", { status });
    const result = await handler(request("session", { cookie: sessionCookie(cfg) }));
    assert.equal(result.status, status === 401 ? 401 : 503);
    if (status === 401) assert.match(result.headers.get("set-cookie"), /Max-Age=0/);
  }
});

test("logout is POST-only, checks Origin and clears cookies", async () => {
  setup();
  assert.equal((await handler(request("logout"))).status, 405);
  assert.equal((await handler(request("logout", {}, "POST"))).status, 403);
  assert.equal((await handler(request("logout", { origin: "https://evil.example" }, "POST"))).status, 403);
  const result = await handler(request("logout", { origin: "https://example.com" }, "POST"));
  assert.equal(result.status, 200);
  assert.equal(result.headers.getSetCookie().length, 2);
  result.headers.getSetCookie().forEach(value => assert.match(value, /Max-Age=0/));
});

test("OAuth rejects other deployment origins and insecure production URLs", async () => {
  setup();
  assert.equal((await handler(new Request("https://preview.example/api/auth/discord"))).status, 400);
  process.env.SITE_URL = "http://example.com";
  assert.throws(settings, error => error.status === 503);
  process.env.SITE_URL = "http://localhost:8888";
  assert.equal(settings().secure, false);
});
