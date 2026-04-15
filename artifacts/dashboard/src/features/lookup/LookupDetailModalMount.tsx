import { LookupHoSoDetailModal } from "./LookupHoSoDetailModal";
import type { LookupDetailSelection } from "./useLookupDetailModal";

export function LookupDetailModalMount({
  selectedDetail,
  onClose,
}: {
  selectedDetail: LookupDetailSelection | null;
  onClose: () => void;
}) {
  if (!selectedDetail) return null;
  return (
    <LookupHoSoDetailModal
      hoSoId={selectedDetail.hoSoId}
      maHoSo={selectedDetail.maHoSo}
      onClose={onClose}
    />
  );
}
