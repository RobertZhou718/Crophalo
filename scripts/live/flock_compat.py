# flock_compat.py: file locks that also work on Windows (written 2026-11-14).
# Reads:   nothing.
# From:    nobody: it only locks files a lookup keeps under FW_CACHE.
# Returns: `fcntl`, to be used as  from flock_compat import fcntl
#          then  fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)  ...  fcntl.flock(file, fcntl.LOCK_UN)
# On a Mac and on Linux `fcntl` is Python's own module. Windows has none, so it gets the small stand-in below.
# What the stand-in can and cannot do (know this before you lean on it):
#   - an exclusive lock (LOCK_EX) is a real lock on the first byte of the file;
#   - a shared lock (LOCK_SH) does NOTHING: Windows has no shared lock here. So a lookup may never remove a file
#     that others may be reading on the strength of "nobody holds the shared lock": on Windows it cannot know;
#   - with LOCK_NB a held lock raises BlockingIOError at once ("busy"); without it Windows waits about 10 s, then raises.
# Checked by: scripts/test_live_common.mjs (the import, and the stand-in driven by a pretend msvcrt).
# NOT checked on a real Windows computer.
import os


def windows_fcntl(msvcrt):
    """The stand-in for `fcntl`, built over Windows' own msvcrt.locking."""

    class Stand_in:
        LOCK_SH, LOCK_EX, LOCK_NB, LOCK_UN = 1, 2, 4, 8

        @staticmethod
        def flock(file, how):
            fd = file if isinstance(file, int) else file.fileno()
            if not how & (Stand_in.LOCK_EX | Stand_in.LOCK_UN):
                return   # a shared lock: nothing to take
            at = os.lseek(fd, 0, os.SEEK_CUR)
            os.lseek(fd, 0, os.SEEK_SET)   # the lock is on byte 0, wherever the reader stands
            try:
                if how & Stand_in.LOCK_UN:
                    try:
                        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
                    except OSError:
                        pass   # it was not locked (a shared "lock" being given back)
                else:
                    try:
                        msvcrt.locking(fd, msvcrt.LK_NBLCK if how & Stand_in.LOCK_NB else msvcrt.LK_LOCK, 1)
                    except OSError:
                        raise BlockingIOError("busy: another lookup holds this file") from None
            finally:
                os.lseek(fd, at, os.SEEK_SET)

    return Stand_in


try:
    import fcntl
except ImportError:   # Windows
    import msvcrt
    fcntl = windows_fcntl(msvcrt)
