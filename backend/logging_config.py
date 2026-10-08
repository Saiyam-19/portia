import logging
import os
import sys

def setup_logging() -> None:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    datefmt = "%H:%M:%S"

    logging.basicConfig(
        level=level,
        format=fmt,
        datefmt=datefmt,
        stream=sys.stdout,
        force=True,
    )

    # Patch asctime to include milliseconds
    logging.Formatter.formatTime = lambda self, record, datefmt=None: (  # type: ignore[method-assign]
        __import__('datetime').datetime.fromtimestamp(record.created)
        .strftime(datefmt or "%H:%M:%S") + f".{int(record.msecs):03d}"
    )

    # Quieten noisy third-party loggers
    for noisy in ("httpx", "httpcore", "anthropic", "LiteLLM"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
