let pending;
export function getSession() {
  pending ??= fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
  return pending.then(result => result.clone());
}
