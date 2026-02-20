export function mapStatusToSep({ status }: { status: string }): string {
  if (status === "running") return "working";
  return status;
}
