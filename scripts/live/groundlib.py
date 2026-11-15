# groundlib.py: what the market lookup (mnfield.py) and any other keyed lookup share: the optional keys, small kept files and the National Weather Service's points answer. Not a lookup itself: it is imported after common.
# The optional keys and settings are read here and only here: first from the host's settings (environment), then from one small file per service in the folder's .secrets/ (git ignores it; mode 600).
# A key is registered with common's scrubber the moment it is read, so it can never reach an answer or the log; it never goes into an address the browser sees, and a keyed answer is never recorded.
import json
import os
import stat
import time
from pathlib import Path

import common
from common import Fail, SourceDown

ROOT = Path(__file__).resolve().parents[2]
# setting -> (the files in .secrets/, first found wins; the host's setting). The first file name is the one to use; the others are read too, so a key saved before keeps working. The same names as scripts/keys.mjs.
SETTINGS = {
    "nass": (("nass-quickstats.key", "nass-key"), "CROPHALO_NASS_KEY"),          # USDA NASS Quick Stats, the owner's free key
    "ams": (("ams-marketnews.key", "ams-key"), "CROPHALO_AMS_KEY"),             # USDA AMS My Market News (MARS API), the owner's free key
    "openet": (("openet.key", "openet-key"), "CROPHALO_OPENET_KEY"),            # OpenET, the owner's free key
    "openet_on": (("openet-on",), "CROPHALO_OPENET_ON"),        # the word "yes" when the site owner has switched OpenET on (the owner's own choice)
    "metno": (("metno-identity",), "CROPHALO_METNO_IDENTITY"),                 # the site's address and a contact address, after the owner accepted MET Norway's terms
}


def secrets_dir():
    return Path(os.environ.get("CROPHALO_SECRETS_DIR") or ROOT / ".secrets")


def setting(name):
    """The value of one setting, or None. Never logged, never returned to the page."""
    file_names, env_name = SETTINGS[name]
    value = (os.environ.get(env_name) or "").strip()
    for file_name in file_names if not value else ():
        path = secrets_dir() / file_name
        try:
            if os.name == "posix" and path.stat().st_mode & (stat.S_IRWXG | stat.S_IRWXO):
                common.log("a file in .secrets can be read by other users of this computer; make it mode 600")
            value = path.read_text(encoding="utf-8").strip()
        except OSError:
            value = ""
        if value:
            break
    if value:
        common._secret(value)   # from now on the scrubber replaces it everywhere
    return value or None


def keys_status():
    """Yes or no for each optional source. openet is yes only with the key AND the owner's own switch."""
    on = (setting("openet_on") or "").lower() == "yes"
    return {"nass": bool(setting("nass")), "ams": bool(setting("ams")), "openet": bool(setting("openet")) and on, "openetOn": on, "metno": bool(setting("metno"))}


def keyed(name, words):
    """The key for a keyed lookup, or a plain failure. A keyed answer is never recorded (its address or headers hold the key)."""
    if common.RECORD:
        raise Fail("A keyed source is never recorded; run this lookup without FW_NET_RECORD")
    key = setting(name)
    if not key:
        raise Fail("%s are not set up on this server (the owner's free key is not set)" % words)
    return key


def user_agent():
    """common's honest name, and the site's own address and contact once the owner has set them (MET Norway asks for them)."""
    who = setting("metno")
    return "%s %s" % (common.USER_AGENT, who) if who else common.USER_AGENT


# ---- small kept files under FW_CACHE (source answers, never a keyed one)
def kept(folder, name, max_s):
    path = common.cache_dir(folder) / name
    try:
        if max_s is None or time.time() - path.stat().st_mtime < max_s:
            return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    return None


def keep(folder, name, data):
    common.atomic_write(common.cache_dir(folder) / name, json.dumps(data, ensure_ascii=False).encode("utf-8"))


# ---- the National Weather Service's points answer: the forecast grid and the county of a place (kept 30 days: the grid of a place changes rarely)
NWS = "https://api.weather.gov"


def nws_point(lat, lon):
    name = "point_%.4f_%.4f.json" % (lat, lon)
    hit = kept("nws", name, 30 * 86400)
    if hit:
        return hit
    try:
        reply = common.http("%s/points/%.4f,%.4f" % (NWS, lat, lon), headers={"User-Agent": user_agent(), "Accept": "application/geo+json"}, timeout=20)
    except SourceDown as e:
        if e.kind == "http" and e.status == 404:
            raise Fail("The National Weather Service has no forecast for this place (it covers the United States)", final=True) from None
        raise
    p = reply.json().get("properties") or {}
    county = str(p.get("county") or "").rsplit("/", 1)[-1]   # a county zone such as NEC155: the state's letters, C, and the county's FIPS number
    out = {"office": p.get("gridId"), "x": p.get("gridX"), "y": p.get("gridY"), "forecast": p.get("forecast"), "county_zone": county,
           "state": (p.get("relativeLocation") or {}).get("properties", {}).get("state"), "time_zone": p.get("timeZone")}
    if not out["forecast"] or not str(out["forecast"]).startswith(NWS + "/"):
        raise Fail("The National Weather Service gave no forecast address for this place")
    keep("nws", name, out)
    return out
