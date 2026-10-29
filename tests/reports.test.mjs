import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createReportsHandler } from "../src/server/reports.mjs";
import { settings, cookie, seal } from "../src/server/auth.mjs";

const oldEnv = { ...process.env };
const oldFetch = globalThis.fetch;
const guildId = "223456789012345678";
const authorId = "123456789012345678";
const report = { type: "discord", subject: "A problem", comment: "This is a sufficiently detailed report.", requestId: "42fb07d4-1454-43f6-8278-6f3d8e34ea99" };

function setup(guilds = [{ id: guildId, permissions: "0" }]) {
  Object.assign(process.env, { SITE_URL: "https://example.com", DISCORD_CLIENT_ID: authorId,
    DISCORD_CLIENT_SECRET: "test", DISCORD_GUILD_ID: guildId, DISCORD_ADMIN_ROLE_IDS: "", SESSION_SECRET: "ab".repeat(32) });
  globalThis.fetch = async () => Response.json(guilds);
  const cfg = settings();
  return cookie("session", seal({ user: { id: authorId, name: "Member" }, accessToken: "test-token", exp: Date.now() + 60000 }, "session", cfg), 60, cfg).split(";")[0];
}

function req(session, body = report, extra = {}) {
  return new Request("https://example.com/api/reports", {
    method: "POST", headers: { origin: "https://example.com", cookie: session, "content-type": "application/json", ...extra }, body: JSON.stringify(body),
  });
}

afterEach(() => {
  globalThis.fetch = oldFetch;
  for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
  Object.assign(process.env, oldEnv);
});

test("anonymous, cross-origin, expired and non-member submissions cannot reach the database", async () => {
  let calls = 0;
  const handler = createReportsHandler(() => { calls++; throw new Error("Must not open database"); });
  const session = setup();
  assert.equal((await handler(req(""))).status, 401);
  assert.equal((await handler(req(session, report, { origin: "https://attacker.example" }))).status, 403);
  const cfg = settings();
  const expired = cookie("session", seal({ exp: Date.now() - 1000 }, "session", cfg), 60, cfg);
  assert.equal((await handler(req(expired))).status, 401);
  setup([]);
  assert.equal((await handler(req(session))).status, 403);
  assert.equal(calls, 0);
});

test("submission uses the verified author and guild, ignoring forged fields", async () => {
  const session = setup();
  let saved;
  const handler = createReportsHandler(() => ({ submit: async (...args) => { saved = args; return { report_id: "51", outcome: "created" }; } }));
  const result = await handler(req(session, { ...report, subject: "  A problem  ", authorId: "forged", guildId: "forged", isAdmin: true }));
  assert.equal(result.status, 201);
  assert.deepEqual(await result.json(), { id: "51" });
  assert.deepEqual(saved, [guildId, { id: authorId, name: "Member" }, report]);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("invalid fields, malformed JSON and oversized streaming bodies are rejected before saving", async () => {
  const session = setup();
  let calls = 0;
  const handler = createReportsHandler(() => { calls++; throw new Error("Must not open database"); });
  for (const body of [null, [], { ...report, type: "invalid" }, { ...report, subject: "  " }, { ...report, comment: "short" },
    { ...report, comment: "a".repeat(5001) }, { ...report, comment: "a".repeat(20) + "\0" }, { ...report, requestId: "not-a-uuid" }]) {
    assert.equal((await handler(req(session, body))).status, 400);
  }
  assert.equal((await handler(req(session, report, { "content-type": "text/plain" }))).status, 415);
  const malformed = new Request("https://example.com/api/reports", { method: "POST", headers: { cookie: session, origin: "https://example.com", "content-type": "application/json" }, body: "{" });
  assert.equal((await handler(malformed)).status, 400);
  assert.equal((await handler(req(session, { ...report, comment: "a".repeat(33000) }))).status, 413);
  assert.equal(calls, 0);
});

test("retries return the same report and cooldowns and conflicting retries have explicit responses", async () => {
  const session = setup();
  for (const [outcome, status] of [["existing", 200], ["rate_limited", 429], ["conflict", 409]]) {
    const handler = createReportsHandler(() => ({ submit: async () => ({ report_id: "51", outcome }) }));
    const result = await handler(req(session));
    assert.equal(result.status, status);
    if (status === 429) assert.equal(result.headers.get("retry-after"), "60");
  }
});

test("only current guild administrators can read reports; removed permissions take effect immediately", async () => {
  const session = setup();
  let reads = 0;
  const handler = createReportsHandler(() => ({ list: async () => { reads++; return { reports: [], nextCursor: null }; } }));
  const read = cookieValue => new Request("https://example.com/api/admin/reports", { headers: { cookie: cookieValue } });
  assert.equal((await handler(read(""))).status, 401);
  assert.equal((await handler(read(session))).status, 403);
  assert.equal(reads, 0);
  setup([{ id: guildId, permissions: "8" }]);
  assert.equal((await handler(read(session))).status, 200);
  setup([{ id: "923456789012345678", permissions: "8" }]);
  assert.equal((await handler(read(session))).status, 403);
  assert.equal(reads, 1);
});

test("pagination validates the cursor and scopes every query to the configured guild", async () => {
  const session = setup([{ id: guildId, owner: true }]);
  let args;
  const handler = createReportsHandler(() => ({ list: async (...values) => { args = values; return { reports: [{ id: "2" }], nextCursor: "2" }; } }));
  const read = value => new Request(`https://example.com/api/admin/reports?before=${encodeURIComponent(value)}`, { headers: { cookie: session } });
  const result = await handler(read("25"));
  assert.equal(result.status, 200);
  assert.deepEqual(args, [guildId, "25"]);
  assert.equal(result.headers.get("netlify-cdn-cache-control"), "no-store");
  for (const invalid of ["0", "-1", "1 OR 1=1", "9223372036854775808", ""]) assert.equal((await handler(read(invalid))).status, 400);
});

test("unsupported methods and Discord failures cannot access storage; database failures do not leak contents", async () => {
  const session = setup();
  let opened = false;
  const handler = createReportsHandler(() => { opened = true; throw new Error("postgres://password; private report text"); });
  assert.equal((await handler(new Request("https://example.com/api/reports"))).status, 405);
  globalThis.fetch = async () => new Response("", { status: 429 });
  assert.equal((await handler(req(session))).status, 503);
  assert.equal(opened, false);
  setup();
  const result = await handler(req(session));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: "database_unavailable" });
});
