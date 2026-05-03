import {
  LookupHoSoDetailModal,
  type LookupHoSoDetailModalProps,
} from "./LookupHoSoDetailModal";
import type { LookupDetailSelection } from "./useLookupDetailModal";

export function LookupDetailModalMount({
  selectedDetail,
  onClose,
}: Pick<LookupHoSoDetailModalProps, "onClose"> & {
  selectedDetail: LookupDetailSelection | null;
}) {
  if (!selectedDetail) return null;
  return (
    <LookupHoSoDetailModal
      thuTuc={selectedDetail.thuTuc}
      hoSoId={selectedDetail.hoSoId}
      maHoSo={selectedDetail.maHoSo}
      onClose={onClose}
    />
  );
}
