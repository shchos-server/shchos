import { reportMessages } from "./report-messages.js";

function initializeAdmin(root) {
  const en = root.dataset.locale === "en";
  const messages = reportMessages(en);
  const list = root.querySelector("[data-report-list]");
  const message = root.querySelector("[data-admin-message]");
  const login = root.querySelector("[data-admin-login]");
  const refresh = root.querySelector("[data-refresh]");
  const more = root.querySelector("[data-more]");
  let cursor = null;
  let busy = false;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function card(report) {
    const details = document.createElement("details");
    details.className = "report-card";
    const summary = document.createElement("summary");
    summary.append(element("h2", report.subject));
    const meta = document.createElement("div");
    meta.className = "report-meta";
    const type = { discord: "Discord", minecraft: "Minecraft", other: en ? "Other" : "Інше" }[report.category];
    meta.append(element("span", `#${report.id} · ${type}`));
    const time = element("time", new Date(report.created_at).toLocaleString(en ? "en-GB" : "uk-UA"));
    time.dateTime = report.created_at;
    meta.append(time);
    summary.append(meta);
    const content = document.createElement("div");
    content.className = "report-detail";
    content.append(element("p", `${en ? "Author" : "Автор"}: ${report.author_name} · Discord ID: ${report.author_id}`, "report-author"));
    // Treat all submitted content as text, including HTML and evidence URLs.
    content.append(element("p", report.description, "report-body"));
    details.append(summary, content);
    return details;
  }

  async function load(reset) {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    more.disabled = true;
    list.setAttribute("aria-busy", "true");
    message.hidden = false;
    message.dataset.state = "";
    message.textContent = en ? "Loading reports…" : "Завантажуємо рапорти…";
    login.hidden = true;
    if (reset) { list.replaceChildren(); cursor = null; more.hidden = true; }
    try {
      const query = cursor ? `?before=${encodeURIComponent(cursor)}` : "";
      const res = await fetch(`/api/admin/reports${query}`, { credentials: "same-origin", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        message.dataset.state = "error";
        message.textContent = messages[data.error] || messages.unavailable;
        if (res.status === 401 || res.status === 403) {
          list.replaceChildren(); cursor = null; more.hidden = true;
          login.hidden = res.status !== 401;
        }
        return;
      }
      const nodes = data.reports.map(card);
      list.append(...nodes);
      cursor = data.nextCursor;
      more.hidden = !cursor;
      message.textContent = list.children.length
        ? (en ? `Loaded ${list.children.length} reports. Expand a report to read its details.` : `Завантажено рапортів: ${list.children.length}. Розгорніть рапорт, щоб прочитати деталі.`)
        : (en ? "No reports yet." : "Рапортів поки немає.");
      if (!reset && nodes.length) nodes[0].querySelector("summary").focus();
    } catch {
      message.dataset.state = "error";
      message.textContent = messages.unavailable;
    } finally {
      busy = false;
      refresh.disabled = false;
      more.disabled = false;
      list.removeAttribute("aria-busy");
    }
  }
  refresh.addEventListener("click", () => load(true));
  more.addEventListener("click", () => load(false));
  // Do not leave private content in the back/forward cache after signing out.
  window.addEventListener("pagehide", () => list.replaceChildren());
  window.addEventListener("pageshow", event => { if (event.persisted) load(true); });
  load(true);
}

document.querySelectorAll("[data-admin-page]").forEach(initializeAdmin);
