#!/usr/bin/env python3
# clean_osm_tags.py: takes the tags that name a person or a business out of recorded OpenStreetMap answers (the address, contact, e-mail, phone, fax, website, operator, owner and wiki tags).
# The 3D never needs them, and a recording is committed to a public place. It changes nothing else in the file except that it writes the JSON compact.
# Used by the recorder itself (scripts/live/common.py calls clean_body() for the Overpass lookups, so a new recording can never hold them) and by hand:
#   python3 scripts/clean_osm_tags.py            every osm* and osmextra* recording under scripts/fixtures/live: prints what it took out
# Checked by scripts/test_live_osmextra.mjs (no committed recording holds one of the keys).
import glob
import json
import os
import sys

PRIVATE_KEYS = ("email", "phone", "fax", "website", "url", "operator", "operator:type", "owner", "wikidata", "wikipedia", "brand:wikidata", "brand:wikipedia")
PRIVATE_PREFIXES = ("addr:", "contact:")
NOTE = "Before publishing, the address, e-mail, phone, website and operator tags were taken out of this recorded answer; shapes and the tags the 3D view draws from are unchanged."


def is_private(key):
    return key.startswith(PRIVATE_PREFIXES) or key in PRIVATE_KEYS


def clean_tags(node):
    """Remove the private tags from every element of an Overpass answer (anywhere a "tags" object stands). Returns how many were removed."""
    n = 0
    if isinstance(node, dict):
        tags = node.get("tags")
        if isinstance(tags, dict):
            for k in [k for k in tags if is_private(k)]:
                del tags[k]
                n += 1
        for v in node.values():
            n += clean_tags(v)
    elif isinstance(node, list):
        for v in node:
            n += clean_tags(v)
    return n


def clean_body(body):
    """bytes in, (bytes, removed): the answer without the private tags; a body that is not JSON is handed back as it is."""
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:
        return body, 0
    n = clean_tags(data)
    return (json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8") if n else body), n


def clean_folder(root):
    total = 0
    for path in sorted(glob.glob(os.path.join(root, "osm*", "*.body"))):
        with open(path, "rb") as f:
            body = f.read()
        out, n = clean_body(body)
        meta = path[:-5] + ".json"
        if n:
            with open(path, "wb") as f:
                f.write(out)
        if (n or os.path.exists(meta)) and os.path.exists(meta):
            with open(meta, encoding="utf-8") as f:
                m = json.load(f)
            if n and m.get("edited") != NOTE:
                m["edited"] = NOTE
                with open(meta, "w", encoding="utf-8") as f:
                    f.write(json.dumps(m, indent=1, ensure_ascii=False) + "\n")
        print("%s: removed %d" % (os.path.relpath(path), n))
        total += n
    print("tags removed in all: %d" % total)
    return total


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    clean_folder(sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "fixtures", "live"))
