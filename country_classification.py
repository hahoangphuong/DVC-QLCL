HT2_ALPHA2_CODES = (
    "AT", "AU", "BE", "BG", "CA", "CH", "CY", "CZ", "DE", "DK", "EE", "ES",
    "FI", "FR", "GR", "HR", "HU", "ID", "IE", "IS", "IT", "JP", "LI", "LT",
    "LU", "LV", "MT", "MY", "NL", "NO", "PH", "PL", "PT", "RO", "SE", "SG",
    "SI", "SK", "TH", "US",
)

COUNTRY_NAME_PATTERNS = {
    "AR": ["%Argentina%"],
    "AT": ["%Áo%", "%Ao%", "%Austria%"],
    "AU": ["%Úc%", "%Uc%", "%Australia%"],
    "BA": ["%Bosnia và Herzegovina%", "%Bosnia and Herzegovina%", "%Bosnia & Herzegovina%"],
    "BD": ["%Bangladesh%"],
    "BE": ["%Bỉ%", "%Bi%", "%Belgium%"],
    "BG": ["%Bulgaria%", "%Bun-ga-ri%", "%Bungari%"],
    "BR": ["%Brazil%", "%Brasil%"],
    "CA": ["%Canada%", "%Ca-na-đa%"],
    "CH": ["%Thụy Sĩ%", "%Thuy Si%", "%Switzerland%"],
    "CN": ["%Cộng hòa Nhân dân Trung Hoa%", "%Trung Quốc%", "%Trung Quoc%", "%China%"],
    "CY": ["%Síp%", "%Sip%", "%Cyprus%"],
    "CZ": ["%Séc%", "%Sec%", "%Czech%", "%Cộng hòa Séc%", "%Czech Republic%"],
    "DE": ["%Đức%", "%Duc%", "%Germany%"],
    "DK": ["%Đan Mạch%", "%Dan Mach%", "%Denmark%"],
    "EE": ["%Estonia%"],
    "ES": ["%Tây Ban Nha%", "%Tay Ban Nha%", "%Spain%"],
    "FI": ["%Phần Lan%", "%Phan Lan%", "%Finland%"],
    "FR": ["%Pháp%", "%Phap%", "%France%"],
    "GB": ["%Vương quốc Anh%", "%Vuong quoc Anh%", "%United Kingdom%", "%Great Britain%", "%England%"],
    "GR": ["%Hy Lạp%", "%Hy Lap%", "%Greece%"],
    "HR": ["%Croatia%"],
    "HU": ["%Hungary%", "%Hungari%"],
    "ID": ["%Indonesia%", "%In-đô-nê-xi-a%", "%Indonexia%"],
    "IE": ["%Ireland%", "%Ai-len%", "%Cộng hòa Ireland%"],
    "IN": ["%Ấn Độ%", "%An Do%", "%India%"],
    "IS": ["%Iceland%", "%Ai-xơ-len%", "%Ai-xo-len%"],
    "IT": ["%Ý%", "%Italia%", "%Italy%"],
    "JP": ["%Nhật Bản%", "%Nhat Ban%", "%Japan%"],
    "KR": ["%Hàn Quốc%", "%Han Quoc%", "%Korea%", "%Republic of Korea%"],
    "LI": ["%Liechtenstein%"],
    "LT": ["%Lithuania%", "%Litva%"],
    "LU": ["%Luxembourg%", "%Lúc-xăm-bua%", "%Luc-xam-bua%"],
    "LV": ["%Latvia%"],
    "MT": ["%Malta%"],
    "MY": ["%Malaysia%", "%Ma-lai-xi-a%"],
    "NL": ["%Hà Lan%", "%Ha Lan%", "%Netherlands%"],
    "NO": ["%Na Uy%", "%Norway%"],
    "PH": ["%Philippines%", "%Philippine%", "%Phi-líp-pin%", "%Phi lip pin%"],
    "PK": ["%Pakistan%"],
    "PL": ["%Ba Lan%", "%Poland%"],
    "PT": ["%Bồ Đào Nha%", "%Bo Dao Nha%", "%Portugal%"],
    "RO": ["%Romania%"],
    "RU": ["%Nga%", "%Russia%", "%Russian Federation%"],
    "SE": ["%Thụy Điển%", "%Thuy Dien%", "%Sweden%"],
    "SG": ["%Singapore%", "%Xin-ga-po%", "%Xingapo%"],
    "SI": ["%Slovenia%"],
    "SK": ["%Slovakia%"],
    "TH": ["%Thái Lan%", "%Thai Lan%", "%Thailand%"],
    "TR": ["%Thổ Nhĩ Kỳ%", "%Tho Nhi Ky%", "%Turkey%", "%Türkiye%"],
    "TW": ["%Đài Loan%", "%Dai Loan%", "%Taiwan%"],
    "UA": ["%Ukraine%", "%Ukraina%"],
    "US": ["%Hoa Kỳ%", "%Hoa Ky%", "%Hiệp chủng quốc Hoa Kỳ%", "%Hiep chung quoc Hoa Ky%", "%Mỹ%", "%My%", "%United States%", "%USA%"],
    "UY": ["%Uruguay%"],
    "VN": ["%Việt Nam%", "%Viet Nam%", "%Vietnam%"],
}


def build_country_name_to_alpha2_case(expr: str) -> str:
    lines = ["CASE"]
    for alpha2, patterns in COUNTRY_NAME_PATTERNS.items():
        pats = ", ".join("'" + p.replace("'", "''") + "'" for p in patterns)
        lines.append(f"    WHEN COALESCE({expr}, '') ILIKE ANY (ARRAY[{pats}]) THEN '{alpha2}'")
    lines.append("    ELSE NULL")
    lines.append("END")
    return "\n".join(lines)


def build_nuoc_so_tai_expr(data_expr: str) -> str:
    top_level = f"NULLIF({data_expr}->>'nuocSoTai', '')"
    json_don_hang = (
        f"CASE "
        f"WHEN NULLIF({data_expr}->>'jsonDonHang', '') IS NOT NULL "
        f"THEN (({data_expr}->>'jsonDonHang')::jsonb->>'nuocSoTai') "
        f"ELSE NULL "
        f"END"
    )
    return f"COALESCE({json_don_hang}, {top_level})"


def build_dia_chi_co_so_san_xuat_expr(data_expr: str) -> str:
    return (
        f"CASE "
        f"WHEN NULLIF({data_expr}->>'jsonDonHang', '') IS NOT NULL "
        f"THEN COALESCE("
        f"(({data_expr}->>'jsonDonHang')::jsonb->>'diaChiCoSoSanXuat'), "
        f"(({data_expr}->>'jsonDonHang')::jsonb->>'diaChiNhaMay')"
        f") "
        f"ELSE NULL "
        f"END"
    )
