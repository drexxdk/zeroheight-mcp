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
} from "../../common/progress";
export type { Progress } from "../../common/progress";
