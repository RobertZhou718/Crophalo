# vendor

The three libraries the app uses, kept inside the folder: Leaflet 1.9.4 (`leaflet/`), MapLibre GL JS 4.7.1 with its Leaflet plugin (`maplibre/`) and three.js r160 (`three/`), each with its licence file and a `VERSION.json` that lists where every file came from and its checksum.
The app never loads a library from an outside address: the browser gets these files from the Crophalo server, like every other file.
To fetch them once, checked against their published checksums: `node scripts/vendor.mjs`. To verify what is here without downloading anything: `node scripts/vendor.mjs --check`.
The same command also fetches the accessibility checker that only the tests use, into `scripts/vendor-test/`; the app never loads it.
