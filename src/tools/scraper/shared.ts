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
export {
  createProgressBar,
  createProgressHelpers,
} from "@/lib/common/progress";
export type { Progress } from "@/lib/common/progress";
