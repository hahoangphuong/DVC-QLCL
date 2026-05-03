import type { LookupThuTuc } from "./lookupShared";
import { useCallback, useState } from "react";

export type LookupDetailSelection = {
  thuTuc: LookupThuTuc;
  hoSoId: number;
  maHoSo: string;
};

export function useLookupDetailModal() {
  const [selectedDetail, setSelectedDetail] = useState<LookupDetailSelection | null>(null);

  const openDetail = useCallback((thuTuc: LookupThuTuc, hoSoId: number, maHoSo: string) => {
    setSelectedDetail({ thuTuc, hoSoId, maHoSo });
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedDetail(null);
  }, []);

  return {
    selectedDetail,
    openDetail,
    closeDetail,
  };
}
