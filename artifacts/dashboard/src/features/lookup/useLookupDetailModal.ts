import { useCallback, useState } from "react";

export type LookupDetailSelection = {
  hoSoId: number;
  maHoSo: string;
};

export function useLookupDetailModal() {
  const [selectedDetail, setSelectedDetail] = useState<LookupDetailSelection | null>(null);

  const openDetail = useCallback((hoSoId: number, maHoSo: string) => {
    setSelectedDetail({ hoSoId, maHoSo });
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
