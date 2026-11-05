import { useEffect, useRef, useState } from "react";
import { getAdminReports } from "../scripts/api";
import { reportMessages } from "../scripts/report-messages";
import { Report } from "./Report";
import { flushSync } from "react-dom";

export const AdminReports = ({ locale = "uk" }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cursor, setCursor] = useState(null);
  const requestIdRef = useRef(0);
  const busyRef = useRef(false);
  const [hideLogin, setHideLogin] = useState(true);

  const messages = reportMessages(locale === "en");

  const loadReports = async (reset) => {
    if (busyRef.current) return;

    const requestId = ++requestIdRef.current;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    setHideLogin(true);

    const before = reset ? null : cursor;

    if (reset) {
      setReports([]);
      setCursor(null);
    }

    try {
      const res = await getAdminReports(before);
      const data = res.data;

      if (requestId !== requestIdRef.current) return;
      if (res.status < 200 || res.status >= 300) {
        setError(messages[data.error] || messages.unavailable);
        if (res.status === 401 || res.status === 403) {
          setReports([]);
          setCursor(null);
          setHideLogin(res.status !== 401);
        }
        return;
      }
      setReports((p) => (reset ? data.reports : [...p, ...data.reports]));
      setCursor(data.nextCursor);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(messages.unavailable);
        console.error(err);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        busyRef.current = false;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setLoading(true);
    loadReports(true);
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      requestIdRef.current += 1;
      busyRef.current = false;

      flushSync(() => {
        setReports([]);
        setCursor(null);
        setError(null);
        setHideLogin(true);
        setLoading(false);
      });
    };

    const handlePageShow = (event) => {
      if (event.persisted) {
        loadReports(true);
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [loadReports]);

  return (
    <section>
      <div>
        <div>
          <h1>{locale === "en" ? "Reports" : "Рапорти"}</h1>
          <p>
            {locale === "en"
              ? "Reports from server members, newest first."
              : "Звернення учасників сервера — спочатку найновіші."}
          </p>
        </div>
        <button
          type="button"
          className="action secondary"
          onClick={(e) => loadReports(true)}
          disabled={loading}
        >
          {locale === "en" ? "Refresh" : "Оновити"}
        </button>
      </div>
      <div role="status" aria-live="polite" data-state={error ? "error" : ""}>
        {error
          ? error
          : loading
            ? locale === "en"
              ? "Loading reports…"
              : "Завантажуємо рапорти…"
            : reports.length
              ? locale === "en"
                ? `Loaded ${reports.length} reports. Expand a report to read its details.`
                : `Завантажено рапортів: ${reports.length}. Розгорніть рапорт, щоб прочитати деталі.`
              : locale === "en"
                ? "No reports yet."
                : "Рапортів поки немає."}
      </div>
      <a
        hidden={hideLogin}
        href={`/api/auth/discord?locale=${locale}&returnTo=/${locale}/admin`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="15"
          fill="#fff"
          preserveAspectRatio="xMidYMid"
          viewBox="0 -28.5 256 256"
        >
          <path
            fill="#fff"
            d="M216.86 16.6A209 209 0 0 0 164.04 0a155 155 0 0 0-6.76 14.05 194 194 0 0 0-58.54 0C96.91 9.65 94.2 4.1 91.9 0a208 208 0 0 0-52.86 16.64C5.62 67.14-3.44 116.4 1.1 164.96c22.17 16.55 43.65 26.6 64.77 33.19a161 161 0 0 0 13.88-22.85 136 136 0 0 1-21.85-10.63q2.75-2.05 5.35-4.24c42.13 19.7 87.9 19.7 129.51 0q2.64 2.2 5.36 4.24a136 136 0 0 1-21.89 10.65c4.01 8.02 8.64 15.67 13.88 22.85 21.14-6.58 42.64-16.64 64.81-33.21 5.32-56.3-9.08-105.1-38.05-148.36M85.47 135.1c-12.64 0-23.01-11.81-23.01-26.19 0-14.37 10.15-26.2 23.01-26.2s23.24 11.8 23.02 26.2c.02 14.38-10.15 26.18-23.02 26.18m85.06 0c-12.65 0-23.02-11.81-23.02-26.19 0-14.37 10.15-26.2 23.02-26.2s23.23 11.8 23.01 26.2c0 14.38-10.15 26.18-23.01 26.18"
          ></path>
        </svg>
        {locale === "en" ? "Sign in with Discord" : "Увійти через Discord"}
      </a>
      <noscript>
        <p>
          {locale === "en"
            ? "Enable JavaScript to view reports."
            : "Увімкніть JavaScript, щоб переглянути рапорти."}
        </p>
      </noscript>
      <div aria-busy={loading}>
        {reports.map((i) => (
          <Report key={i.id} data={i} locale={locale} />
        ))}
      </div>
      <button
        type="button"
        hidden={!cursor}
        disabled={loading}
        onClick={(e) => loadReports(false)}
      >
        {locale === "en" ? "Load older reports" : "Завантажити попередні"}
      </button>
    </section>
  );
};
