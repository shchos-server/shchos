// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  site: "https://shchos.netlify.app/",

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
      filter: (page) =>
        page !== `https://shchos.netlify.app/uk/admin` &&
        page !== `https://shchos.netlify.app/en/admin`,
      i18n: {
        defaultLocale: "uk",
        locales: {
          uk: "uk",
          en: "en",
        },
      },
    }),
    react(),
    mdx(),
  ],
});
