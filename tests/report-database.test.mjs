import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./helpers/report-database.mjs";

test("Postgres migration, retries, cooldown, constraints and private pagination", async () => {
  const { pg, store } = await testDatabase();
  const guild = "223456789012345678";
  const user = { id: "123456789012345678", name: "Member" };
  const report = { requestId: randomUUID(), type: "discord", subject: "Unsafe message", comment: "<script>alert('xss')</script> '); DROP TABLE shchos_reports; --" };
  try {
    const saved = await store.submit(guild, user, report);
    assert.equal(saved.outcome, "created");
    const retried = await store.submit(guild, user, report);
    assert.equal(retried.outcome, "existing");
    assert.equal(retried.report_id, saved.report_id);
    assert.equal((await store.submit(guild, user, { ...report, subject: "Changed text" })).outcome, "conflict");
    assert.equal((await store.submit(guild, user, { ...report, requestId: randomUUID() })).outcome, "rate_limited");
    assert.equal((await pg.query("SELECT count(*)::int AS count FROM shchos_reports")).rows[0].count, 1);
    const firstPage = await store.list(guild, null);
    assert.equal(firstPage.reports[0].description, report.comment);
    assert.equal(firstPage.reports[0].author_id, user.id);
    assert.equal(firstPage.nextCursor, null);
    assert.equal((await store.list("923456789012345678", null)).reports.length, 0);
    await pg.query("UPDATE shchos_reports SET created_at = clock_timestamp() - interval '61 seconds'");
    const attempts = await Promise.all([
      store.submit(guild, user, { ...report, requestId: randomUUID() }),
      store.submit(guild, user, { ...report, requestId: randomUUID() }),
    ]);
    assert.deepEqual(attempts.map(row => row.outcome).sort(), ["created", "rate_limited"]);
    const otherUser = { id: "423456789012345678", name: "Another member" };
    await assert.rejects(() => store.submit(guild, otherUser, { ...report, type: "invalid" }), /check constraint/);
    await assert.rejects(() => store.submit(guild, otherUser, { ...report, comment: "short" }), /check constraint/);
    for (let i = 0; i < 24; i++) {
      await store.submit(guild, { id: String(523456789012345678n + BigInt(i)), name: `Member ${i}` }, { ...report, requestId: randomUUID() });
    }
    const page1 = await store.list(guild, null);
    const page2 = await store.list(guild, page1.nextCursor);
    assert.equal(page1.reports.length, 20);
    assert.equal(page2.reports.length, 6);
    assert.equal(page2.nextCursor, null);
    const ids = [...page1.reports, ...page2.reports].map(row => row.id);
    assert.equal(new Set(ids).size, 26);
    assert.ok(ids.every((id, index) => index === 0 || BigInt(id) < BigInt(ids[index - 1])));
  } finally { await pg.close(); }
});
