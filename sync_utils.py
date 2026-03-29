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

