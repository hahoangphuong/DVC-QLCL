import { useQuery } from "@tanstack/react-query";
import type { LookupTinhTrang, LookupThuTuc, TraCuuDangXuLyData, TraCuuDaXuLyData } from "./lookupShared";

type LookupQueryParams = {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
};

export function useLookupQuery<TData extends TraCuuDangXuLyData | TraCuuDaXuLyData>(args: {
  queryKey: string;
  params: LookupQueryParams;
  fetcher: (params: LookupQueryParams & { signal?: AbortSignal }) => Promise<TData>;
  enabled: boolean;
}) {
  const { queryKey, params, fetcher, enabled } = args;
  const { thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo } = params;

  return useQuery({
    queryKey: [queryKey, thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo],
    queryFn: ({ signal }) => fetcher({ ...params, signal }),
    enabled,
    placeholderData: (previousData) => previousData,
    retry: 2,
  });
}
