export function isoToDisplay(iso: string | null): string {
  if (!iso) return "";
  const d = iso.split("T")[0];
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}
