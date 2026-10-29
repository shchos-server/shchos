import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createReportStore } from "../../src/server/report-store.mjs";

export async function testDatabase() {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL("../../netlify/database/migrations/202610290001_create_reports.sql", import.meta.url), "utf8"));
  // The same store queries run against a real in-memory Postgres engine.
  const db = {
    async sql(strings, ...values) {
      const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
      return (await pg.query(query, values)).rows;
    },
  };
  return { pg, store: createReportStore(db) };
}
