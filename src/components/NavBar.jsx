import s from "./NavBar.module.css";

export const NavBar = ({ children }) => {
  return (
    <header className={s.header}>
      <a href="/uk">
        <h2>щось</h2>
      </a>
      <nav>
        <ul>
          <li>
            <a href="/uk/rules">Правила</a>
          </li>
          <li>
            <a href="/uk/report">Рапорт</a>
          </li>
        </ul>
      </nav>
      <div className={s.headerActions}>
        {children}
      </div>
    </header>
  );
};
