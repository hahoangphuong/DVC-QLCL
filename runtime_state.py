import logging
import logging.handlers
import threading
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler


class SyncRuntime:
    def __init__(self) -> None:
        self.log_dir = Path("logs")
        self.log_dir.mkdir(exist_ok=True)

        self.sync_log = logging.getLogger("sync_job")
        self.sync_log.setLevel(logging.INFO)
        self.sync_log.propagate = False
        if not self.sync_log.handlers:
            file_handler = logging.handlers.RotatingFileHandler(
                self.log_dir / "sync.log",
                maxBytes=10 * 1024 * 1024,
                backupCount=5,
                encoding="utf-8",
            )
            file_handler.setFormatter(logging.Formatter(
                "%(asctime)s | %(levelname)-5s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            ))
            self.sync_log.addHandler(file_handler)

        self.sync_lock = threading.Lock()
        self.scheduler = BackgroundScheduler(timezone="UTC")
        self.sync_interval_hours = 3.0
        self.job_run_counter = 0
        self.prune_keep_rows = 10_000

