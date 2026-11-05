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
      <details>
        <summary>
          <h2>{subject}</h2>
          <div>
            <span>
              {id} · {type}
            </span>
            <time datetime={created_at}>
              {new Date(created_at).toLocaleString(locale === "en" ? "en-GB" : "uk-UA")}
            </time>
          </div>
        </summary>
        <div>
          <p>
            {locale === "en" ? "Author" : "Автор"}: {author_name} · Discord ID: {author_id}`
          </p>
          <p>{description}</p>
        </div>
      </details>
    </li>
  );
};
