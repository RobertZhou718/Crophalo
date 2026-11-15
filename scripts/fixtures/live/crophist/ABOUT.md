# Recorded answers for scripts/live/crophist.py

Recorded on 2026-11-15 from the live public services, no login, with `FW_NET_RECORD` (each `.json` beside its `.body`
names the method, the address and the time it was recorded):

- `mead/`: `crophist.py 41.1795 -96.4398 US 1 <the demo field's outline>`: 9 calls to
  `https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer/identify` (one per point, `returnCatalogItems=true`)
  and 9 POSTs to `.../CDL_WM/ImageServer/getSamples` (948 points around the field, one year's raster locked each).
  The outline is `crophalo-work-backup/demo-field-us/field_ring.json` written to 4 decimals.
- `oxford/`: `crophist.py 43.2500 -80.8000 CA 1` (a pin on a farm field in Oxford County, Ontario): the list of years
  `https://agriculture.canada.ca/imagery-images/rest/services/annual_crop_inventory?f=json`, 15 POSTs to
  `.../annual_crop_inventory/{year}/ImageServer/getSamples` for the field (2011 to 2025) and 9 for the 972 points around it.

The suite `scripts/test_crophist.mjs` changes copies of these in a temp folder for the failures; these files are never edited.
