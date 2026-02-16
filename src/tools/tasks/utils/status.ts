export function mapStatusToSep(status: string) {
  if (status === "running") return "working";
  return status;
}
