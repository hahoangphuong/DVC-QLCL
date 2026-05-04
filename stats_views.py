from sqlalchemy import text


STATS_MATERIALIZED_VIEWS = {
    "received": "mv_stats_received_monthly",
    "tt48_received_by_loai": "mv_stats_tt48_received_by_loai_monthly",
    "received_bounds": "mv_stats_received_bounds",
    "resolved": "mv_stats_resolved_monthly",
    "resolved_facts": "mv_stats_resolved_facts",
    "inflight": "mv_stats_inflight_monthly",
    "case_facts": "mv_stats_case_facts",
    "workflow_cases": "mv_stats_workflow_cases",
    "pending_lookup": "mv_stats_pending_lookup",
    "resolved_lookup": "mv_stats_resolved_lookup",
    "treo_by_cv": "mv_stats_treo_by_cv",
    "tt48_treo_by_loai": "mv_stats_tt48_treo_by_loai",
}

STATS_SCHEMA_VERSION = 4
STATS_SCHEMA_META_KEY = "__stats_schema_version__"

CONCURRENT_REFRESH_KINDS = {
    "received",
    "tt48_received_by_loai",
    "received_bounds",
    "resolved",
    "inflight",
    "case_facts",
    "workflow_cases",
    "pending_lookup",
    "resolved_lookup",
    "treo_by_cv",
    "tt48_treo_by_loai",
}


def refresh_stats_materialized_views(db, *kinds: str, concurrently: bool = False):
    targets = kinds or tuple(STATS_MATERIALIZED_VIEWS.keys())
    bind = db.get_bind()
    if concurrently:
        with bind.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            for kind in targets:
                view_name = STATS_MATERIALIZED_VIEWS.get(kind)
                if not view_name:
                    raise ValueError(f"Unknown stats materialized view kind: {kind}")
                exists = conn.execute(text("SELECT to_regclass(:name)"), {"name": view_name}).scalar()
                if not exists:
                    continue
                stmt = "REFRESH MATERIALIZED VIEW CONCURRENTLY" if kind in CONCURRENT_REFRESH_KINDS else "REFRESH MATERIALIZED VIEW"
                conn.execute(text(f"{stmt} {view_name}"))
        return

    for kind in targets:
        view_name = STATS_MATERIALIZED_VIEWS.get(kind)
        if not view_name:
            raise ValueError(f"Unknown stats materialized view kind: {kind}")
        exists = db.execute(text("SELECT to_regclass(:name)"), {"name": view_name}).scalar()
        if not exists:
            continue
        db.execute(text(f"REFRESH MATERIALIZED VIEW {view_name}"))
