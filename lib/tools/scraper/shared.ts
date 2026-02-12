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

// Reusable progress bar function
export function createProgressBar(
  current: number,
  total: number,
  width: number = 20,
): string {
  const filledBars = Math.round((current / total) * width);
  const emptyBars = width - filledBars;
  const progressBar = "█".repeat(filledBars) + "░".repeat(emptyBars);
  return `[${progressBar}]`;
}
