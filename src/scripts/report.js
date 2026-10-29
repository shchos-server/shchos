import { getSession } from "./session.js";
import { reportMessages } from "./report-messages.js";

async function initializeReport(root) {
  const en = root.dataset.locale === "en";
  const messages = reportMessages(en);
  const form = root.querySelector("[data-report-form]");
  const fields = root.querySelector("[data-fields]");
  const access = root.querySelector("[data-access]");
  const login = root.querySelector("[data-report-login]");
  const result = root.querySelector("[data-result]");
  const comment = form.querySelector("[name=comment]");
  const counter = root.querySelector("[data-counter]");
  let attempt;
  let sending = false;
  const updateCount = () => { counter.textContent = String([...comment.value.trim()].length); };
  comment.addEventListener("input", updateCount);

  try {
    const res = await getSession();
    const data = await res.json();
    if (!res.ok) {
      access.textContent = messages[data.error] || messages.unavailable;
      login.hidden = res.status !== 401;
    } else if (!data.isMember) {
      access.textContent = messages.not_member;
    } else {
      fields.disabled = false;
      access.textContent = (en ? "Submitting as " : "Автор рапорту: ") + data.user.name;
    }
  } catch { access.textContent = messages.unavailable; }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (sending || fields.disabled || !form.reportValidity()) return;
    const data = new FormData(form);
    const payload = {
      type: data.get("type"), subject: String(data.get("subject")).trim(), comment: String(data.get("comment")).trim(),
    };
    if ([...payload.subject].length < 3 || [...payload.comment].length < 20) {
      result.hidden = false;
      result.dataset.state = "error";
      result.textContent = messages.invalid_report;
      return;
    }
    const fingerprint = JSON.stringify(payload);
    if (!attempt || attempt.fingerprint !== fingerprint) attempt = { fingerprint, id: crypto.randomUUID() };
    sending = true;
    fields.disabled = true;
    form.setAttribute("aria-busy", "true");
    result.hidden = false;
    result.dataset.state = "";
    result.textContent = en ? "Submitting…" : "Надсилаємо…";
    try {
      const res = await fetch("/api/reports", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: attempt.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        result.dataset.state = "error";
        result.textContent = messages[body.error] || messages.unavailable;
        if (res.status === 401) {
          login.hidden = false;
          login.target = "_blank";
          login.rel = "noopener";
          result.textContent += en ? " Sign in in the new tab, then return here and retry. Your text is preserved." : " Увійдіть у новій вкладці, поверніться сюди та повторіть. Ваш текст збережено у формі.";
        }
        if (res.status === 409) attempt = null;
        return;
      }
      result.dataset.state = "success";
      result.textContent = en ? `Report #${body.id} submitted. The server team can now review it.` : `Рапорт №${body.id} надіслано. Адміністрація сервера зможе його переглянути.`;
      form.reset();
      updateCount();
      attempt = null;
      login.hidden = true;
    } catch {
      result.dataset.state = "error";
      result.textContent = en ? "Could not confirm submission. Retry without changing the text — this will not create a duplicate." : "Не вдалося підтвердити надсилання. Повторіть без зміни тексту — дублікат не буде створено.";
    } finally {
      sending = false;
      fields.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });
}

document.querySelectorAll("[data-report-page]").forEach(initializeReport);
