# dap4.py: the small reader for NASA's OPeNDAP "DAP4 data" answers that a one-cell request returns (written 2026-11-14).
# Reads:   the bytes of one answer: a few chunks, the first describing the values, the rest holding them. Nothing is fetched here.
# From:    NASA's OPeNDAP service (the Earthdata Cloud addresses the catalogue gives for each file).
# Returns: {name: value} in the order the answer describes them, plus "_epoch" (the text after "seconds since" of the time variable, or None).
# Checked by: scripts/test_live_imergrain.mjs and scripts/test_live_smaproot.mjs (answers hand-made in the real format).
import re
import struct
from common import SourceDown

SIZES = {"Float32": 4, "Float64": 8, "UInt32": 4, "Int32": 4, "Int16": 2, "UInt16": 2, "Int8": 1, "UInt8": 1}
FORMATS = {"Float32": "f", "Float64": "d", "UInt32": "I", "Int32": "i", "Int16": "h", "UInt16": "H", "Int8": "b", "UInt8": "B"}


def chunks_of(body):
    out, i = [], 0
    while i < len(body):
        if i + 4 > len(body):
            raise SourceDown("NASA's answer was cut short", "http", 0)
        flags, size = body[i], int.from_bytes(body[i + 1:i + 4], "big")
        if flags & 2:   # the service's own error chunk
            raise SourceDown("NASA's data service reported an error", "http", 0, body[i + 4:i + 4 + size])
        if i + 4 + size > len(body):
            raise SourceDown("NASA's answer was cut short", "http", 0)
        out.append((flags, body[i + 4:i + 4 + size]))
        i += 4 + size
    return out


def read_values(body):
    """{name: value} for the single values a one-cell request returns. Refuses anything that does not add up."""
    chunks = chunks_of(body)
    if len(chunks) < 2:
        raise SourceDown("NASA's answer held no values", "http", 0)
    dmr = chunks[0][1].decode("utf-8", "replace")
    names = re.findall(r"<(%s)\s+name=\"([^\"]+)\"" % "|".join(SIZES), dmr)
    data = b"".join(d for _, d in chunks[1:])
    need = sum(SIZES[t] for t, _ in names)
    if not names or len(data) not in (need, need + 4 * len(names)):   # each variable may be followed by its 4-byte check number
        raise SourceDown("NASA's answer did not have the size it described", "http", 0)
    step = 4 if len(data) == need + 4 * len(names) else 0
    order = "<" if chunks[0][0] & 4 else ">"
    out, pos = {}, 0
    for t, n in names:
        out[n] = struct.unpack(order + FORMATS[t], data[pos:pos + SIZES[t]])[0]
        pos += SIZES[t] + step
    block = dmr.split('name="time"', 1)[-1] if 'name="time"' in dmr else ""
    found = re.search(r"seconds since ([0-9T: .\-]+)", block)
    out["_epoch"] = found.group(1).strip() if found else None
    return out
