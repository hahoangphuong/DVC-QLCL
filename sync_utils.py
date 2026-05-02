import json as _json
import re
from datetime import datetime, timezone


def den_ngay_now() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime(f"%Y-%m-%dT%H:%M:%S.{now.microsecond // 1000:03d}Z")


DATE_FIELDS = {
    "ngayTraKetQua", "ngayTiepNhan", "ngayHenTra",
    "phoPhongNgayDuyet", "vanThuNgayDongDau",
    "ngayDoanhNghiepNopHoSo", "ngayChuyenAuto",
    "ngayMotCuaChuyen", "ngayThanhToan", "ngayXacNhanThanhToan",
}

RE_ISO_TS = re.compile(
    r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z))"
)
RE_DDMMYYYY = re.compile(r"(\d{2}/\d{2}/\d{4})")
RE_JSON_STRING_FIELDS = {
    "tenCoSoSanXuat": re.compile(r'"tenCoSoSanXuat"\s*:\s*"((?:\\.|[^"\\])*)"'),
    "tenCoSo": re.compile(r'"tenCoSo"\s*:\s*"((?:\\.|[^"\\])*)"'),
    "tenCoSoSX": re.compile(r'"tenCoSoSX"\s*:\s*"((?:\\.|[^"\\])*)"'),
}


def clean_date_value(val: str) -> str | None:
    if not val or not isinstance(val, str):
        return val

    cleaned = val.strip().split("\n")[0].split("\r")[0].strip()
    if not cleaned:
        return None

    if RE_DDMMYYYY.match(cleaned):
        match = RE_DDMMYYYY.match(cleaned)
        date_part = match.group(1)
        try:
            day, month, year = date_part.split("/")
            return f"{year}-{month}-{day}T00:00:00+07:00"
        except ValueError:
            return None

    match = RE_ISO_TS.match(cleaned)
    if match:
        return match.group(1)

    return cleaned


def clean_record(item: dict) -> dict:
    for field in DATE_FIELDS:
        if field in item and isinstance(item[field], str):
            item[field] = clean_date_value(item[field])

    if not item.get("ngayTraKetQua") and item.get("vanThuNgayDongDau"):
        item["ngayTraKetQua"] = item["vanThuNgayDongDau"]

    return item


def normalize_text(value) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _extract_json_string_field(raw: str, field_name: str) -> str | None:
    pattern = RE_JSON_STRING_FIELDS[field_name]
    match = pattern.search(raw)
    if not match:
        return None
    captured = match.group(1)
    try:
        decoded = _json.loads(f'"{captured}"')
    except Exception:
        decoded = captured.replace('\\"', '"').replace("\\\\", "\\")
    return normalize_text(decoded)


def extract_tra_cuu_chung_facility_fields(item: dict) -> dict[str, str | None]:
    co_so_dang_ky = normalize_text(item.get("tenDoanhNghiep"))
    co_so_san_xuat = None

    json_don_hang = normalize_text(item.get("jsonDonHang"))
    if json_don_hang and json_don_hang.startswith("{"):
        try:
            parsed = _json.loads(json_don_hang)
        except Exception:
            parsed = None
        if isinstance(parsed, dict):
            co_so_san_xuat = (
                normalize_text(parsed.get("tenCoSoSanXuat"))
                or normalize_text(parsed.get("tenCoSo"))
                or normalize_text(parsed.get("tenCoSoSX"))
            )
        else:
            co_so_san_xuat = (
                _extract_json_string_field(json_don_hang, "tenCoSoSanXuat")
                or _extract_json_string_field(json_don_hang, "tenCoSo")
                or _extract_json_string_field(json_don_hang, "tenCoSoSX")
            )

    return {
        "co_so_dang_ky": co_so_dang_ky,
        "co_so_san_xuat": co_so_san_xuat,
    }


def get_free_ram_mb() -> int:
    try:
        with open("/proc/meminfo") as handle:
            for line in handle:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except Exception:
        pass
    return 512


def calc_batch_size(items: list, safety_factor: float = 0.25) -> int:
    if not items:
        return 500
    sample = items[:20]
    avg_bytes = sum(len(_json.dumps(record, ensure_ascii=False).encode()) for record in sample) / len(sample)
    size_per_record = avg_bytes * 4
    budget_bytes = get_free_ram_mb() * 1024 * 1024 * safety_factor
    batch = int(budget_bytes / size_per_record) if size_per_record > 0 else 500
    return max(50, min(batch, 2000))


def batched_insert(db, table, rows: list, batch_size: int) -> None:
    for index in range(0, len(rows), batch_size):
        db.execute(table.insert(), rows[index:index + batch_size])
        db.flush()
