import { useMemo } from "react";
import {
  type TraCuuDangXuLyRow,
  type TraCuuSortKey,
  displayLookupCg,
  displayLookupCv,
  LOOKUP_TINH_TRANG_SORT_ORDER,
} from "./lookupShared";

export function useLookupSortedRows(
  rows: TraCuuDangXuLyRow[] | undefined,
  sortBy: TraCuuSortKey,
  sortDir: "asc" | "desc",
) {
  return useMemo(() => {
    const nextRows = [...(rows ?? [])];
    if (sortBy === "stt") {
      return sortDir === "asc" ? nextRows : nextRows.reverse();
    }

    const getValue = (row: TraCuuDangXuLyRow) => {
      switch (sortBy) {
        case "ma_ho_so":
          return row.ma_ho_so;
        case "ngay_tiep_nhan":
          return row.ngay_tiep_nhan ?? "";
        case "ngay_hen_tra":
          return row.ngay_hen_tra ?? "";
        case "loai_ho_so":
          return row.loai_ho_so ?? "";
        case "submission_kind":
          return row.submission_kind === "first" ? "0" : row.submission_kind === "supplement" ? "1" : "2";
        case "tinh_trang":
          return LOOKUP_TINH_TRANG_SORT_ORDER[row.tinh_trang] ?? Number.MAX_SAFE_INTEGER;
        case "chuyen_vien":
          return displayLookupCv(row.chuyen_vien);
        case "chuyen_gia":
          return displayLookupCg(row.chuyen_gia);
        case "thoi_gian_cho_ngay":
          return row.thoi_gian_cho_ngay;
        case "stt":
          return 0;
      }
    };

    nextRows.sort((left, right) => {
      const a = getValue(left);
      const b = getValue(right);
      let result = 0;
      if (typeof a === "number" && typeof b === "number") {
        result = a - b;
      } else {
        result = String(a).localeCompare(String(b), "vi", { numeric: true, sensitivity: "base" });
      }
      if (result === 0) {
        result = left.ma_ho_so.localeCompare(right.ma_ho_so, "vi", { numeric: true, sensitivity: "base" });
      }
      return sortDir === "asc" ? result : -result;
    });
    return nextRows;
  }, [rows, sortBy, sortDir]);
}
