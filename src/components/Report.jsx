import s from './AdminReports.module.css'

export const Report = ({data, locale}) => {
  const {
    id,
    subject,
    category,
    created_at,
    author_name,
    author_id,
    description,
  } = data;
  const type = {
    discord: "Discord",
    minecraft: "Minecraft",
    other: locale === "en" ? "Other" : "Інше",
  }[category];

  return (
    <li>
      <details className={s.reportCard}>
        <summary>
          <h2>{subject}</h2>
          <div className={s.reportMeta}>
            <span>
              {id} · {type}
            </span>
            <time datetime={created_at}>
              {new Date(created_at).toLocaleString(locale === "en" ? "en-GB" : "uk-UA")}
            </time>
          </div>
        </summary>
        <div className={s.reportDetail}>
          <p className={s.reportAuthor}>
            {locale === "en" ? "Author" : "Автор"}: {author_name} · Discord ID: {author_id}`
          </p>
          <p className={s.reportBody}>{description}</p>
        </div>
      </details>
    </li>
  );
};
