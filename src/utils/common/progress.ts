export type Progress = {
  current: number;
  total: number;
  pagesProcessed?: number;
  imagesProcessed?: number;
};

export function createProgressBar({
  current,
  total,
  width = 20,
}: {
  current: number;
  total: number;
  width?: number;
}): string {
  // Guard against division by zero
  const safeTotal = total <= 0 ? 1 : total;
  const filledBars = Math.min(Math.round((current / safeTotal) * width), width);
  const emptyBars = width - filledBars;
  const progressBar = "█".repeat(filledBars) + "░".repeat(emptyBars);
  return `[${progressBar}]`;
}

export function createProgressHelpers(options: {
  progress: Progress;
  checkProgressInvariant: (opts: {
    overallProgress: Progress;
    context?: string;
  }) => void;
  logger?: (msg: string) => void;
}): {
  logProgress: (icon: string, message: string) => void;
  markAttempt: (reason: string, icon: string, message: string) => void;
} {
  const { progress, checkProgressInvariant, logger } = options;
  const out = logger ?? ((msg: string) => console.log(msg));

  function logProgress(icon: string, message: string): void {
    const progressBar = createProgressBar({
      current: progress.current,
      total: progress.total,
    });
    out(
      `${progressBar} [${progress.current}/${progress.total}] ${icon} ${message}`,
    );
  }

  function markAttempt(reason: string, icon: string, message: string): void {
    progress.current++;
    checkProgressInvariant({ overallProgress: progress, context: reason });
    logProgress(icon, message);
  }

  return { logProgress, markAttempt };
}
