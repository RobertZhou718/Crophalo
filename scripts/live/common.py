# common.py: the contract and the shared helpers of every live lookup in this folder (written 2026-11-14).
# Reads:   nothing by itself. It gives each lookup its doors to the outside: http(), download(), raster_path() and
#          read_window(), NASA's catalogue (cmr_granules, cmr_collections), the NASA Earthdata login (earthdata_token).
# From:    whichever service the lookup names; every request carries the one User-Agent below.
# Returns: through run(main): exactly ONE JSON object on stdout and exit code 0, whatever happens.
#          Good:    {"ok": true, "source": ..., "data_date": ..., "units": ..., "checked": ..., the lookup's own keys}
#          Failure: {"ok": false, "reason": "<plain words a farmer can read>"} plus "final": true when asking again cannot help.
# Checked by: scripts/test_live_common.mjs (node scripts/test_live_common.mjs). The contract in words: scripts/live/README.md.
#
# RULE for every lookup: "import common" is its FIRST import. The lines just below take the real stdout away before any
# library can print, so a stray print can never break the answer.
import os
import sys

try:   # the answer's own way out; from here on descriptor 1 is the log (stderr), for Python prints and C libraries alike
    _OUT = os.dup(1)
    os.dup2(2, 1)
except OSError:   # started with no stdout at all: there is nobody to answer
    _OUT = None
if os.name == "nt" and _OUT is not None:   # Windows would rewrite line ends in the answer's bytes
    import msvcrt
    msvcrt.setmode(_OUT, os.O_BINARY)

import base64
import datetime
import hashlib
import json
import re
import shutil
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

USER_AGENT = "Crophalo/1.0 (crop-rotation comparison for farmers; live data lookup)"   # honest, and no personal data
PER_HOST = 2          # requests at one time to one host: the services are free and shared
PAUSE_S = 0.25        # between two requests to one host
RETRY_PAUSE_S = 1.5   # before the second try
MAX_BODY = 32 << 20   # http() holds an answer in memory: bigger files go through download(), piece by piece
BIG_HOST_MB = 7500    # the same line the server draws; under it one worker, so a 512 MB host never runs two readers
KEY_HEADERS = ("cmr-search-after",)   # request headers that make two requests to one address different requests
NO_LOGIN = "No NASA Earthdata login is set up on this computer (it is free: urs.earthdata.nasa.gov)"
URS_TOKEN = "https://urs.earthdata.nasa.gov/api/users/find_or_create_token"
CMR = "https://cmr.earthdata.nasa.gov/search/"

ME = os.path.splitext(os.path.basename(sys.argv[0] or "lookup"))[0]
REPLAY = os.environ.get("FW_NET_REPLAY") or None   # a folder of recorded answers: the network is replaced (tests)
RECORD = None if REPLAY else os.environ.get("FW_NET_RECORD") or None   # a folder to record real answers into (by hand)
_T0 = time.monotonic()
_state = {"limit": None, "sent": False, "tmp_cache": None, "token": None, "asked": 0}
_once = threading.Lock()
_secrets = set()


# ---- secrets: nothing the login is made of may reach the answer or the log, even by accident
def _secret(*values):
    for v in values:
        if v and len(v) >= 3:
            _secrets.add(v)


def scrub(text):
    for s in sorted(_secrets, key=len, reverse=True):
        text = text.replace(s, "***")
    return text


class _Scrubbed:   # what Python itself prints (print, warnings, tracebacks, a library's logging) passes through here
    def __init__(self, raw):
        self._raw = raw

    def write(self, text):
        return self._raw.write(scrub(text) if isinstance(text, str) and _secrets else text)

    def __getattr__(self, name):
        return getattr(self._raw, name)


sys.stdout = sys.stderr = _Scrubbed(sys.stderr)
_secret(os.environ.get("EARTHDATA_USERNAME"), os.environ.get("EARTHDATA_PASSWORD"))


# ---- failures
class Fail(Exception):
    """A refusal in plain words: the farmer reads the reason. final=True only when asking again cannot change it."""

    def __init__(self, reason, final=False):
        super().__init__(reason)
        self.reason, self.final = reason, bool(final)


class SourceDown(Exception):
    """An outside service did not give an answer. kind: timeout | network | http | busy. Never holds a secret or a query."""

    def __init__(self, words, kind="network", status=None, body=b""):
        super().__init__(words)
        self.kind, self.status, self.body = kind, status, body


class NotRecorded(BaseException):
    """A test run asked an address that has no recorded answer. Not an Exception, so no lookup can swallow it."""


# ---- time
def elapsed():
    return time.monotonic() - _T0


def left():
    """Seconds left before this lookup must answer; None when no limit is set."""
    return None if _state["limit"] is None else _state["limit"] - elapsed()


def now():
    """Now, in UTC. A test run (and only a test run) can pin the clock with FW_NOW=2026-11-14T12:00:00Z."""
    pinned = os.environ.get("FW_NOW") if REPLAY else None
    if pinned:
        return datetime.datetime.strptime(pinned, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
    return datetime.datetime.now(datetime.timezone.utc)


def iso_now():
    return now().strftime("%Y-%m-%dT%H:%M:%SZ")


def log(*words):
    """Progress and diagnostics, to stderr only. Never pass a login, a token or a whole address with a field's position."""
    try:
        sys.stderr.write("[%s %5.1fs] %s\n" % (ME, elapsed(), " ".join(str(w) for w in words)))
        sys.stderr.flush()
    except (OSError, ValueError):
        pass


# ---- memory
def host_memory_mb():
    """This computer's memory or, inside a container, the container's: a 512 MB host must not pass for the machine under it."""
    found = []
    for file in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            found.append(int(Path(file).read_text().strip()))
        except (OSError, ValueError):   # no such file, or the word "max"
            pass
    try:
        found.append(os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE"))
    except (AttributeError, ValueError, OSError):   # Windows has no sysconf
        try:
            import ctypes

            class Status(ctypes.Structure):
                _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
                    (n, ctypes.c_ulonglong) for n in ("total", "avail", "page", "page_avail", "virt", "virt_avail", "ext")]

            status = Status(length=ctypes.sizeof(Status))
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                found.append(status.total)
        except Exception:
            pass
    found = [b for b in found if 0 < b < 1 << 50]   # an unlimited container reports a number far beyond any machine
    return min(found) / 1e6 if found else None


def workers_for(memory_mb, wanted=PER_HOST):
    """One worker on a small or unknown host; on a big one what the lookup wants. Pure."""
    return max(1, int(wanted)) if memory_mb and memory_mb >= BIG_HOST_MB else 1


def workers(wanted=PER_HOST):
    """How many requests or files one lookup may work on at once. FW_WORKERS (1..8) overrides. To ONE host never more
    than PER_HOST: http() and read_window() hold to that by themselves."""
    asked = os.environ.get("FW_WORKERS", "")
    return min(8, int(asked)) if asked.isdigit() and int(asked) >= 1 else workers_for(host_memory_mb(), wanted)


def peak_mb():
    """(this process, its largest finished child) peak memory in MB as the system counted it; None where it cannot be read."""
    try:
        import resource
        unit = 1e6 if sys.platform == "darwin" else 1e3   # macOS counts bytes, Linux kilobytes
        return (resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / unit,
                resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / unit)
    except Exception:
        pass
    try:   # Windows
        import ctypes
        from ctypes import wintypes

        class Counters(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("faults", wintypes.DWORD)] + [
                (n, ctypes.c_size_t) for n in ("peak", "now", "qpp", "qp", "qnpp", "qnp", "pagefile", "peak_pagefile")]

        counters = Counters(cb=ctypes.sizeof(Counters))
        kernel = ctypes.windll.kernel32
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        if ctypes.windll.psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
            return counters.peak / 1e6, 0.0
    except Exception:
        pass
    return None


# ---- the one answer
def _finish(obj):
    """Write the one JSON object and leave with exit code 0. Whoever comes second (the timer or main) writes nothing."""
    with _once:
        if _state["sent"]:
            return
        _state["sent"] = True
        try:
            text = json.dumps(obj, separators=(",", ":"), allow_nan=False, ensure_ascii=False)
        except (ValueError, TypeError):   # a stray NaN or an object: never half an answer
            text = json.dumps({"ok": False, "reason": "The source sent a value that could not be read"}, separators=(",", ":"))
        data = scrub(text).encode("utf-8")
        try:
            while data and _OUT is not None:
                data = data[os.write(_OUT, data):]
        except OSError:
            pass
        peak = peak_mb()
        mine, child = ("%.1f" % peak[0], "%.1f" % peak[1]) if peak else ("?", "?")
        log("peak_mb=%s child_peak_mb=%s seconds=%.2f asked=%d" % (mine, child, elapsed(), _state["asked"]))   # the test helper reads this line; asked = requests sent out
        if _state["tmp_cache"]:
            shutil.rmtree(_state["tmp_cache"], ignore_errors=True)
        if "multiprocessing" in sys.modules:   # worker processes still running must not outlive the lookup
            for worker in sys.modules["multiprocessing"].active_children():
                worker.terminate()
        try:
            sys.stderr.flush()
        except (OSError, ValueError):
            pass
        os._exit(0)   # not sys.exit: a thread stuck in a hung read must not keep the lookup alive


def run(main, limit_s=150, slow="The data source took too long to answer; try again in a minute"):
    """Run one lookup. main(args) returns the answer's own keys as a dict, or raises Fail. limit_s is the server's time
    limit for this lookup: a little before it the lookup answers `slow` by itself, so the server never has to kill it."""
    asked = os.environ.get("FW_LIMIT_S", "")   # a test may shorten the limit, never lengthen it
    if re.fullmatch(r"\d+(\.\d+)?", asked):
        limit_s = min(limit_s, float(asked))
    _state["limit"] = limit_s - min(5.0, limit_s * 0.25)   # the server's clock started before this one: leave room for a slow start
    timer = threading.Timer(max(0.05, _state["limit"]), lambda: (log("stopped at the time limit"), _finish({"ok": False, "reason": slow})))
    timer.daemon = True
    timer.start()
    try:
        out = main(sys.argv[1:])
        if not isinstance(out, dict):
            raise TypeError("main() must return a dict")
        for field in ("source", "data_date", "units"):   # no figure without its source, its date and its units
            if not out.get(field):
                raise TypeError("the answer has no '%s'" % field)
        answer = {"ok": True}
        answer.update(out)
        answer["ok"] = True
        answer.setdefault("checked", iso_now())
        if REPLAY:
            answer["replayed"] = True   # an answer made from recorded test inputs can never pass for a live one
    except Fail as e:
        answer = {"ok": False, "reason": " ".join(str(e.reason).split()) or "The data source gave no answer"}
        if e.final:
            answer["final"] = True
    except SourceDown as e:
        log("the source did not answer:", e)
        answer = {"ok": False, "reason": "The data source did not answer just now; try again in a minute"}
    except NotRecorded as e:
        answer = {"ok": False, "reason": "Test run: " + str(e)}
    except BaseException as e:   # anything else, SystemExit and Ctrl-C included: the traceback goes to the log, never to stdout
        sys.stderr.write(traceback.format_exc())
        answer = {"ok": False, "reason": "Unexpected error while reading the source: " + " ".join(str(e).split())[:200]}
    _finish(answer)


# ---- arguments (the server has checked them already; a lookup run by hand must refuse the same things)
_NUMBER = re.compile(r"[+-]?(\d+\.?\d*|\.\d+)")


def number(text, name, lo, hi, unit=""):
    """One plain decimal inside lo..hi. A blank is missing, never 0; "1e3", "0x10", "nan" and "inf" are not numbers here."""
    s = "" if text is None else str(text).strip()
    if not _NUMBER.fullmatch(s):
        raise Fail("%s is required as a plain number%s" % (name, " (%s)" % unit if unit else ""))
    v = float(s)
    if not lo <= v <= hi:
        raise Fail("%s must be %g..%g%s" % (name, lo, hi, " " + unit if unit else ""))
    return v


def whole(text, name, lo, hi):
    """One whole number inside lo..hi."""
    s = "" if text is None else str(text).strip()
    if not re.fullmatch(r"\d{1,9}", s):
        raise Fail("%s is required as a whole number" % name)
    if not lo <= int(s) <= hi:
        raise Fail("%s must be %d..%d" % (name, lo, hi))
    return int(s)


def latlon(args, max_lat=90):
    """(lat, lon) from the first two arguments, decimal degrees. Boxes pass max_lat=84."""
    pair = ["" if a is None else str(a).strip() for a in list(args)[:2]]
    if len(pair) < 2 or not all(_NUMBER.fullmatch(s) for s in pair):
        raise Fail("lat and lon are required as decimal degrees")
    lat, lon = float(pair[0]), float(pair[1])
    if abs(lat) > max_lat or abs(lon) > 180:
        raise Fail("lat must be -%d..%d and lon -180..180" % (max_lat, max_lat))
    return lat, lon


def day(text, name="The date"):
    """A real calendar day written YYYYMMDD."""
    s = "" if text is None else str(text).strip()
    try:
        if not re.fullmatch(r"\d{8}", s):
            raise ValueError
        return datetime.date(int(s[:4]), int(s[4:6]), int(s[6:]))
    except ValueError:
        raise Fail("%s must be a real day written YYYYMMDD" % name) from None


# ---- the network, and the ONE way a test replaces it
#   FW_NET_REPLAY=<folder>  every door below serves from the folder and refuses any address that is not in it;
#                           plain sockets are shut as well, so an offline suite can never reach the internet.
#   FW_NET_RECORD=<folder>  (by hand, live) every answer http() gets is also written into the folder.
#   One recorded answer is two files named by net_key(): <key>.json (method, address, replies) and <key>.body (the bytes).
def net_key(method, url, data=None, headers=None):
    """The stable name of one request: method, address, the body if there is one, and the KEY_HEADERS."""
    h = hashlib.sha256((method.upper() + "\n" + url).encode("utf-8"))
    if data:
        h.update(b"\n" + hashlib.sha256(data).hexdigest().encode())
    low = {k.lower(): v for k, v in (headers or {}).items()}
    for name in KEY_HEADERS:
        if low.get(name):
            h.update(("\n%s:%s" % (name, low[name])).encode("utf-8"))
    return h.hexdigest()[:24]


def _where(url):   # host and path only: a query can hold a field's position, and the log is not the place for it
    p = urllib.parse.urlsplit(url)
    return p.netloc + p.path


def _miss(what):
    sys.stderr.write("NET-REPLAY-MISS %s\n" % what)   # the test helper looks for this line
    sys.stderr.flush()
    raise NotRecorded("no recorded answer for " + what)


if REPLAY:
    import socket

    def _shut(*_a, **_k):
        sys.stderr.write("NET-REPLAY-MISS a plain socket\n")
        sys.stderr.flush()
        raise OSError("the network is replaced in this test run")

    socket.socket.connect = socket.socket.connect_ex = _shut
    socket.create_connection = socket.getaddrinfo = _shut
    for name in ("http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        os.environ[name] = "http://127.0.0.1:9"   # C libraries (GDAL, netCDF) do not use Python's sockets: send them nowhere
    os.environ["no_proxy"] = os.environ["NO_PROXY"] = ""

_calls = {}
_gates = {}
_gate_lock = threading.Lock()
_busy_hosts = set()


def _count():   # one more request sent out (two threads may count at once)
    with _gate_lock:
        _state["asked"] += 1


class _Gate:   # at most PER_HOST requests at a time to one host, and a pause between two starts
    def __init__(self, host):
        with _gate_lock:
            self.g = _gates.setdefault(host, {"slots": threading.Semaphore(PER_HOST), "lock": threading.Lock(), "next": 0.0})

    def __enter__(self):
        self.g["slots"].acquire()
        if not REPLAY:
            with self.g["lock"]:
                wait = self.g["next"] - time.monotonic()
                self.g["next"] = max(time.monotonic(), self.g["next"]) + PAUSE_S
            if wait > 0:
                time.sleep(wait)

    def __exit__(self, *_exc):
        self.g["slots"].release()


class Reply:
    def __init__(self, status, headers, body):
        self.status, self.headers, self.body = status, {k.lower(): v for k, v in headers.items()}, body

    def text(self):
        return self.body.decode("utf-8", "replace")

    def json(self):
        try:
            return json.loads(self.body.decode("utf-8"))
        except ValueError:
            raise SourceDown("the answer could not be read as JSON", "http", self.status) from None


def keep_login(old_url, new_url, headers):
    """The headers for a request that was sent on to another address: the login stays with the host it was meant for."""
    same = urllib.parse.urlsplit(old_url).netloc.lower() == urllib.parse.urlsplit(new_url).netloc.lower()
    return {k: v for k, v in headers.items() if same or k.lower() != "authorization"}


class _Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None:
            new.headers = keep_login(req.full_url, newurl, new.headers)
        return new


_opener = urllib.request.build_opener(_Redirects)


def _replayed(method, url, data, headers, timeout):
    key = net_key(method, url, data, headers)
    try:
        meta = json.loads(Path(REPLAY, key + ".json").read_text(encoding="utf-8"))
    except OSError:
        _miss("%s %s" % (method, url))
    with _gate_lock:
        n = _calls[key] = _calls.get(key, 0) + 1
    r = meta["replies"][min(n, len(meta["replies"])) - 1]   # the replies are served in turn; the last one repeats
    if r.get("fail") == "hang":   # a service that never answers: wait the whole time limit, as the real call would
        time.sleep(timeout)
        raise SourceDown("no answer from %s within %g s" % (_where(url), timeout), "timeout")
    if r.get("fail"):
        raise SourceDown("%s could not be reached (%s)" % (_where(url), r["fail"]))
    file = Path(REPLAY, r.get("body") or key + ".body")   # "body" names another file in the folder; the usual one is <key>.body
    return r.get("status", 200), r.get("headers", {}), file.read_bytes() if file.exists() else b""


def _live(method, url, data, headers, timeout):
    req = urllib.request.Request(url, data=data, method=method, headers={"User-Agent": USER_AGENT, **(headers or {})})
    where = _where(url)
    try:
        with _opener.open(req, timeout=timeout) as r:
            body = r.read(MAX_BODY + 1)
            if len(body) > MAX_BODY:
                raise SourceDown("%s sent more than %d MB: read it with download()" % (where, MAX_BODY >> 20), "http", r.status)
            return r.status, dict(r.headers.items()), body
    except urllib.error.HTTPError as e:
        try:
            return e.code, dict(e.headers.items()), e.read(65536)
        except Exception:
            return e.code, {}, b""
    except SourceDown:
        raise
    except (TimeoutError, urllib.error.URLError, OSError, ValueError) as e:
        cause = getattr(e, "reason", e)
        if isinstance(cause, TimeoutError) or "timed out" in str(cause):
            raise SourceDown("no answer from %s within %g s" % (where, timeout), "timeout") from None
        raise SourceDown("%s could not be reached (%s)" % (where, type(cause).__name__)) from None
    except Exception as e:   # a broken-off answer (IncompleteRead, RemoteDisconnected)
        raise SourceDown("%s broke off its answer (%s)" % (where, type(e).__name__)) from None


def _recorded(method, url, data, headers, status, got_headers, body):
    if any(k.lower() == "authorization" for k in (headers or {})):
        return log("not recorded: this request carries the login")
    key = net_key(method, url, data, headers)
    keep = {k.lower(): v for k, v in got_headers.items() if k.lower() in ("content-type", "last-modified", "cmr-search-after", "cmr-hits", "retry-after", "content-length")}
    meta = {"method": method, "url": url, "recorded": iso_now(), "hand_made": False, "replies": [{"status": status, "headers": keep}]}
    Path(RECORD).mkdir(parents=True, exist_ok=True)
    Path(RECORD, key + ".body").write_bytes(body)
    Path(RECORD, key + ".json").write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def http(url, data=None, headers=None, timeout=60, tries=2, method=None):
    """One small request (the whole answer in memory, at most MAX_BODY). Two tries, RETRY_PAUSE_S apart, for a time-out, a
    broken connection or a 5xx; a 4xx is the service's answer and is not asked again; a 429 stops every further request
    to that host. Returns a Reply; raises SourceDown (.kind, .status, .body) in words that hold no query and no secret."""
    method = (method or ("POST" if data is not None else "GET")).upper()
    host = urllib.parse.urlsplit(url).netloc.lower()
    where = _where(url)
    for n in range(1, tries + 1):
        if host in _busy_hosts:
            raise SourceDown("%s asked us to slow down" % host, "busy", 429)
        t = timeout if left() is None else min(timeout, left())
        if t <= 0:
            raise SourceDown("no time left to ask %s" % where, "timeout")
        try:
            with _Gate(host):
                _count()
                status, got, body = (_replayed if REPLAY else _live)(method, url, data, headers, t)
            if RECORD:
                _recorded(method, url, data, headers, status, got, body)
            if status == 429:
                _busy_hosts.add(host)
                raise SourceDown("%s asked us to slow down (HTTP 429)" % host, "busy", 429, body[:2000])
            if status >= 400:
                raise SourceDown("HTTP %d from %s" % (status, where), "http", status, body[:2000])
            return Reply(status, got, body)
        except SourceDown as e:
            again = n < tries and e.kind != "busy" and (e.kind != "http" or e.status >= 500 or e.status == 408)
            log("%s %s: try %d of %d failed: %s%s" % (method, where, n, tries, e, "; trying once more" if again else ""))
            if not again:
                raise
            time.sleep(0.05 if REPLAY else RETRY_PAUSE_S)


def http_json(url, **kw):
    return http(url, **kw).json()


def each(items, work, wanted=PER_HOST):
    """work(item) for every item, on workers(wanted) threads. Returns [(item, result, error)] in the items' order:
    error is the SourceDown or Fail that item raised, else None. Items not started when the time is up get a time-out."""
    def one(item):
        if left() is not None and left() <= 0:
            return item, None, SourceDown("no time left", "timeout")
        try:
            return item, work(item), None
        except (SourceDown, Fail) as e:
            return item, None, e

    items = list(items)
    n = min(workers(wanted), len(items))
    if n <= 1:
        return [one(item) for item in items]
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(n) as pool:
        return list(pool.map(one, items))


# ---- kept files: only under FW_CACHE, never the home folder. Answers are never kept here: the server keeps those.
def cache_dir(*parts):
    """A folder under FW_CACHE for downloaded source files. A run by hand without FW_CACHE gets a throwaway folder
    that is removed when the lookup ends."""
    root = os.environ.get("FW_CACHE")
    if not root:
        if not _state["tmp_cache"]:
            _state["tmp_cache"] = tempfile.mkdtemp(prefix="crophalo-lookup-")
            log("FW_CACHE is not set: nothing is kept after this run")
        root = _state["tmp_cache"]
    folder = Path(root).joinpath(*parts)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _inside_cache(dest):
    dest, root = Path(dest).resolve(), cache_dir().resolve()
    if root != dest and root not in dest.parents:
        raise ValueError("files are kept only under FW_CACHE")
    return dest


def atomic_write(dest, data):
    """Write a kept file whole or not at all (a .part file, then a rename)."""
    dest = _inside_cache(dest)
    part = dest.with_name(dest.name + ".%d.part" % os.getpid())
    part.write_bytes(data)
    os.replace(part, dest)
    return dest


def download(url, dest, headers=None, timeout=60, piece=1 << 20):
    """A big file, streamed to dest (under FW_CACHE) in 1 MB pieces: never held in memory, never left half written.
    One try: the lookup decides whether a second download is worth the service's bandwidth."""
    dest = _inside_cache(dest)
    part = dest.with_name(dest.name + ".%d.part" % os.getpid())
    host, where = urllib.parse.urlsplit(url).netloc.lower(), _where(url)
    try:
        with _Gate(host):
            _count()
            if REPLAY:
                source = Path(REPLAY, net_key("GET", url) + ".body")
                if not source.exists():
                    _miss("GET " + url)
                src = open(source, "rb")
            else:
                if host in _busy_hosts:
                    raise SourceDown("%s asked us to slow down" % host, "busy", 429)
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
                try:
                    src = _opener.open(req, timeout=timeout)
                except urllib.error.HTTPError as e:
                    if e.code == 429:
                        _busy_hosts.add(host)
                    raise SourceDown("HTTP %d from %s" % (e.code, where), "busy" if e.code == 429 else "http", e.code) from None
            with src, open(part, "wb") as out:
                while True:
                    if left() is not None and left() <= 0:
                        raise SourceDown("no time left to finish the download from %s" % where, "timeout")
                    block = src.read(piece)
                    if not block:
                        break
                    out.write(block)
        os.replace(part, dest)
        return dest
    except SourceDown:
        raise
    except (TimeoutError, urllib.error.URLError, OSError) as e:
        raise SourceDown("the download from %s broke off (%s)" % (where, type(getattr(e, "reason", e)).__name__)) from None
    finally:
        if part.exists():
            part.unlink()


# ---- NASA: the catalogue (anonymous) and the login
def _query(params, extra):
    pairs = list(params.items()) if isinstance(params, dict) else list(params)
    return urllib.parse.urlencode(pairs + extra, doseq=True)


def cmr_granules(params, limit=4000, page_size=2000):
    """Granule entries from NASA's catalogue (CMR granules.json), page after page with CMR-Search-After, at most `limit`.
    params: a dict or a list of pairs (repeat a key by repeating the pair). No login is sent: the search is open."""
    out, after, size = [], None, max(1, min(page_size, limit))
    while len(out) < limit:
        r = http(CMR + "granules.json?" + _query(params, [("page_size", size)]), headers={"CMR-Search-After": after} if after else None, timeout=40)
        entries = r.json().get("feed", {}).get("entry", [])
        out += entries
        after = r.headers.get("cmr-search-after")
        if len(entries) < size or not after:
            break
    return out[:limit]


def cmr_collections(params, page_size=50):
    """Collection entries from NASA's catalogue (CMR collections.json), one page."""
    return http(CMR + "collections.json?" + _query(params, [("page_size", page_size)]), timeout=40).json().get("feed", {}).get("entry", [])


def data_links(entry, suffix=""):
    """The HTTPS download links of one granule: never s3://, never a browse picture, never a link the collection lent it."""
    return [link["href"] for link in entry.get("links", [])
            if str(link.get("rel", "")).endswith("/data#") and not link.get("inherited")
            and str(link.get("href", "")).startswith("https://") and link["href"].endswith(suffix)]


def earthdata_login():
    """(username, password) from this process's own surroundings only: the two variables the server sets for it, else the
    netrc file the server names in NETRC, else the home netrc. The values go nowhere but the token request."""
    import netrc
    user, word = os.environ.get("EARTHDATA_USERNAME"), os.environ.get("EARTHDATA_PASSWORD")
    if not (user and word):
        user = word = None
        home = os.path.expanduser("~")
        for file in (os.environ.get("NETRC"), os.path.join(home, ".netrc"), os.path.join(home, "_netrc")):
            try:
                found = netrc.netrc(file).authenticators("urs.earthdata.nasa.gov") if file else None
            except (OSError, netrc.NetrcParseError):
                continue
            if found and found[0] and found[2]:
                user, word = found[0], found[2]
                break
    if not (user and word):
        raise Fail(NO_LOGIN)
    _secret(user, word, base64.b64encode(("%s:%s" % (user, word)).encode("utf-8")).decode("ascii"))
    return user, word


def earthdata_token():
    """A bearer token for NASA's data hosts, asked once per lookup and held in memory only (never in a file, a log or an answer)."""
    if _state["token"]:
        return _state["token"]
    user, word = earthdata_login()
    basic = base64.b64encode(("%s:%s" % (user, word)).encode("utf-8")).decode("ascii")
    try:
        answer = http(URS_TOKEN, data=b"", headers={"Authorization": "Basic " + basic, "Accept": "application/json"}, timeout=30).json()
    except SourceDown as e:
        if e.status in (401, 403):
            raise Fail("NASA Earthdata did not accept this computer's login: check the username and password") from None
        raise Fail("NASA Earthdata login failed: " + scrub(str(e))) from None
    token = answer.get("access_token") if isinstance(answer, dict) else None
    if not token:
        raise Fail("NASA Earthdata login failed: no token came back")
    _secret(token)
    _state["token"] = token
    return token


def bearer():
    """The header that carries the login to a NASA data host. Send it to NASA hosts only."""
    return {"Authorization": "Bearer " + earthdata_token()}


# ---- rasters: a window, never a whole file
def gdal_options(token=None):
    """GDAL's settings for range reads of remote GeoTIFFs: small reads, no folder listings, short time limits, a small
    block cache. Use as:  with rasterio.Env(**common.gdal_options()): ..."""
    options = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF", "CPL_VSIL_CURL_USE_HEAD": "NO",
        "GDAL_INGESTED_BYTES_AT_OPEN": "32768", "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES", "GDAL_HTTP_MAX_RETRY": "2",
        "GDAL_HTTP_RETRY_DELAY": "1", "GDAL_HTTP_TIMEOUT": "30", "GDAL_HTTP_USERAGENT": USER_AGENT, "VSI_CACHE": "FALSE",
        "GDAL_CACHEMAX": 64, "CPL_LOG_ERRORS": "OFF",   # 64 MB of raster blocks at most (a whole number: the raster library refuses "64")
    }
    if token:
        options["GDAL_HTTP_HEADERS"] = "Authorization: Bearer " + token
    return options


def earthdata_gdal():
    """gdal_options() with the NASA login as a bearer token. Open only NASA files inside this Env."""
    return gdal_options(earthdata_token())


def raster_path(url):
    """What to hand rasterio.open() for a remote GeoTIFF: range reads over the network, or, in a test run, the recorded
    or hand-made file that stands for that address."""
    if not REPLAY:
        return "/vsicurl/" + url
    file = Path(REPLAY, net_key("GET", url) + ".body")
    if not file.exists():
        _miss("GET " + url)
    return str(file)


def read_window(url, lat, lon, half=1, band=1, options=None):
    """The (2*half+1) x (2*half+1) pixels of one band around a point of a remote GeoTIFF, read as a window.
    Returns None when the point is outside the raster, else a dict: values (float64, NaN where the file says no data or
    the window leaves the raster: a pixel nobody read is unknown, never 0), scale, offset, nodata, row, col, crs, res.
    The stored values are returned as stored: apply scale and offset yourself, after your own quality checks.
    A file that cannot be opened or read (a slow or dead host, a broken file) raises SourceDown."""
    import numpy as np
    import rasterio
    from rasterio._err import CPLE_BaseError
    from rasterio.errors import RasterioError
    from rasterio.warp import transform
    from rasterio.windows import Window
    try:
        with _Gate(urllib.parse.urlsplit(url).netloc.lower()), rasterio.Env(**(options or gdal_options())), rasterio.open(raster_path(url)) as ds:
            _count()
            x, y = lon, lat
            if ds.crs is not None and ds.crs.to_epsg() != 4326:
                xs, ys = transform("EPSG:4326", ds.crs, [lon], [lat])
                x, y = xs[0], ys[0]
            row, col = (int(v) for v in ds.index(x, y))
            if not (0 <= row < ds.height and 0 <= col < ds.width):
                return None
            size = 2 * half + 1
            got = ds.read(band, window=Window(col - half, row - half, size, size), boundless=True, masked=True)
            values = np.ma.filled(got.astype("float64"), np.nan)
            return {"values": values, "scale": ds.scales[band - 1], "offset": ds.offsets[band - 1], "nodata": ds.nodata,
                    "row": row, "col": col, "crs": str(ds.crs), "res": [abs(ds.res[0]), abs(ds.res[1])]}
    except (RasterioError, CPLE_BaseError) as e:   # the raster library's own words can hold the whole address: only its kind goes on
        log("raster read failed:", type(e).__name__, "at", _where(url))
        raise SourceDown("%s could not be read (%s)" % (_where(url), type(e).__name__)) from None


# ---- names
def country_name(name=None, code=None):
    """A country's name as the app writes it: "Türkiye" for the code TR and for the old English spelling a source may send; any other
    name as the source gave it; None when the source gave none."""
    text = " ".join(str(name or "").split())
    if str(code or "").strip().upper() == "TR" or re.search(r"t[uü]rk(?:ey|iye)", text, re.IGNORECASE):
        return "Türkiye"
    return text or None
