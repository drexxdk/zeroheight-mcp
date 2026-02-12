import { z } from 'zod';
import type { Database } from './database.schema';

// Auto-generated Zod schemas based on database.schema.ts

export const publicImagesSchema = z.object({
  id: z.number(),
  // Could not parse table schema
});

export const publicPagesSchema = z.object({
  id: z.number(),
  // Could not parse table schema
});

// Export inferred types
export type ImagesType = z.infer<typeof publicImagesSchema>;
export type PagesType = z.infer<typeof publicPagesSchema>;

// Database type for reference
export type SupabaseDatabase = Database;
