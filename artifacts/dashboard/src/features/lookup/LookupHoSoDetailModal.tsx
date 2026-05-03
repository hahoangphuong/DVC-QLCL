import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DOSSIER_DETAIL_TEXT } from "../../uiText";
import { buildDavViewFileUrl, fetchDavHoSoDetail, isoToDisplay, type LookupThuTuc } from "./lookupShared";

export type LookupHoSoDetailModalProps = {
  thuTuc: LookupThuTuc;
  hoSoId: number;
  maHoSo: string;
  onClose: VoidFunction;
};

export function LookupHoSoDetailModal({
  thuTuc,
  hoSoId,
  maHoSo,
  onClose,
}: LookupHoSoDetailModalProps) {
  const [infoTab, setInfoTab] = useState<"co_so" | "doanh_nghiep">("co_so");
  const [attachmentTab, setAttachmentTab] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dav-ho-so-detail", thuTuc, hoSoId],
    queryFn: () => fetchDavHoSoDetail(thuTuc, hoSoId),
    retry: 1,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hoSo = data?.view.hoSo ?? {};
  const donHang = data?.view.parsedJsonDonHang ?? {};
  const attachmentBundles = useMemo(() => {
    const seenAcrossBundles = new Set<string>();
    return (data?.view.listTepHoSo ?? [])
      .map((bundle, index) => {
        const files = (bundle.danhSachTepDinhKem ?? [])
          .filter((file): file is Record<string, unknown> => !!file)
          .filter((file) => {
            const key = `${String(file.tenTep ?? "")}||${String(file.duongDanTep ?? "")}`;
            if (seenAcrossBundles.has(key)) return false;
            seenAcrossBundles.add(key);
            return true;
          });
        const label = typeof bundle.moTaTep === "string" && bundle.moTaTep.trim()
          ? bundle.moTaTep.trim()
          : typeof bundle.lanBoSung === "number" && bundle.lanBoSung > 0
            ? `L\u1ea7n b\u1ed5 sung ${bundle.lanBoSung}`
            : "L\u1ea7n \u0111\u1ea7u";
        return {
          key: `${bundle.lanBoSung ?? "null"}-${index}`,
          label,
          files,
        };
      })
      .filter((bundle) => bundle.files.length > 0);
  }, [data?.view.listTepHoSo]);
  const lichSu = data?.history.listYKien ?? [];
  const giayBaoThuUrl = buildDavViewFileUrl(data?.view.urlGiayBaoThu);
  const banDangKyUrl = buildDavViewFileUrl(data?.view.urlBanDangKy);
  const activeAttachmentBundle = attachmentBundles.find((bundle) => bundle.key === attachmentTab) ?? attachmentBundles[0] ?? null;

  useEffect(() => {
    setAttachmentTab((prev) =>
      attachmentBundles.some((bundle) => bundle.key === prev) ? prev : (attachmentBundles[0]?.key ?? ""),
    );
  }, [attachmentBundles]);

  useEffect(() => {
    setInfoTab("co_so");
  }, [thuTuc, hoSoId]);

  const renderValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "\u2014";
    return String(value);
  };

  const topCards: Array<[string, unknown]> = [
    ["M\u00e3 h\u1ed3 s\u01a1", hoSo["maHoSo"]],
    ["H\u00ecnh th\u1ee9c \u0111\u00e1nh gi\u00e1", donHang["hinhThucDanhGia"]],
    [
      "Ng\u00e0y n\u1ed9p",
      isoToDisplay(typeof hoSo["ngayDoanhNghiepNopHoSo"] === "string" ? hoSo["ngayDoanhNghiepNopHoSo"] : null),
    ],
    [
      "Ng\u00e0y ti\u1ebfp nh\u1eadn",
      isoToDisplay(typeof hoSo["ngayTiepNhan"] === "string" ? hoSo["ngayTiepNhan"] : null),
    ],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 bg-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-white">{DOSSIER_DETAIL_TEXT.title}</h2>
            <p className="mt-1 text-sm text-slate-300">{maHoSo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xl font-bold leading-none text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            {"\u00d7"}
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex h-56 items-center justify-center gap-3 text-sm text-slate-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              {DOSSIER_DETAIL_TEXT.loading}
            </div>
          ) : isError || !data ? (
            <div className="flex h-56 items-center justify-center text-sm text-red-500">
              {DOSSIER_DETAIL_TEXT.loadError}
            </div>
          ) : (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {topCards.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                    <div className="mt-2 text-sm font-medium text-slate-800">{renderValue(value)}</div>
                  </div>
                ))}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
                  {[
                    { key: "co_so" as const, label: DOSSIER_DETAIL_TEXT.infoTabs.coSo },
                    { key: "doanh_nghiep" as const, label: DOSSIER_DETAIL_TEXT.infoTabs.doanhNghiep },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setInfoTab(tab.key)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                        infoTab === tab.key
                          ? "bg-blue-600 text-white"
                          : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {infoTab === "co_so" ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      {thuTuc === 48 ? (
                        <>
                          <div>
                            <div className="text-xs font-semibold text-slate-500">IDCT</div>
                            <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["idCongTy"])}</div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.country}</div>
                            <div className="mt-1 text-sm text-slate-700">{renderValue(donHang["nuocSoTai"])}</div>
                          </div>
                        </>
                      ) : null}
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.facilityName}</div>
                        <div className="mt-1 text-sm text-slate-700">{renderValue(donHang["tenCoSoSanXuat"] ?? hoSo["tenCoSo"])}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.facilityAddress}</div>
                        <div className="mt-1 text-sm text-slate-700">{renderValue(donHang["diaChiCoSoSanXuat"] ?? hoSo["diaChiCoSo"])}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {banDangKyUrl && (
                        <a href={banDangKyUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                          {DOSSIER_DETAIL_TEXT.actions.registrationForm}
                        </a>
                      )}
                      {giayBaoThuUrl && (
                        <a href={giayBaoThuUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                          {DOSSIER_DETAIL_TEXT.actions.receipt}
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.companyName}</div>
                      <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["tenDoanhNghiep"])}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.companyAddress}</div>
                      <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["diaChiCoSo"] ?? hoSo["diaChi"])}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.taxCode}</div>
                      <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["maSoThue"])}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Email</div>
                      <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["email"])}</div>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{DOSSIER_DETAIL_TEXT.attachmentsTitle}</h3>
                {attachmentBundles.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-400">{DOSSIER_DETAIL_TEXT.noAttachments}</div>
                ) : (
                  <div className="mt-3 space-y-4">
                    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                      {attachmentBundles.map((bundle) => (
                        <button
                          key={bundle.key}
                          type="button"
                          onClick={() => setAttachmentTab(bundle.key)}
                          className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                            activeAttachmentBundle?.key === bundle.key
                              ? "bg-blue-600 text-white"
                              : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {bundle.label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {(activeAttachmentBundle?.files ?? []).map((file, index) => {
                        const url = buildDavViewFileUrl(file.duongDanTep);
                        return (
                          <div
                            key={`${activeAttachmentBundle?.key ?? "bundle"}-${file.code ?? "tep"}-${index}`}
                            className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-800">{renderValue(file.moTaTep)}</div>
                              <div className="mt-1 break-all text-xs text-slate-500">{renderValue(file.tenTep)}</div>
                            </div>
                            <div className="shrink-0">
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
                                  {DOSSIER_DETAIL_TEXT.actions.open}
                                </a>
                              ) : (
                                <span className="text-sm text-slate-400">{"\u2014"}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{DOSSIER_DETAIL_TEXT.historyTitle}</h3>
                {lichSu.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-400">{DOSSIER_DETAIL_TEXT.noHistory}</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {lichSu.map((item, index) => (
                      <div key={`${item.ngayXuLy ?? index}-${index}`} className="rounded-xl border-l-4 border-blue-400 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-800">{renderValue(item.hanhDongXuLy)}</div>
                          <div className="text-xs font-medium text-slate-500">{isoToDisplay(item.ngayXuLy ?? null)}</div>
                        </div>
                        <div className="mt-1 text-sm text-slate-700">{renderValue(item.nguoiXuLy)}</div>
                        {item.noiDungYKien && (
                          <div className="mt-2 text-sm text-slate-600">{item.noiDungYKien}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
