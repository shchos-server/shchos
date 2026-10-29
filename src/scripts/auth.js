async function initializeAccount(root) {
  const english = root.dataset.locale === "en";
  const login = root.querySelector("[data-login]");
  const logout = root.querySelector("[data-logout]");
  const profile = root.querySelector("[data-profile]");
  const status = root.querySelector("[data-auth-status]");
  const messages = english ? {
    cancelled: "Discord sign-in was cancelled.", invalid_state: "Sign-in expired. Please try again.",
    failed: "Could not sign in with Discord. Please try again.",
    not_configured: "Discord sign-in has not been configured yet.",
    unavailable: "Could not check your session. Please reload the page.",
    logout: "Could not sign out. Please try again.",
  } : {
    cancelled: "Вхід через Discord скасовано.", invalid_state: "Час входу минув. Спробуйте ще раз.",
    failed: "Не вдалося увійти через Discord. Спробуйте ще раз.",
    not_configured: "Вхід через Discord ще не налаштовано.",
    unavailable: "Не вдалося перевірити сесію. Оновіть сторінку.",
    logout: "Не вдалося вийти. Спробуйте ще раз.",
  };
  const url = new URL(window.location.href);
  if (url.searchParams.has("auth_error")) {
    status.textContent = messages[url.searchParams.get("auth_error")] || messages.failed;
    url.searchParams.delete("auth_error");
    history.replaceState(null, "", url);
  }
  try {
    const result = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    if (result.status !== 401) {
      const data = await result.json();
      if (!result.ok) {
        status.textContent = data.error === "not_configured" ? messages.not_configured : messages.unavailable;
      } else {
        root.querySelector("[data-name]").textContent = data.user.name;
        root.querySelector("[data-admin]").hidden = !data.isAdmin;
        login.hidden = true;
        logout.hidden = false;
        profile.hidden = false;
      }
    }
  } catch { status.textContent = messages.unavailable; }
  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      const result = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!result.ok) throw new Error("Logout failed");
      window.location.reload();
    } catch { status.textContent = messages.logout; logout.disabled = false; }
  });
}

document.querySelectorAll("[data-discord-account]").forEach(initializeAccount);
