---
recovered: README.md:23, README.md:37
---
# Host-provided peers keep "*" ranges

Pi supplies `@earendil-works/pi-coding-agent`, `pi-tui` and `typebox` to loaded extensions, so their peer ranges stay `"*"` and the validated baseline lives in devDependencies and package-lock.json. Narrowing them would risk a second copy of the host packages or refuse a newer host.
