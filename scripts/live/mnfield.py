# mnfield.py LAT LON MODE CROPS: for one field in the United States, which buyers bid for each crop in USDA AMS Market News grain reports (MARS API v1.2), with the owner's free key only (written 2026-11-15).
# Reads:   the state from the National Weather Service's points answer (kept 30 days, no key); the Market News report list once (for each report's last published date and its section names);
#          the state's own grain report if it is live, else each bordering state's live report in order; a national report (2887, 2914) only for the crops that need one.
# Returns: mode "now": {"ok", "source", "mode", "today", "window", "place", "own", "reports", "crops", "forward", "dropped", "incomplete", "not_checked"} or {"ok": false, "reason", "final"?}.
#          A bid is a price on a day at a place, never income; it never enters a score. The key goes only in the Authorization header; a keyed answer is never recorded and never written to disk.
# Checked by: scripts/test_mnfield.mjs (hand-made stand-ins in the shape of real answers, labelled as not real). The rules and the pure parts: mnlib.py.
import common   # first, always
import base64
import datetime
import json
import urllib.parse

import groundlib
import mnlib
from common import Fail, SourceDown

LIMIT_S = 90
ASK_S = 20
MAX_BYTES = 48000   # the answer stays under 50 kB, with room for what the server adds
API = "https://marsapi.ams.usda.gov/services/v1.2"
SOURCE = "USDA AMS Market News (MARS API v1.2)"
NO_ANSWER = "USDA Market News did not answer just now; try again in a minute"
SLOW = "USDA Market News took too long to answer; try again in a minute"


def ask(path, auth):
    """One Market News request. A refused key stops the lookup; any other failure is SourceDown for the caller to weigh."""
    try:
        return common.http(API + path, headers={"Authorization": auth}, timeout=ASK_S).json()
    except SourceDown as e:
        if e.kind == "http" and e.status in (401, 403):
            raise Fail("USDA Market News did not accept the key set on this server") from None
        raise


def results(body):
    if isinstance(body, list):
        return body
    if isinstance(body, dict) and isinstance(body.get("results"), list):
        return body["results"]
    return []


def section_path(info, ident, query):
    """The address of a report's detail section, its name taken from the report list, never assumed."""
    names = [str(n) for n in (info or {}).get("sectionNames") or []]
    name = "Report Detail" if "Report Detail" in names else None
    if not name:
        return None
    return "/reports/%d/%s?q=%s" % (ident, urllib.parse.quote(name), urllib.parse.quote(query, safe="/:=;"))


def main(args):
    args = list(args) + ["", "", "", ""]
    try:
        lat, lon = float(args[0]), float(args[1])
        if not (str(args[0]).strip() and str(args[1]).strip()) or abs(lat) > 90 or abs(lon) > 180 or lat != lat or lon != lon:
            raise ValueError
    except ValueError:
        raise Fail("lat and lon are required (decimal degrees)", final=True) from None
    mode = str(args[2]).strip()
    if mode in ("hay", "cost", "year"):
        raise Fail("This Market News reading is not on this server yet")
    if mode != "now":
        raise Fail("mode must be now, hay or cost", final=True)
    crops = mnlib.parse_crops(args[3])
    if crops is None:
        raise Fail("crops must be Crophalo crop ids", final=True)

    key = groundlib.keyed("ams", "Local market prices (USDA Market News)")   # before any request: no key, nobody is asked
    auth = "Basic " + base64.b64encode((key + ":").encode()).decode()
    common._secret(auth.split(" ", 1)[1])

    try:
        point = groundlib.nws_point(lat, lon)
    except Fail as e:
        if e.final:
            raise Fail("USDA Market News covers only the United States", final=True) from None
        raise
    state = str(point.get("state") or "").strip().upper()
    if not state:
        raise Fail("USDA Market News covers only the United States", final=True)

    today = common.now().date()
    since = today - datetime.timedelta(days=mnlib.WINDOW["now"])
    since_2914 = today - datetime.timedelta(days=mnlib.WINDOW["now_2914"])
    not_checked = [c for c in crops if c in mnlib.NOT_CHECKED]
    asked = [c for c in crops if c not in mnlib.NOT_CHECKED]
    own_ids, neighbour_ids = mnlib.GRAIN.get(state, ((), ()))
    dropped = mnlib.no_drops()
    answer = {"source": SOURCE, "mode": "now", "today": today.isoformat(), "window": {"from": since.isoformat(), "to": today.isoformat()},
              "place": {"state": state, "state_name": mnlib.STATES.get(state), "county_zone": point.get("county_zone") or None},
              "own": None, "reports": [], "crops": [], "forward": [], "dropped": dropped, "incomplete": False, "not_checked": not_checked,
              "units": "$ per bushel in state reports; $ per hundred pounds in the national reports 2887 and 2914"}

    if not own_ids and not neighbour_ids:   # no grain report for the state or a neighbour: nothing is asked, every crop is not read
        answer["crops"] = [mnlib.empty_entry(c, "not_read", None) for c in asked]
        answer["data_date"] = "%s/%s" % (since.isoformat(), today.isoformat())
        return answer

    try:
        listed = {str(r.get("slug_id")): r for r in results(ask("/reports", auth)) if isinstance(r, dict)}
    except SourceDown as e:
        raise Fail(SLOW if e.kind == "timeout" else NO_ANSWER) from None

    reports = []   # in the order tried

    def report(ident, role, st):
        info = listed.get(str(ident))
        published = mnlib.day((info or {}).get("published_date"))
        rep = {"id": ident, "title": (info or {}).get("report_title") or None, "published": published.isoformat() if published else None,
               "live": mnlib.live(published, today), "role": role, "state": st, "co_publisher": mnlib.CO_PUBLISHER.get(ident),
               "read": False, "rows_kept": None, "_info": info, "_kept": None, "_failed": False}
        reports.append(rep)
        return rep

    def read(rep, query, national):
        """Ask one live report; its kept rows, or None when it failed."""
        rep["read"] = True
        where = section_path(rep["_info"], rep["id"], query)
        try:
            if not where:
                raise SourceDown("the report list names no detail section for this report", "http", 200)
            rows = results(ask(where, auth))
        except SourceDown as e:
            common.log("report %s was not read: %s" % (rep["id"], e))
            rep["_failed"] = True
            answer["incomplete"] = True
            return None
        kept = mnlib.keep_rows(rows, today, national, dropped)
        rep["rows_kept"] = (rep["rows_kept"] or 0) + len(kept)
        return kept

    window = "report_begin_date=%s:%s" % (mnlib.mmddyyyy(since), mnlib.mmddyyyy(today))
    own = [report(i, "own", state) for i in own_ids]
    answer["own"] = {k: own[0][k] for k in ("id", "title", "published", "live")} if own else None
    state_reps = [r for r in own if r["live"]]
    role = "own"
    if not state_reps:
        role = "neighbour"
        state_reps = [report(i, "neighbour", next((s for s, (o, _n) in mnlib.GRAIN.items() if i in o), None)) for i in neighbour_ids]

    def wanted_from_state():
        return [c for c in asked if mnlib.name_of(c)]

    found = {}   # crop -> (report, rows)
    for rep in state_reps:
        if not rep["live"]:
            continue
        if role == "neighbour" and any(r["read"] and r["_kept"] for r in state_reps) and all(c in found for c in wanted_from_state()):
            continue   # every crop asked is found already: the next neighbour is not asked
        kept = read(rep, window, False)
        rep["_kept"] = kept
        if not kept:
            continue
        for c in wanted_from_state():
            if c in found:
                continue
            _where, commodity, want, refuse = mnlib.name_of(c)
            rows = mnlib.rows_for(kept, commodity, want, refuse)
            if rows:
                found[c] = (rep, rows)

    entries = {}
    for c, (rep, rows) in found.items():
        entries[c] = dict(mnlib.empty_entry(c, rep["role"], rep["id"]), **mnlib.trim(rows, today, False))

    # crops the state reports bid for that the page did not ask for (the Layers card asks for none)
    names_asked = {mnlib.name_of(c)[1] for c in asked if mnlib.name_of(c)}
    for rep in state_reps:
        for commodity in dict.fromkeys(r.get("commodity") for r in rep["_kept"] or []):
            c = mnlib.FOUND_AS.get(commodity)
            if c and commodity not in names_asked and c not in entries:
                rows = mnlib.rows_for(rep["_kept"], commodity, None, None)
                entries[c] = dict(mnlib.empty_entry(c, rep["role"], rep["id"]), **mnlib.trim(rows, today, False))
                names_asked.add(commodity)

    # the national reports, one request per commodity, only for crops still without a buyer
    national_reps, national_rows = {}, {}
    for c in asked:
        n = mnlib.name_of(c)
        if c in entries or not n or n[0] not in mnlib.NATIONAL:
            continue
        ident, commodity = n[0], n[1]
        if ident not in national_reps:
            national_reps[ident] = report(ident, "national", None)
        rep = national_reps[ident]
        if not rep["live"]:
            continue
        if (ident, commodity) not in national_rows:
            start = since_2914 if ident == 2914 else since
            query = "report_begin_date=%s:%s;commodity=%s" % (mnlib.mmddyyyy(start), mnlib.mmddyyyy(today), commodity)
            kept = read(rep, query, True)
            national_rows[(ident, commodity)] = kept
            rep["_kept"] = (rep["_kept"] or []) + (kept or [])
        kept = national_rows[(ident, commodity)]
        rows = mnlib.rows_for(kept or [], commodity, n[2], n[3])
        if rows:
            e = dict(mnlib.empty_entry(c, "far", ident), **mnlib.trim(rows, today, True))
            entries[c] = e

    # every asked crop that is still without a line: none found, or not read when a report that would carry it was not read
    for c in asked:
        if c in entries:
            continue
        n = mnlib.name_of(c)
        if not n:
            entries[c] = mnlib.empty_entry(c, "none_found", None)
            continue
        # the reports that would carry it: the live state reports for a state crop, the national report for the others
        if n[0] in mnlib.NATIONAL:   # the national report was asked for this commodity alone: its own rows decide
            home = national_reps.get(n[0])
            carriers = [home] if home and home["live"] else []
            fallback = n[0]
            unread = carriers if carriers and not national_rows.get((n[0], n[1])) else []
        else:
            carriers = [r for r in state_reps if r["live"]]
            fallback = (own or state_reps)[0]["id"] if (own or state_reps) else None
            unread = [r for r in carriers if not r["read"] or r["_failed"] or not r["_kept"]]
        if not carriers:
            entries[c] = mnlib.empty_entry(c, "not_read", fallback)
        elif unread:
            entries[c] = mnlib.empty_entry(c, "not_read", unread[0]["id"])
        else:
            entries[c] = mnlib.empty_entry(c, "none_found", None)

    for e in entries.values():
        if e["status"] != "far":
            e["places"] = []
    answer["crops"] = [entries[c] for c in sorted(entries)]
    answer["reports"] = [{k: v for k, v in r.items() if not k.startswith("_")} for r in reports]
    dates = [e["report_date"] for e in answer["crops"] if e["report_date"]]
    answer["data_date"] = max(dates) if dates else "%s/%s" % (since.isoformat(), today.isoformat())
    if len(json.dumps(answer, separators=(",", ":"), ensure_ascii=False).encode("utf-8")) > MAX_BYTES:   # show less, never a cut list
        raise Fail("USDA Market News sent more bids than this page can show")
    return answer


common.run(main, LIMIT_S, slow=SLOW)
