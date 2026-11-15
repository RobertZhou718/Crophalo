# orbits.py (no arguments): the orbital elements of the satellites whose data Crophalo reads, for the turning Earth on the home.
# Reads:   CelesTrak's GP data: the U.S. Space Force's newest element set for each satellite (from Space-Track.org), as the
#          OMM fields in JSON, one small request per satellite, a second or more apart. No login, no key.
# From:    https://celestrak.org/NORAD/elements/gp.php?CATNR={number}&FORMAT=JSON (CelesTrak looks for new sets every 2 hours).
# Returns: {"ok": true, "source", "credit", "data_date", "units", "satellites": [{"norad", "name", "epoch", "asked", "omm"}],
#           "missing": [{"norad", "name", "reason"}], "requests", ("incomplete"), ("stale", "note")} or {"ok": false, "reason"}.
#          The contract: README.md, section "orbits". The browser works the positions out itself (SGP4, js/home-sats.js).
# Checked by: scripts/test_live_orbits.mjs (offline, on the 13 answers recorded from CelesTrak on 15 November 2026 UTC).
# Keeps each satellite's last good element set under FW_CACHE/orbits (source files, never answers), and after an answer
# that is not 200 it asks CelesTrak nothing for 2 hours, as CelesTrak's usage policy asks.
import common   # first, always: it takes stdout away from every library
import datetime
import json
import re
import time
from pathlib import Path
from common import Fail, SourceDown

LIMIT_S = 90   # the server's time limit for this lookup
URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR=%d&FORMAT=JSON"
# NORAD catalogue number -> the name CelesTrak gives it. The same thirteen, in the same order, as js/home-sats-data.js.
SATELLITES = [
    (25994, "TERRA"), (43013, "NOAA 20 (JPSS-1)"), (54234, "NOAA 21 (JPSS-2)"), (40376, "SMAP"), (39574, "GPM-CORE"),
    (43476, "GRACE-FO 1"), (43477, "GRACE-FO 2"), (39084, "LANDSAT 8"), (49260, "LANDSAT 9"), (40697, "SENTINEL-2A"),
    (42063, "SENTINEL-2B"), (60989, "SENTINEL-2C"), (25544, "ISS (ZARYA)"),
]
FRESH_S = 2 * 3600    # a set read less than 2 hours ago is not asked for again: CelesTrak has nothing newer yet
QUIET_S = 2 * 3600    # after an answer that is not 200, CelesTrak is asked nothing for 2 hours
OLD_DAYS = 14         # a set older than this is not handed out: its positions could be hundreds of km off
APART_S = 1.0         # between two requests to CelesTrak
ONE_S = 20            # the longest one request may take
SOURCE = "CelesTrak GP data: the U.S. Space Force's newest orbital element set for each satellite (Space-Track.org), for SGP4"
CREDIT = "Orbits: U.S. Space Force (Space-Track.org), via CelesTrak."
UNITS = ("Orbital elements as CCSDS OMM fields: degrees, revolutions a day, BSTAR in 1/Earth radii, EPOCH in UTC; "
         "the positions are worked out from them with SGP4")
EPOCH = re.compile(r"(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?Z?")
# field -> (low, high) for the numbers SGP4 reads; all thirteen are near-Earth orbits of 90 to 105 minutes
RANGES = {"MEAN_MOTION": (11.0, 17.0), "ECCENTRICITY": (0.0, 0.05), "INCLINATION": (0.0, 180.0), "RA_OF_ASC_NODE": (0.0, 360.0),
          "ARG_OF_PERICENTER": (0.0, 360.0), "MEAN_ANOMALY": (0.0, 360.0), "BSTAR": (-1.0, 1.0), "MEAN_MOTION_DOT": (-1.0, 1.0),
          "MEAN_MOTION_DDOT": (-1.0, 1.0)}
WHOLE = ("NORAD_CAT_ID", "ELEMENT_SET_NO", "REV_AT_EPOCH", "EPHEMERIS_TYPE")


def epoch_of(text):
    """CelesTrak's EPOCH ('2026-11-14T08:49:22.988352', UTC) as a datetime, or None. Cut to the millisecond, as a browser reads it."""
    m = EPOCH.fullmatch(str(text or "").strip())
    if not m:
        return None
    y, mo, d, h, mi, s, frac = m.groups()
    try:
        return datetime.datetime(int(y), int(mo), int(d), int(h), int(mi), int(s), int((frac or "0").ljust(6, "0")[:3]) * 1000,
                                 tzinfo=datetime.timezone.utc)
    except ValueError:
        return None


def iso_ms(when):
    return when.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (when.microsecond // 1000)


def checked_set(raw, norad):
    """One element set as CelesTrak sends it, checked field by field; the 17 OMM fields, or a Fail in plain words."""
    rows = raw if isinstance(raw, list) else [raw]
    if len(rows) != 1 or not isinstance(rows[0], dict):
        raise Fail("CelesTrak sent no single element set for it")
    r, out = rows[0], {}
    if r.get("NORAD_CAT_ID") != norad:
        raise Fail("CelesTrak's answer was for another catalogue number")
    for field in WHOLE:
        v = r.get(field)
        if isinstance(v, bool) or not isinstance(v, int) or v < 0:
            raise Fail("its %s is not a whole number" % field)
        out[field] = v
    if out["EPHEMERIS_TYPE"] != 0:
        raise Fail("its element set is not of the SGP4 kind")
    for field, (lo, hi) in RANGES.items():
        v = r.get(field)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or not lo <= v <= hi:
            raise Fail("its %s is missing or out of range" % field)
        out[field] = v
    if r.get("CLASSIFICATION_TYPE") != "U":
        raise Fail("its element set is not marked as public (U)")
    out["CLASSIFICATION_TYPE"] = "U"
    for field in ("OBJECT_NAME", "OBJECT_ID"):
        v = r.get(field)
        if not isinstance(v, str) or not 1 <= len(v.strip()) <= 40:
            raise Fail("its %s is missing" % field)
        out[field] = v.strip()
    if not epoch_of(r.get("EPOCH")):
        raise Fail("its EPOCH is not a time")
    out["EPOCH"] = str(r["EPOCH"]).strip()
    return out


# ---- the kept sets and the quiet time, under FW_CACHE/orbits
def folder():
    return common.cache_dir("orbits")


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def kept(norad):
    """{'asked': datetime, 'omm': {...}} as kept from the last good answer, or None."""
    got = read_json(folder() / ("%d.json" % norad))
    try:
        asked = datetime.datetime.strptime(got["asked"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
        return {"asked": asked, "omm": checked_set(got["omm"], norad)}
    except (TypeError, KeyError, ValueError, Fail):
        return None


def keep(norad, omm, asked):
    common.atomic_write(folder() / ("%d.json" % norad), json.dumps({"asked": asked.strftime("%Y-%m-%dT%H:%M:%SZ"), "omm": omm}).encode("utf-8"))


def quiet_until():
    got = read_json(folder() / "quiet.json")
    try:
        return datetime.datetime.strptime(got["until"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
    except (TypeError, KeyError, ValueError):
        return None


def go_quiet(now, why):
    until = now + datetime.timedelta(seconds=QUIET_S)
    common.atomic_write(folder() / "quiet.json", json.dumps({"until": until.strftime("%Y-%m-%dT%H:%M:%SZ"), "why": why}).encode("utf-8"))
    return until


# ---- one request
def ask(norad):
    """The element set CelesTrak has now, checked. SourceDown for anything but a readable 200 (the round then stops)."""
    t = ONE_S if common.left() is None else min(ONE_S, common.left() - 8)
    if t < 3:
        raise SourceDown("no time left to ask CelesTrak", "timeout")
    reply = common.http(URL % norad, timeout=t, tries=1)   # one try: CelesTrak asks to stop at the first answer that is not 200
    text = reply.text().strip()
    if not text.startswith("["):   # "No GP data found" is CelesTrak's plain answer for a number it does not have
        raise Fail("CelesTrak has no element set for it")
    try:
        raw = json.loads(text)
    except ValueError:
        raise SourceDown("CelesTrak's answer could not be read as JSON", "http", reply.status) from None
    return checked_set(raw, norad)


def main(args):
    if args:
        raise Fail("This lookup takes no arguments")
    now = common.now()
    quiet = quiet_until()
    asking = not (quiet and now < quiet)
    sets, missing, refused, requests, stopped, late = {}, [], {}, 0, None, False
    for norad, name in SATELLITES:
        have = kept(norad)
        fresh = have and (now - have["asked"]).total_seconds() < FRESH_S
        late = late or (common.left() is not None and common.left() < 12)   # our own time is up: stop asking, with no quiet time
        if asking and not stopped and not late and not fresh:
            if requests and not common.REPLAY:
                time.sleep(APART_S)
            requests += 1
            try:
                sets[norad] = {"asked": now, "omm": ask(norad), "new": True}
                keep(norad, sets[norad]["omm"], now)
                continue
            except Fail as e:   # a readable answer that holds no usable set: the kept one stays, the round goes on
                refused[norad] = "CelesTrak's element set could not be used: " + e.reason
            except SourceDown as e:   # anything but a readable 200: no more requests this round, and none for 2 hours
                common.log("CelesTrak did not answer for", norad, ":", e)
                stopped = go_quiet(now, str(e))
        if have:
            sets[norad] = {"asked": have["asked"], "omm": have["omm"], "new": False}
        else:
            missing.append({"norad": norad, "name": name, "reason": refused.get(norad) or "CelesTrak could not be asked for it just now"})
    out, newest = [], None
    for norad, name in SATELLITES:
        got = sets.get(norad)
        if not got:
            continue
        epoch = epoch_of(got["omm"]["EPOCH"])
        if (now - epoch).total_seconds() > OLD_DAYS * 86400:
            missing.append({"norad": norad, "name": name, "reason": "its newest element set is more than %d days old" % OLD_DAYS})
            continue
        newest = epoch if newest is None or epoch > newest else newest
        out.append({"norad": norad, "name": got["omm"]["OBJECT_NAME"], "epoch": iso_ms(epoch),
                    "asked": got["asked"].strftime("%Y-%m-%dT%H:%M:%SZ"), "omm": got["omm"]})
    if not out:
        raise Fail("The satellites' orbits could not be read just now; try again in a while")
    missing.sort(key=lambda m: [n for n, _ in SATELLITES].index(m["norad"]))
    answer = {"source": SOURCE, "credit": CREDIT, "data_date": newest.strftime("%Y-%m-%d"), "units": UNITS, "satellites": out,
              "missing": missing, "requests": requests}
    if missing:
        answer["incomplete"] = "%d of %d satellites have no element set in this answer" % (len(missing), len(SATELLITES))
    old = [s for s in out if not sets[s["norad"]]["new"] and (now - sets[s["norad"]]["asked"]).total_seconds() >= FRESH_S]
    if old:
        answer["stale"] = True
        answer["note"] = ("CelesTrak could not be asked for %d of them just now, so their element sets are the ones read before, "
                          "each with its own epoch" % len(old))
    if stopped or not asking:
        answer["next_ask"] = (stopped or quiet).strftime("%Y-%m-%dT%H:%M:%SZ")
    return answer


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow="CelesTrak took too long to answer; the satellites' orbits will be asked for again later")
