# NASA data used by Crophalo

Crophalo uses NASA data. It is not made, reviewed or endorsed by NASA, and it does not use NASA's name or logo as its own.

Every figure in Crophalo that comes from outside carries a small "i" button. It opens a card that says who runs the source, what the figure is, and how to explain it in plain words. NASA figures carry the solid blue "i" and the NASA tag.

## The NASA data, and what Crophalo does with it

### NASA POWER (Prediction Of Worldwide Energy Resources)

- **What it is.** Daily weather for the area around a place, since 2001: air temperature, rain, soil wetness at root depth and the water the land loses to the air. POWER joins satellite observations with NASA's weather models. One square of its grid is about 50 km wide, so a single field can differ from it.
- **What Crophalo does with it.** It reads the daily record for the farmer's field, moves the temperatures to the field's own height, and works out the first and last frost, the heat that crops collect through the season, the rain, and how many of the years tested crossed a stress limit. These figures sit under the recommendation in the field report as the evidence for it.
- **Where the rain comes from.** POWER takes its daily rain from NASA's GPM IMERG satellite rain record where there are enough days, and from the MERRA-2 weather model where there are not. Crophalo says which one it used.
- **Version in use.** POWER Daily API 2.10.3 (checked 14 November 2026). Crophalo asks POWER fresh for each field and does not keep a stored copy.
- **Credit.** Data from the NASA Langley Research Center (LaRC) POWER Project, funded through the NASA Earth Science Division Applied Sciences Program. Following the project's own wording: "The data was obtained from the POWER Project's Daily 2.10.3 version on 2026/11/14." The full credit paragraph is published at https://power.larc.nasa.gov/docs/referencing/
- **More.** https://power.larc.nasa.gov/

### NASA SMAP Level-4 root-zone soil moisture

- **What it is.** How wet the soil is around the roots (the top metre), from a land model that is kept true by measurements from NASA's SMAP satellite. It is given 3-hourly, one value for each square of a 9 km grid.
- **What Crophalo does with it.** It shows the value for the square that holds the field as a regional reading: the figure, its date, and the square drawn on a small picture round the field. It is one value for the whole square. Crophalo never paints it as a pattern inside the field.
- **Good to know.** NSIDC, which distributes the data, says it is reprocessing a stretch of days in the middle of 2026 and will replace them. A value for those days may change.
- **Citation.** Reichle, R., De Lannoy, G., Koster, R. D., Crow, W. T., Kimball, J. S., Liu, Q. & Bechtold, M. (2025). SMAP L4 Global 3-hourly 9 km EASE-Grid Surface and Root Zone Soil Moisture Geophysical Data (SPL4SMGP, Version 8). NASA National Snow and Ice Data Center Distributed Active Archive Center. https://doi.org/10.5067/T5RUATAQREF8
- **More.** https://nsidc.org/data/spl4smgp

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

- Crophalo gives counts, not chances: for example "no stress limit crossed in 26 tested years". It never calls a past record a forecast.
- A regional reading is one value for a square of land. It is not a measurement inside the field.
- A figure that could not be read is shown as "not read yet". Crophalo does not fill it in.
