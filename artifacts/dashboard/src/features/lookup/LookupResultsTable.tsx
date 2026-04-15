import { LookupSortableHeader } from "./LookupSortableHeader";
import {
  displayLookupCg,
  displayLookupCv,
  displayLookupTinhTrang,
  displaySubmissionKind,
  extractHoSoId,
  isoToDisplay,
  type TraCuuDangXuLyRow,
  type TraCuuSortKey,
} from "./lookupShared";

type LookupResultsTableProps = {
  data: { rows: TraCuuDangXuLyRow[] } | undefined;
  sortedRows: TraCuuDangXuLyRow[];
  isError: boolean;
  errorMessage: string;
  sortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
  onToggleSort: (key: TraCuuSortKey) => void;
  dateReceivedLabel: string;
  secondDateLabel: string;
  durationLabel: string;
  loadingMessage: string;
  emptyMessage: string;
  onOpenDetail: (hoSoId: number, maHoSo: string) => void;
};

export function LookupResultsTable({
  data,
  sortedRows,
  isError,
  errorMessage,
  sortBy,
  sortDir,
  onToggleSort,
  dateReceivedLabel,
  secondDateLabel,
  durationLabel,
  loadingMessage,
  emptyMessage,
  onOpenDetail,
}: LookupResultsTableProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {isError ? (
        <div className="px-4 py-10 text-center text-sm text-red-500">{errorMessage}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: 1220, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 110 }} />
              <col />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="px-3 py-3 text-center font-semibold uppercase tracking-wide whitespace-nowrap">STT</th>
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"M\u00e3 h\u1ed3 s\u01a1"} sortKey="ma_ho_so" />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={dateReceivedLabel} sortKey="ngay_tiep_nhan" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={secondDateLabel} sortKey="ngay_hen_tra" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"L\u1ea7n n\u1ed9p"} sortKey="submission_kind" />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"Lo\u1ea1i h\u1ed3 s\u01a1"} sortKey="loai_ho_so" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"Chuy\u00ean vi\u00ean"} sortKey="chuyen_vien" />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"Chuy\u00ean gia"} sortKey="chuyen_gia" />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={durationLabel} sortKey="thoi_gian_cho_ngay" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"T\u00ecnh tr\u1ea1ng"} sortKey="tinh_trang" />
                <th className="px-3 py-3 text-center font-semibold tracking-wide whitespace-nowrap">{"Th\u00f4ng tin h\u1ed3 s\u01a1"}</th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">{loadingMessage}</td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">{emptyMessage}</td>
                </tr>
              ) : sortedRows.map((row, index) => {
                const hoSoId = row.thu_tuc === 48 ? extractHoSoId(row.ma_ho_so) : null;
                return (
                  <tr key={`${row.thu_tuc}-${row.ma_ho_so}-${index}`} className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50"} group hover:bg-blue-50`}>
                    <td className="px-3 py-2.5 text-center text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{row.ma_ho_so}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_tiep_nhan)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_hen_tra)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displaySubmissionKind(row.submission_kind)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700">{row.loai_ho_so || ""}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCv(row.chuyen_vien)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCg(row.chuyen_gia)}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap">
                      {row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ng\u00e0y` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 font-medium">{displayLookupTinhTrang(row.tinh_trang)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (hoSoId) onOpenDetail(hoSoId, row.ma_ho_so);
                        }}
                        disabled={hoSoId === null}
                        className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {"Chi ti\u1ebft"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
