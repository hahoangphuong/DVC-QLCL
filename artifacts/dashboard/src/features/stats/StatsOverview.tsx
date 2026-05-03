import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { clampToToday, getPreset, parseDMY, toDMY, toYMD } from "../../shared/dateUtils";
import {
  COLORS,
  QUICK_FILTERS,
  fetchEarliestDate,
  fetchGiaiQuyet,
  fetchSummary,
  fetchTonSau,
  type SupportedThuTuc,
  type TabFilter,
} from "./statsShared";
import { DonutChart, SummaryBarChart, type BarData, type DonutSegment } from "./StatsCharts";

export function ThongKeDateFilterPanel({
  thuTuc,
  fromDate,
  toDate,
  fromInput,
  toInput,
  activePreset,
  loadingAll,
  update,
}: {
  thuTuc: number;
  fromDate: string;
  toDate: string;
  fromInput: string;
  toInput: string;
  activePreset: string;
  loadingAll: boolean;
  update: (patch: Partial<TabFilter>) => void;
}) {
  const applyDates = useCallback((from: string, to: string, preset?: string) => {
    const clampedTo = clampToToday(to);
    update({ fromDate: from, toDate: clampedTo, fromInput: toDMY(from), toInput: toDMY(clampedTo), activePreset: preset ?? "" });
  }, [update]);

  const handleTatCa = useCallback(async () => {
    update({ loadingAll: true });
    try {
      const earliest = thuTuc === 0
        ? (await Promise.all([fetchEarliestDate(48), fetchEarliestDate(47), fetchEarliestDate(46)])).sort()[0]
        : await fetchEarliestDate(thuTuc);
      const today = toYMD(new Date());
      applyDates(earliest, today, "tat_ca");
    } finally {
      update({ loadingAll: false });
    }
  }, [applyDates, thuTuc, update]);

  const handleFromBlur = () => {
    const parsed = parseDMY(fromInput);
    if (parsed) update({ fromDate: parsed, activePreset: "" });
    else update({ fromInput: toDMY(fromDate) });
  };

  const handleToBlur = () => {
    const parsed = parseDMY(toInput);
    if (parsed) {
      const clamped = clampToToday(parsed);
      update({ toDate: clamped, toInput: toDMY(clamped), activePreset: "" });
    } else {
      update({ toInput: toDMY(toDate) });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{"T\u1eeb"}</label>
            <input type="text" placeholder="DD/MM/YYYY" value={fromInput} onChange={(e) => update({ fromInput: e.target.value })} onBlur={handleFromBlur} className="w-36 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
          </div>
          <div className="pb-2 text-slate-400 font-semibold">{"\u2014"}</div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{"\u0110\u1ebfn"}</label>
            <input type="text" placeholder="DD/MM/YYYY" value={toInput} onChange={(e) => update({ toInput: e.target.value })} onBlur={handleToBlur} className="w-36 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={handleTatCa} disabled={loadingAll} className={["rounded-lg px-3 py-2 text-xs font-semibold transition-all border", activePreset === "tat_ca" ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-600 border-slate-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700", loadingAll ? "opacity-60 cursor-wait" : ""].join(" ")}>
            {loadingAll ? "..." : "T\u1ea5t c\u1ea3"}
          </button>
          {QUICK_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                const p = getPreset(key);
                applyDates(p.from, p.to, key);
              }}
              className={["rounded-lg px-3 py-2 text-xs font-semibold transition-all border", activePreset === key ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-600 border-slate-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700"].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-slate-500 font-medium hidden lg:block">
          {"K\u1ef3 th\u1ed1ng k\u00ea: "}
          <span className="text-slate-800 font-bold">{toDMY(fromDate)}</span>
          {" \u2192 "}
          <span className="text-slate-800 font-bold">{toDMY(toDate)}</span>
        </div>
      </div>
    </div>
  );
}

export function ThongKeOverviewCharts({ thuTuc, fromDate, toDate }: {
  thuTuc: SupportedThuTuc;
  fromDate: string;
  toDate: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["summary", thuTuc, fromDate, toDate],
    queryFn: () => fetchSummary(thuTuc, fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const { data: gqData, isLoading: gqLoading, isError: gqError } = useQuery({
    queryKey: ["giai-quyet", thuTuc, fromDate, toDate],
    queryFn: () => fetchGiaiQuyet(thuTuc, fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const { data: tsData, isLoading: tsLoading, isError: tsError } = useQuery({
    queryKey: ["ton-sau", thuTuc, toDate],
    queryFn: () => fetchTonSau(thuTuc, toDate),
    enabled: !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const barData: BarData[] = [
    { name: "T\u1ed2N TR\u01af\u1edaC", value: data?.ton_truoc ?? 0, color: COLORS.ton_truoc.bar },
    { name: "\u0110\u00c3 NH\u1eacN", value: data?.da_nhan ?? 0, color: COLORS.da_nhan.bar },
    { name: "\u0110\u00c3 GI\u1ea2I QUY\u1ebeT", value: data?.da_giai_quyet ?? 0, color: COLORS.da_giai_quyet.bar },
    { name: "T\u1ed2N SAU", value: data?.ton_sau ?? 0, color: COLORS.ton_sau.bar },
  ];
  const giaiQuyetRatioTotal = (data?.da_giai_quyet ?? 0) + (data?.ton_sau ?? 0);
  const ttLabel = `TT${thuTuc}`;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "3.7fr 2.1fr 2.1fr 2.1fr" }}>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="relative flex items-center justify-center mb-1">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide text-center">{`T\u00ccNH TR\u1ea0NG H\u1ed2 S\u01a0 ${ttLabel}`}</h3>
          {isLoading && <span className="text-xs text-blue-500 animate-pulse font-medium absolute right-0">{"\u0110ang t\u1ea3i..."}</span>}
          {isError && <span className="text-xs text-red-500 font-medium absolute right-0">{"L\u1ed7i t\u1ea3i d\u1eef li\u1ec7u"}</span>}
        </div>

        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <SummaryBarChart data={barData} />
        )}
      </div>

      <DonutChart
        title={"T\u1ef6 L\u1ec6 GI\u1ea2I QUY\u1ebeT"}
        total={giaiQuyetRatioTotal}
        segments={[
          { name: "\u0110\u00e3 gi\u1ea3i quy\u1ebft", value: data?.da_giai_quyet ?? 0, color: "#22c55e" },
          { name: "T\u1ed3n trong k\u1ef3", value: data?.ton_sau ?? 0, color: "#f59e0b" },
        ]}
        isLoading={isLoading}
        isError={isError}
        emptyMessage={"Kh\u00f4ng c\u00f3 h\u1ed3 s\u01a1 trong k\u1ef3 th\u1ed1ng k\u00ea"}
        spinnerColor="#22c55e"
        startAngle={270}
        endAngle={-90}
      />

      <DonutChart
        title={"\u0110\u00c3 GI\u1ea2I QUY\u1ebeT / H\u1ea0N"}
        total={gqData?.total ?? 0}
        segments={[
          { name: "\u0110\u00fang h\u1ea1n", value: gqData?.dung_han ?? 0, color: "#22c55e" },
          { name: "Qu\u00e1 h\u1ea1n", value: gqData?.qua_han ?? 0, color: "#ef4444" },
        ]}
        isLoading={gqLoading}
        isError={gqError}
        emptyMessage={"Kh\u00f4ng c\u00f3 h\u1ed3 s\u01a1 \u0111\u00e3 gi\u1ea3i quy\u1ebft trong k\u1ef3"}
        spinnerColor="#22c55e"
      />

      <DonutChart
        title={"T\u1ed2N SAU / H\u1ea0N"}
        total={tsData?.total ?? 0}
        segments={[
          { name: "C\u00f2n h\u1ea1n", value: tsData?.con_han ?? 0, color: "#60a5fa" },
          { name: "Qu\u00e1 h\u1ea1n", value: tsData?.qua_han ?? 0, color: "#f97316" },
        ]}
        isLoading={tsLoading}
        isError={tsError}
        emptyMessage={"Kh\u00f4ng c\u00f3 h\u1ed3 s\u01a1 t\u1ed3n sau trong k\u1ef3"}
        spinnerColor="#60a5fa"
      />
    </div>
  );
}
