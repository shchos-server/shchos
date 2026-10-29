import { getDatabase } from "@netlify/database";

export function createReportStore(db = getDatabase()) {
  // Resolve the deployment's database branch only at request time.
  return {
    async submit(guildId, user, report) {
      const rows = await db.sql`
        SELECT * FROM shchos_submit_report(${guildId}, ${user.id}, ${user.name},
          ${report.requestId}::uuid, ${report.type}, ${report.subject}, ${report.comment})
      `;
      return rows[0];
    },
    async list(guildId, before) {
      const rows = await db.sql`
        SELECT id::text, author_id, author_name, category, subject, description, created_at
        FROM shchos_reports
        WHERE guild_id = ${guildId} AND (${before}::bigint IS NULL OR id < ${before}::bigint)
        ORDER BY shchos_reports.id DESC LIMIT 21
      `;
      return { reports: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
    },
  };
}
