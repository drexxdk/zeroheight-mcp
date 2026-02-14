export type Progress = {
  current: number;
  total: number;
  pagesProcessed?: number;
  imagesProcessed?: number;
};

export function createProgressBar(
  current: number,
  total: number,
  width: number = 20,
): string {
  // Guard against division by zero
  const safeTotal = total <= 0 ? 1 : total;
  const filledBars = Math.min(Math.round((current / safeTotal) * width), width);
  const emptyBars = width - filledBars;
  const progressBar = "█".repeat(filledBars) + "░".repeat(emptyBars);
  return `[${progressBar}]`;
}

export function createProgressHelpers(
  progress: Progress,
  checkProgressInvariant: (p: Progress, reason: string) => void,
  logger?: (msg: string) => void,
) {
  const out = logger ?? ((msg: string) => console.log(msg));

  function logProgress(icon: string, message: string) {
    const progressBar = createProgressBar(progress.current, progress.total);
    out(
      `${progressBar} [${progress.current}/${progress.total}] ${icon} ${message}`,
    );
  }

  function markAttempt(reason: string, icon: string, message: string) {
    progress.current++;
    checkProgressInvariant(progress, reason);
    logProgress(icon, message);
  }

  return { logProgress, markAttempt } as const;
}
