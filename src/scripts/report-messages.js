export function reportMessages(en) {
  return en ? {
    unauthorized: "Sign in with Discord to continue. Your session may have expired.",
    forbidden: "Only this server’s administrators and authorized roles can view reports.",
    not_member: "Only members of this Discord server can submit reports.",
    not_configured: "Discord sign-in is not configured. Contact the site administrator.",
    database_unavailable: "Report storage is temporarily unavailable. Please try again later.",
    discord_unavailable: "Could not verify your Discord permissions. Please try again later.",
    invalid_report: "Choose a report type, enter a subject of 3–120 characters and a description of 20–5,000 characters.",
    payload_too_large: "The report is too long. Shorten the text and try again.",
    rate_limited: "Please wait one minute before submitting another report.",
    request_conflict: "This submission was already used for different text. Check your report and submit again.",
    unavailable: "Could not complete the request. Please try again.",
  } : {
    unauthorized: "Увійдіть через Discord, щоб продовжити. Можливо, час вашої сесії минув.",
    forbidden: "Рапорти доступні лише адміністраторам цього сервера та дозволеним ролям.",
    not_member: "Надсилати рапорти можуть лише учасники цього Discord-сервера.",
    not_configured: "Вхід через Discord не налаштовано. Зверніться до адміністратора сайту.",
    database_unavailable: "Сховище рапортів тимчасово недоступне. Спробуйте пізніше.",
    discord_unavailable: "Не вдалося перевірити ваші права в Discord. Спробуйте пізніше.",
    invalid_report: "Оберіть тип, введіть тему від 3 до 120 символів та опис від 20 до 5 000 символів.",
    payload_too_large: "Рапорт завеликий. Скоротіть текст та повторіть спробу.",
    rate_limited: "Зачекайте одну хвилину перед надсиланням наступного рапорту.",
    request_conflict: "Це надсилання вже використано для іншого тексту. Перевірте рапорт та надішліть знову.",
    unavailable: "Не вдалося виконати запит. Спробуйте ще раз.",
  };
}
