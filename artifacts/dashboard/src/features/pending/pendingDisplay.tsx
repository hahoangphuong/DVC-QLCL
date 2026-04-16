export function Num({ v, color, bold }: { v: number | null | undefined; color?: string; bold?: boolean }) {
  if (v === null || v === undefined) return <span className="text-slate-300">—</span>;
  if (v === 0) return <span />;
  return (
    <span className={bold ? "font-bold" : "font-medium"} style={{ color: color ?? "#374151" }}>
      {v.toLocaleString("vi-VN")}
    </span>
  );
}

export function Pct({ v, warnBelow }: { v: number; warnBelow?: number }) {
  const color = warnBelow !== undefined && v < warnBelow ? "#ef4444" : "#15803d";
  return <span className="font-bold text-xs" style={{ color }}>{v}%</span>;
}

export function sumNumericField<T extends object>(rows: T[], key: keyof T): number {
  return rows.reduce((sum, row) => {
    const value = row[key];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}
