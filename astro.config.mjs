// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://andrii-avramenko.github.io",
  i18n: {
    locales: ["en", "uk"],
    defaultLocale: "uk",
    fallback: {
      en: "uk",
    },
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true,
    },
  },
});
