import { LookupSortableHeader } from "./LookupSortableHeader";
import {
  displayLookupCg,
  displayLookupCv,
  displayLookupTinhTrang,
  displaySubmissionKind,
  extractHoSoId,
  isoToDisplay,
  type LookupThuTuc,
  type TraCuuDangXuLyRow,
  type TraCuuSortKey,
} from "./lookupShared";

type LookupResultsTableProps = {
  data: { rows: TraCuuDangXuLyRow[] } | undefined;
  sortedRows: TraCuuDangXuLyRow[];
  isError: boolean;
  errorMessage: string;
  selectedThuTuc: LookupThuTuc | "all";
  sortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
  onToggleSort: (key: TraCuuSortKey) => void;
  secondDateLabel: string;
  durationLabel: string;
  loadingMessage: string;
  emptyMessage: string;
  onOpenDetail: (thuTuc: LookupThuTuc, hoSoId: number, maHoSo: string) => void;
};

export function LookupResultsTable({
  data,
  sortedRows,
  isError,
  errorMessage,
  selectedThuTuc,
  sortBy,
  sortDir,
  onToggleSort,
  secondDateLabel,
  durationLabel,
  loadingMessage,
  emptyMessage,
  onOpenDetail,
}: LookupResultsTableProps) {
  const hideChuyenGiaColumn = selectedThuTuc === 46 || selectedThuTuc === 47;
  const loaiHoSoWidth = hideChuyenGiaColumn ? 117 : 78;
  const totalColumns = hideChuyenGiaColumn ? 11 : 12;

  const renderCoSoCell = (row: TraCuuDangXuLyRow) => {
    if (row.thu_tuc === 48) {
      return (
        <div className="space-y-1 text-left">
          <div className="leading-tight">
            <span className="font-semibold text-slate-500">CSĐK:</span>{" "}
            <span className="text-slate-700">{row.co_so_dang_ky ?? ""}</span>
          </div>
          <div className="leading-tight">
            <span className="font-semibold text-slate-500">CSSX:</span>{" "}
            <span className="text-slate-700">{row.co_so_san_xuat ?? ""}</span>
          </div>
        </div>
      );
    }

    return <div className="text-left leading-tight text-slate-700">{row.co_so_dang_ky ?? ""}</div>;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {isError ? (
        <div className="px-4 py-10 text-center text-sm text-red-500">{errorMessage}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: 1240, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 74 }} />
              <col style={{ width: loaiHoSoWidth }} />
              <col style={{ width: 156 }} />
              {!hideChuyenGiaColumn ? <col style={{ width: 156 }} /> : null}
              <col style={{ width: 84 }} />
              <col style={{ width: 118 }} />
              <col style={{ width: 54 }} />
              <col />
            </colgroup>
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="px-3 py-3 text-center font-semibold uppercase tracking-wide whitespace-nowrap">STT</th>
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"M\u00e3 h\u1ed3 s\u01a1"} sortKey="ma_ho_so" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"Ng\u00e0y nh\u1eadn"} sortKey="ngay_tiep_nhan" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={secondDateLabel} sortKey="ngay_hen_tra" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"L\u1ea7n n\u1ed9p"} sortKey="submission_kind" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"Lo\u1ea1i h\u1ed3 s\u01a1"} sortKey="loai_ho_so" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"Chuy\u00ean vi\u00ean"} sortKey="chuyen_vien" />
                {!hideChuyenGiaColumn ? (
                  <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"Chuy\u00ean gia"} sortKey="chuyen_gia" />
                ) : null}
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={durationLabel} sortKey="thoi_gian_cho_ngay" center />
                <LookupSortableHeader currentSortBy={sortBy} sortDir={sortDir} onToggle={onToggleSort} label={"T\u00ecnh tr\u1ea1ng"} sortKey="tinh_trang" />
                <th className="px-3 py-3 text-center font-semibold tracking-wide whitespace-nowrap">...</th>
                <th className="px-3 py-3 text-left font-semibold tracking-wide whitespace-nowrap">{"C\u01a1 s\u1edf"}</th>
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr>
                  <td colSpan={totalColumns} className="px-4 py-10 text-center text-sm text-slate-400">{loadingMessage}</td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={totalColumns} className="px-4 py-10 text-center text-sm text-slate-400">{emptyMessage}</td>
                </tr>
              ) : sortedRows.map((row, index) => {
                const hoSoId = extractHoSoId(row.ma_ho_so, row.thu_tuc);
                return (
                  <tr key={`${row.thu_tuc}-${row.ma_ho_so}-${index}`} className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50"} group hover:bg-blue-50`}>
                    <td className="px-3 py-2.5 text-center text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700 whitespace-nowrap">{row.ma_ho_so}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_tiep_nhan)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_hen_tra)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700">{displaySubmissionKind(row.submission_kind)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700">{row.loai_ho_so || ""}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCv(row.chuyen_vien)}</td>
                    {!hideChuyenGiaColumn ? (
                      <td className="px-3 py-2.5 text-slate-700">{displayLookupCg(row.chuyen_gia)}</td>
                    ) : null}
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap">
                      {row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ng\u00e0y` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">{displayLookupTinhTrang(row.tinh_trang)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (hoSoId) onOpenDetail(row.thu_tuc, hoSoId, row.ma_ho_so);
                        }}
                        disabled={hoSoId === null}
                        className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {"Chi ti\u1ebft"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 align-middle">{renderCoSoCell(row)}</td>
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
