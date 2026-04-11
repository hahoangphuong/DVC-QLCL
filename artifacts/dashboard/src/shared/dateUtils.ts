export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function toDMY(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export function parseDMY(dmyStr: string): string {
  const parts = dmyStr.replace(/\s/g, "").split("/");
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return "";
}

export function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

export function clampToToday(ymd: string): string {
  if (!ymd) return ymd;
  return minYmd(ymd, toYMD(new Date()));
}

export function getPreset(key: string): { from: string; to: string } {
  const now = new Date();
  const today = toYMD(now);
  const y = now.getFullYear();
  const m = now.getMonth();

  if (key === "thang_nay") {
    return { from: toYMD(new Date(y, m, 1)), to: minYmd(toYMD(new Date(y, m + 1, 0)), today) };
  }
  if (key === "nam_nay") {
    return { from: toYMD(new Date(y, 0, 1)), to: minYmd(toYMD(new Date(y, 11, 31)), today) };
  }
  if (key === "12_thang") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 11);
    return { from: toYMD(new Date(d.getFullYear(), d.getMonth(), 1)), to: minYmd(toYMD(new Date(y, m + 1, 0)), today) };
  }
  if (key === "6_thang") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 5);
    return { from: toYMD(new Date(d.getFullYear(), d.getMonth(), 1)), to: minYmd(toYMD(new Date(y, m + 1, 0)), today) };
  }
  if (key === "3_thang") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 2);
    return { from: toYMD(new Date(d.getFullYear(), d.getMonth(), 1)), to: minYmd(toYMD(new Date(y, m + 1, 0)), today) };
  }
  return { from: toYMD(new Date(y, 0, 1)), to: today };
}
