export type SepTask = {
  taskId: string;
  status: string;
  statusMessage?: string | null;
  createdAt?: string | null;
  lastUpdatedAt?: string | null;
  ttl?: number;
  pollInterval?: number;
};

export type TasksGetResult = { task: SepTask };

export type TasksListResult = {
  items: Array<Record<string, unknown>>;
  limit: number;
  offset: number;
};

export type TasksCancelResult = { taskId: string; action: "cancelled" };

export type TasksResultWithResult = {
  taskId: string;
  status: string;
  result: unknown;
  ttl?: number;
};

export type TasksResultWithLogs = {
  taskId: string;
  status: string;
  logs: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
  ttl?: number;
};

export type TasksResultResponse = TasksResultWithResult | TasksResultWithLogs;
