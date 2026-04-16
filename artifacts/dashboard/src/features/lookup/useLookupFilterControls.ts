import { useCallback } from "react";
import type {
  LookupTinhTrang,
  LookupThuTuc,
  TraCuuFilterStateSetter,
} from "./lookupShared";

export function useLookupFilterControls(
  setState: TraCuuFilterStateSetter,
) {
  const setChuyenVien = useCallback((value: string) => {
    setState((prev) => ({ ...prev, chuyenVien: value }));
  }, [setState]);

  const setChuyenGia = useCallback((value: string) => {
    setState((prev) => ({ ...prev, chuyenGia: value }));
  }, [setState]);

  const setThuTuc = useCallback((value: LookupThuTuc | "all") => {
    setState((prev) => ({ ...prev, thuTuc: value }));
  }, [setState]);

  const setTinhTrang = useCallback((value: LookupTinhTrang | "all") => {
    setState((prev) => ({ ...prev, tinhTrang: value }));
  }, [setState]);

  const setMaHoSo = useCallback((value: string) => {
    setState((prev) => ({ ...prev, maHoSo: value }));
  }, [setState]);

  return {
    setChuyenVien,
    setChuyenGia,
    setThuTuc,
    setTinhTrang,
    setMaHoSo,
  };
}
