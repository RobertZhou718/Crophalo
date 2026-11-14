# NASA data used by Crophalo

Crophalo uses NASA data. It is not made, reviewed or endorsed by NASA, and it does not use NASA's name or logo as its own.

Every figure in Crophalo that comes from outside carries a small "i" button. It opens a card that says who runs the source, what the figure is, and how to explain it in plain words. NASA figures carry the solid blue "i" and the NASA tag.

## The NASA data, and what Crophalo does with it

On screen today: NASA POWER (the report, the Weather and Calendar tabs) and NASA SMAP (the regional reading on the Weather tab). The Satellites tab, which is to show the GPM IMERG daily rain, GRACE, ECOSTRESS and HLS sections below, is not built yet.

### NASA POWER (Prediction Of Worldwide Energy Resources)

- **What it is.** Daily weather for the area around a place, since 2001: air temperature, rain, soil wetness at root depth and the water the land loses to the air. POWER joins satellite observations with NASA's weather models. One square of its grid is about 50 km wide, so a single field can differ from it.
- **What Crophalo does with it.** It reads the daily record for the farmer's field, moves the temperatures to the field's own height, and works out the first and last frost, the heat that crops collect through the season, the rain, and how many of the years tested crossed a stress limit. These figures sit under the recommendation in the field report as the evidence for it.
- **Where the rain comes from.** POWER takes its daily rain from NASA's GPM IMERG satellite rain record where there are enough days, and from the MERRA-2 weather model where there are not. Crophalo says which one it used.
- **Version in use.** POWER Daily API 2.10.3 (checked 14 November 2026). Crophalo asks POWER fresh for each field and does not keep a stored copy.
- **Credit.** Data from the NASA Langley Research Center (LaRC) POWER Project, funded through the NASA Earth Science Division Applied Sciences Program. Following the project's own wording: "The data was obtained from the POWER Project's Daily 2.10.3 version on 2026/11/14." The full credit paragraph is published at https://power.larc.nasa.gov/docs/referencing/
- **More.** https://power.larc.nasa.gov/

### NASA SMAP Level-4 root-zone soil moisture

- **What it is.** How wet the soil is around the roots (the top metre), from a land model that is kept true by measurements from NASA's SMAP satellite. It is given 3-hourly, one value for each cell of a 9 km grid. The grid keeps every cell the same area, so away from the equator a cell is narrower and taller than a square (at Barrie about 7 km wide and 11 km tall).
- **What Crophalo does with it.** It reads the one cell that holds the field, from the newest file NASA has published (a few days old), and shows it as a regional reading: the figure, its date, and the cell's own outline drawn on a small picture round the field. It is one value for the whole cell. Crophalo never paints it as a pattern inside the field.
- **Good to know.** NSIDC, which distributes the data, says it is reprocessing a stretch of days in the middle of 2026 and will replace them. A value for those days may change.
- **Citation.** Reichle, R., De Lannoy, G., Koster, R. D., Crow, W. T., Kimball, J. S., Liu, Q. & Bechtold, M. (2025). SMAP L4 Global 3-hourly 9 km EASE-Grid Surface and Root Zone Soil Moisture Geophysical Data (SPL4SMGP, Version 8). NASA National Snow and Ice Data Center Distributed Active Archive Center. https://doi.org/10.5067/T5RUATAQREF8
- **More.** https://nsidc.org/data/spl4smgp

### NASA GPM IMERG daily rain (the last 30 days, on the Satellites tab)

- **What it is.** Rain measured from space: the readings of many satellites joined into one rain map, one value a day for each square of 0.1 degree (about 8 by 11 km in Ontario). The Late Run is NASA's final-quality daily product; the Early Run is a first estimate that comes out sooner and may change.
- **What Crophalo does with it.** It reads the one square that holds the field, for each of the last 30 days, from the Late Run, and from the Early Run only for the newest days the Late Run does not have yet. Those days are named as first estimates. A day that could not be read is shown as a gap, never as a dry day, and the total counts only the days that were read. It is one value for a square, not a gauge in the field.
- **Version in use.** GPM IMERG Late and Early Precipitation L3 1 day, version 07 (checked 14 November 2026), from NASA's Goddard Earth Sciences Data and Information Services Center (GES DISC).
- **Credit.** Late Run DOI 10.5067/GPM/IMERGDL/DAY/07; Early Run DOI 10.5067/GPM/IMERGDE/DAY/07.
- **More.** https://gpm.nasa.gov/data/imerg

### NASA GRACE and GRACE-FO groundwater (the water stored in the ground, on the Satellites tab)

- **What it is.** Twin satellites that weigh the water stored in the ground, soil, snow and surface water by how it changes their pull on each other. The JPL mascon record gives one value a month since 2002, as the change in centimetres of water from the 2004 to 2009 average, for a region about 300 km wide.
- **What Crophalo does with it.** It reads the one cell that holds the field, for every month, and shows the newest month with its uncertainty and the long-term trend (only with five or more years). The months with no solution, including the gap between the GRACE and GRACE-FO satellites in 2017 and 2018, are left empty and never joined by a line. It is the water over a whole region, not a well in the field.
- **Version in use.** JPL GRACE and GRACE-FO Mascon, RL06.3Mv04, with the Coastal Resolution Improvement filter (checked 14 November 2026), from NASA's Physical Oceanography DAAC (PO.DAAC).
- **Credit.** DOI 10.5067/TEMSC-3JC634. GRACE is a joint mission of NASA (USA) and DLR (Germany); GRACE-FO is a joint mission of NASA and the German Research Centre for Geosciences (GFZ).
- **More.** https://podaac.jpl.nasa.gov/GRACE-FO

### NASA ECOSTRESS ground temperature (on the Satellites tab)

- **What it is.** A thermal camera on the International Space Station that sees the temperature of the ground surface at about 70 m. It passes at different hours of the day, because the station's orbit drifts through the day.
- **What Crophalo does with it.** It reads the one 70 m pixel that holds the field, in the newest clear passes of the last 60 days. A pixel with cloud, lower quality or water is never used. Each pass names its date and its local solar time, and passes made at different hours are not compared. It is the temperature of the surface, not of the air.
- **Version in use.** ECOSTRESS Tiled Land Surface Temperature and Emissivity Instantaneous L2 Global 70 m, version 003, and version 002 for a pass that version 003 does not have yet (checked 14 November 2026), from NASA's Land Processes DAAC (LP DAAC).
- **Credit.** DOI 10.5067/ECOSTRESS/ECO_L2T_LSTE.003 and 10.5067/ECOSTRESS/ECO_L2T_LSTE.002.
- **More.** https://ecostress.jpl.nasa.gov/

### NASA / USGS Harmonized Landsat and Sentinel-2 greenness (on the Satellites tab)

- **What it is.** Surface reflectance from Landsat 8 and 9 (NASA and USGS) and Sentinel-2 (the European Space Agency), made to match each other, at 30 m. Crophalo works out NDVI, a measure of how green the plants look, from the red and near-infrared bands.
- **What Crophalo does with it.** It reads a box of 3 by 3 dots (90 m) round the field's pin and takes, for each 15-day period of the last 12 months, the clearest pass. A dot with cloud, cloud shadow, snow or water is never counted as low greenness; a period with no clear pass is left empty. It is the greenness of the dots in that small box, not of the whole farm.
- **Version in use.** HLS Sentinel-2 (HLSS30) and Landsat (HLSL30) Surface Reflectance Daily Global 30 m, version 2.0 (checked 14 November 2026), from NASA's Land Processes DAAC (LP DAAC).
- **Credit.** DOI 10.5067/HLS/HLSS30.002 and 10.5067/HLS/HLSL30.002.
- **More.** https://lpdaac.usgs.gov/products/hlss30v002/

## Other data and tools Crophalo uses

These are not NASA's. They are listed because the contest asks for every source and tool to be named.

| Source | What for | Who runs it |
|---|---|---|
| Open-Meteo forecast and ERA5 weather record | The forecast on the spot card, and a second weather record where NASA's has gaps | Open-Meteo.com, from national weather services and ECMWF |
| ISRIC SoilGrids | A first guess at the soil where there is no soil test | ISRIC, World Soil Information |
| FAOSTAT | What crops each country grows | Food and Agriculture Organization of the United Nations |
| MapSPAM 2020 | Where crops are grown near the field | International Food Policy Research Institute |
| Esri World Imagery | The satellite photograph under the map | Esri and its imagery partners |
| OpenStreetMap, through Nominatim | Looking up a place name | OpenStreetMap contributors |
| Leaflet, MapLibre GL JS, three.js | The map and the 3D view | Their open-source authors |
| axe-core | Checking the pages for accessibility (tests only; it is not part of the app) | Deque Systems |

Each of these has its own terms of use. The "i" card for a figure names its source and links to it.

## What Crophalo does not claim

- Crophalo gives counts, not chances: for example "no stress limit crossed in 17 of 25 tested years", with the years named. It never calls a past record a forecast.
- A regional reading is one value for a whole cell of land, not a measurement inside the field.
- A figure that could not be read is shown as "not read yet". Crophalo does not fill it in.
