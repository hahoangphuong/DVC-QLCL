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
    "treo_by_cv": "mv_stats_treo_by_cv",
    "tt48_treo_by_loai": "mv_stats_tt48_treo_by_loai",
}


def refresh_stats_materialized_views(db, *kinds: str):
    targets = kinds or tuple(STATS_MATERIALIZED_VIEWS.keys())
    for kind in targets:
        view_name = STATS_MATERIALIZED_VIEWS.get(kind)
        if not view_name:
            raise ValueError(f"Unknown stats materialized view kind: {kind}")
        db.execute(text(f"REFRESH MATERIALIZED VIEW {view_name}"))

