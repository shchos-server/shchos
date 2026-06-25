// @ts-check
import { defineConfig } from "astro/config";

import sitemap from "@astrojs/sitemap";

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
      // redirectToDefaultLocale: true,
    },
  },

  integrations: [
    sitemap({
      i18n: {
        defaultLocale: "uk",
        locales: {
          uk: "uk",
          en: "en",
        },
      },
    }),
  ],
});
