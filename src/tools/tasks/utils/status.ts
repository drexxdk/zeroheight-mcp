export function mapStatusToSep({ status }: { status: string }) {
  if (status === "running") return "working";
  return status;
}
