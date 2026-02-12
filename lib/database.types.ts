import { z } from 'zod';
import type { Database } from './database.schema';

// Auto-generated Zod schemas based on database.schema.ts

export const publicImagesSchema = z.object({
  id: z.number(),
  original_url: z.string(),
  page_id: z.number().nullable(),
  storage_path: z.string(),
});

export const publicPagesSchema = z.object({
  content: z.string().nullable(),
  id: z.number(),
  scraped_at: z.string().nullable(),
  title: z.string(),
  url: z.string(),
});

// Export inferred types
export type ImagesType = z.infer<typeof publicImagesSchema>;
export type PagesType = z.infer<typeof publicPagesSchema>;

// Database type for reference
export type SupabaseDatabase = Database;
