import axios from "axios";

export const getSession = () => {
  return axios
    .get("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
    })
    .then((res) => res.data.clone())
    .catch((err) => {
      throw err;
    });
};

export const logOut = () => {
  return axios
    .post("/api/auth/logout", {
      credentials: "same-origin",
    })
    .then((res) => res.data)
    .catch((err) => {
      throw err;
    });
};

export const makeReport = (payload) => {
  const fingerprint = JSON.stringify(payload);
  const attempt = { fingerprint, id: crypto.randomUUID() };
  return axios
    .post("/api/reports", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, requestId: attempt.id }),
    })
    .then((res) => res.data)
    .catch((err) => {
      throw err;
    });
};

export const getAdminReports = (before) => {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return axios
    .get(`/api/admin/reports${query}`, {
      params: before ? { before } : {},
      validateStatus: () => true,
    })
    .then((res) => res)
    .catch((err) => {
      throw err;
    });
};
