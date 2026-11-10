import multiprocessing
import os

bind = "0.0.0.0:8000"

# Formula: 2 x CPU cores + 1 (defaulting to 3 for a small production server)
default_workers = max(2, multiprocessing.cpu_count() * 2 + 1)
workers = int(os.getenv("GUNICORN_WORKERS", default_workers))
threads = int(os.getenv("GUNICORN_THREADS", 2))
worker_class = "gthread"

timeout = int(os.getenv("GUNICORN_TIMEOUT", 60))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", 5))

# Recycle workers periodically to prevent memory leaks
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", 1000))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", 50))

# Logging to stdout/stderr for Docker capture
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s µs'

# Security: forward remote IP from Nginx
forwarded_allow_ips = "*"
proxy_protocol = False
proxy_allow_from = "*"
