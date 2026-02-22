export interface PageData {
  id: number;
  title: string;
  url: string;
  content: string | null;
  images: Array<{
    original_url: string;
    storage_path: string;
  }> | null;
}
export { createProgressBar } from "@/utils/common/progress";
export type { Progress } from "@/utils/common/progress";
