import { createReportsHandler } from "../../src/server/reports.mjs";

export const config = { path: ["/api/reports", "/api/admin/reports"] };
export default createReportsHandler();
