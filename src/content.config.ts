import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const rules = defineCollection({
    loader: glob({ pattern: '*.md', base: './src/content/rules' }),
    schema: z.object({
        title: z.string(),
        author: z.string(),
        published_at: z.string(),
        last_modified: z.string(),
        source: z.string(),
        cover_image: z.string(),
        cover_caption: z.string(),
        tags: z.array(z.string()),
    })
})

export const collections = { rules }