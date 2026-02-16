import { z } from "zod";
import type { Database } from "./database.schema";

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

export const publicScrape_jobsSchema = z.object({
  args: z.any().nullable(),
  created_at: z.string().nullable(),
  error: z.string().nullable(),
  finished_at: z.string().nullable(),
  id: z.string(),
  logs: z.string().nullable(),
  name: z.string(),
  started_at: z.string().nullable(),
  status: z.string(),
});

export const publicTasksSchema = z.object({
  args: z.any().nullable(),
  created_at: z.string().nullable(),
  error: z.string().nullable(),
  finished_at: z.string().nullable(),
  id: z.string(),
  logs: z.string().nullable(),
  name: z.string(),
  result: z.any().nullable(),
  started_at: z.string().nullable(),
  status: z.string(),
});

// Export inferred types
export type ImagesType = z.infer<typeof publicImagesSchema>;
export type PagesType = z.infer<typeof publicPagesSchema>;
export type Scrape_jobsType = z.infer<typeof publicScrape_jobsSchema>;
export type TasksType = z.infer<typeof publicTasksSchema>;

// Database type for reference
export type SupabaseDatabase = Database;
