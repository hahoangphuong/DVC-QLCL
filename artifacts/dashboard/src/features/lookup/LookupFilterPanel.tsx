import { LOOKUP_TEXT } from "../../uiText";
import { LookupActionBar } from "./LookupActionBar";
import { LookupSelectField } from "./LookupSelectField";
import { LookupTextFilterField } from "./LookupTextFilterField";
import {
  displayLookupCg,
  displayLookupCv,
  type LookupThuTuc,
  type LookupTinhTrang,
  type LookupTinhTrangOptionGroup,
} from "./lookupShared";

type LookupFilterPanelProps = {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  chuyenVienOptions: string[];
  chuyenGiaOptions: string[];
  tinhTrangOptionGroups: LookupTinhTrangOptionGroup[];
  onThuTucChange: (value: LookupThuTuc | "all") => void;
  onChuyenVienChange: (value: string) => void;
  onChuyenGiaChange: (value: string) => void;
  onTinhTrangChange: (value: LookupTinhTrang | "all") => void;
  onMaHoSoChange: (value: string) => void;
  onReset: () => void;
  onExport: () => void | Promise<void>;
  exporting: boolean;
  isFetching: boolean;
  hasData: boolean;
  rowCount: number;
};

export function LookupFilterPanel({
  thuTuc,
  chuyenVien,
  chuyenGia,
  tinhTrang,
  maHoSo,
  chuyenVienOptions,
  chuyenGiaOptions,
  tinhTrangOptionGroups,
  onThuTucChange,
  onChuyenVienChange,
  onChuyenGiaChange,
  onTinhTrangChange,
  onMaHoSoChange,
  onReset,
  onExport,
  exporting,
  isFetching,
  hasData,
  rowCount,
}: LookupFilterPanelProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap gap-4 items-end">
        <LookupSelectField label={"Chuy\u00ean vi\u00ean"} value={chuyenVien} onChange={onChuyenVienChange}>
          <option value="">{LOOKUP_TEXT.all}</option>
          {chuyenVienOptions.map((option) => (
            <option key={option} value={option}>{displayLookupCv(option)}</option>
          ))}
        </LookupSelectField>

        <LookupSelectField label={"Chuy\u00ean gia"} value={chuyenGia} onChange={onChuyenGiaChange}>
          <option value="">{LOOKUP_TEXT.all}</option>
          {chuyenGiaOptions.map((option) => (
            <option key={option} value={option}>{displayLookupCg(option)}</option>
          ))}
        </LookupSelectField>

        <LookupSelectField
          label={"Th\u1ee7 t\u1ee5c"}
          value={String(thuTuc)}
          onChange={(value) => onThuTucChange(value === "all" ? "all" : Number(value) as LookupThuTuc)}
        >
          <option value="all">{LOOKUP_TEXT.all}</option>
          <option value="48">TT48</option>
          <option value="47">TT47</option>
          <option value="46">TT46</option>
        </LookupSelectField>

        <LookupSelectField
          label={"T\u00ecnh tr\u1ea1ng"}
          value={tinhTrang}
          onChange={(value) => onTinhTrangChange(value as LookupTinhTrang | "all")}
        >
          <option value="all">{LOOKUP_TEXT.all}</option>
          {tinhTrangOptionGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </optgroup>
          ))}
        </LookupSelectField>

        <LookupTextFilterField value={maHoSo} onChange={onMaHoSoChange} />

        <LookupActionBar
          onReset={onReset}
          onExport={onExport}
          exporting={exporting}
          isFetching={isFetching}
          hasData={hasData}
          rowCount={rowCount}
        />
      </div>
    </div>
  );
}
