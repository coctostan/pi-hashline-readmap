---
from: chat 2026-10-31, shaping pi-1-4-host (Pi 1.4.0 is the one tested host)
---
# One tested host

The extension is tested against one Pi host: the version `package-lock.json` locks, kept at Pi's latest release. Hosts older than the lock are unsupported, and no lane keeps them working. `PI_COMPAT_HOST` selects another install for a trial run before the lock moves. It never adds a second required lane. Peer ranges stay `"*"` under 0003, which concerns duplicate host packages, not support.
