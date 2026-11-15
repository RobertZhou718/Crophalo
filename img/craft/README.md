# Spacecraft pictures on the home

Six small WebP pictures (640 x 360, 66,120 bytes in all) shown in the satellite card when a visitor points at a satellite. They are not covered by the code's Apache-2.0 licence. Made with the commands at the foot of this page (ImageMagick with WebP, run in bash) from the publishers' own files (cut-out, crop or re-encode only; nothing is painted).

| File | Owner | Credit shown | Source page | Original file | Publisher's words | Read |
|---|---|---|---|---|---|---|
| terra.webp | NASA | Picture: NASA (NASA 3D Resources model). | https://science.nasa.gov/3d-resources/terra/ | model preview PNG 1280 x 720, 390,847 B | "All of these assets are free to download and use." (https://science.nasa.gov/3d-resources/); "NASA should be acknowledged as the source of the material." (https://www.nasa.gov/nasa-brand-center/images-and-media/) | 15 November 2026 |
| gpm.webp | NASA | Picture: NASA (NASA 3D Resources model). | https://science.nasa.gov/3d-resources/global-precipitation-measurement/ | model preview PNG 1280 x 720, 371,585 B | as above | 15 November 2026 |
| landsat8.webp | NASA | Picture: NASA (NASA 3D Resources model). Also shown for Landsat 9, with that said. | https://science.nasa.gov/3d-resources/landsat-8/ | model preview PNG 1280 x 720, 471,076 B | as above | 15 November 2026 |
| iss.webp | NASA | Picture: NASA (NASA 3D Resources model of the Space Station). | https://science.nasa.gov/3d-resources/international-space-station-iss-b/ | model preview PNG 1280 x 720, 239,896 B | as above | 15 November 2026 |
| smap.webp | NASA/JPL-Caltech | Artist's concept. Courtesy NASA/JPL-Caltech. | https://science.nasa.gov/photojournal/nasas-soil-moisture-active-passive-smap-artist-concept/ (PIA17898) | https://images-assets.nasa.gov/image/PIA17898/PIA17898~small.jpg, JPEG 640 x 640, 47,711 B | JPL Image Use Policy, https://www.jpl.nasa.gov/jpl-image-use-policy/, read 15 November 2026 | 15 November 2026 |
| gracefo.webp | NASA/JPL-Caltech | Artist's concept. Courtesy NASA/JPL-Caltech. Both craft are shown; not to scale. | https://science.nasa.gov/photojournal/grace-follow-on-satellites-artists-concept-2/ (PIA22441) | https://images-assets.nasa.gov/image/PIA22441/PIA22441~small.jpg, JPEG 640 x 360, 26,098 B | as SMAP | 15 November 2026 |

No logo, insignia, flag or mission patch appears in these pictures (each checked at 2x). The NASA insignia, the NASA logotype and the JPL logo are not shown. The model pages name a person after "NASA/"; the credit is "NASA" alone, as no personal names are shown.

Checked on 15 November 2026: NASA's own record of both artist's pictures (PIA17898, PIA22441) gives the credit "NASA/JPL-Caltech" and names no other owner, so the policy's standard credit line is used. The SMAP picture was looked at at full size (1920 px): no NASA insignia, no NASA logotype and no JPL logo; the round mark on the front GRACE-FO craft is a metal opening, not an emblem.

NOAA-20, NOAA-21 and Sentinel-2 have no picture of theirs here. Their cards show a DRAWING made by Crophalo (js/home-craft-art.js): a spacecraft with a body, one large solar wing on a boom, instruments and a dish, in the style of the pictures beside it, with the caption "Drawing: Crophalo, a simplified picture of the craft; not the agency's picture and not to scale." The pictures NOAA, NASA and ESA publish of these craft were not used: their use words were not read and written down in the time, so nothing of theirs is copied. When a licence is read and found clear (NOAA and NASA pictures are US government work; ESA's Sentinel-2 picture is ESA standard licence or CC BY-SA 3.0 IGO with a credit line) the picture can replace the drawing and its row goes in this file.

Crophalo is not made, reviewed or endorsed by NASA, ESA or NOAA.

These rows also belong in the project's licence and sources documents (a section "Spacecraft pictures on the home").

## How the six files were made

```bash
#!/bin/bash
# Makes the six spacecraft pictures for the home's satellite card, from the publishers' own files.
# Usage: bash make-craft.sh <folder with the downloaded sources> <output folder>
# Needs ImageMagick 6 with WebP (convert -list format | grep WEBP). Every step is a plain resize, cut-out or crop; nothing is painted.
# Sources (download each once, see SPEC.md section 3):
#   terra.png  gpm.png  landsat8.png  iss-b.png   NASA 3D Resources model previews, 1280 x 720 PNG, white background
#   PIA17898~small.jpg  PIA22441~small.jpg        NASA image library files of the two JPL artist's concepts
set -euo pipefail
IN="$1"; OUT="$2"; mkdir -p "$OUT"
Q=(-strip -define webp:alpha-quality=70 -quality "${QUALITY:-64}")
CUT=(-alpha set -fuzz 4% -fill none -draw "color 0,0 floodfill" -draw "color 1279,0 floodfill" -draw "color 0,719 floodfill" -draw "color 1279,719 floodfill")
ERODE=(-channel A -morphology Erode Disk:1 +channel)            # takes off the 1 px light fringe left by the white background
FIT=(-trim +repage -resize 600x300 -background none -gravity center -extent 640x340 -gravity north -extent 640x360)   # craft fitted, 20 px above the bottom, so the window's Earth edge shows under it

# Terra: NASA's own framing kept (no trim), so the wing runs off the left edge of the frame and the body is whole on the right
convert "$IN/terra.png" "${CUT[@]}" -draw "color 640,0 floodfill" "${ERODE[@]}" -resize 640x360 "${Q[@]}" "$OUT/terra.webp"
convert "$IN/gpm.png" "${CUT[@]}" "${ERODE[@]}" "${FIT[@]}" "${Q[@]}" "$OUT/gpm.webp"
convert "$IN/landsat8.png" "${CUT[@]}" "${ERODE[@]}" "${FIT[@]}" "${Q[@]}" "$OUT/landsat8.webp"
# The Station: the white seen through the gaps between the solar blankets is background too
convert "$IN/iss-b.png" "${CUT[@]}" -fuzz 1.5% -transparent white "${ERODE[@]}" "${FIT[@]}" "${Q[@]}" "$OUT/iss.webp"
# SMAP: from the dish to the Earth below the craft, on black at the sides (the window's sides fade to black over it)
convert "$IN/PIA17898~small.jpg" -crop 640x500+0+50 +repage -resize x360 -background black -gravity center -extent 640x360 -strip -quality "${QUALITY:-64}" "$OUT/smap.webp"
# GRACE-FO: the 640 x 360 library file as it is
convert "$IN/PIA22441~small.jpg" -strip -quality "${QUALITY:-64}" "$OUT/gracefo.webp"

ls -l "$OUT"/*.webp
echo "total bytes: $(cat "$OUT"/terra.webp "$OUT"/gpm.webp "$OUT"/landsat8.webp "$OUT"/iss.webp "$OUT"/smap.webp "$OUT"/gracefo.webp | wc -c)"
```

The home's own Earth pictures (img/earth/) are listed in img/earth/README.md and follow the same terms: NASA imagery, used with credit.


## NOAA-20, NOAA-21 and Sentinel-2: why a drawing and not a picture (read 15 November 2026)
- NOAA's JPSS pictures (NESDIS galleries "JPSS-2 beauty renders"): each artist's rendition carries "Artist's renditions credit: Lamont W. Harvey", a named artist, not NOAA. A NASA release gives the same credit. NOAA's own image-use words were not found on those pages, and one listing says "Public Domain" for a different (Orbital ATK) photograph. So the right to use a render is not clear from what is published: not used.
- ESA's pictures (esa.int/ESA_Multimedia/Terms_and_Conditions and Copyright_Notice_Images): the ESA copyright must always be credited; only SOME images carry CC BY-SA 3.0 IGO (credit like "ESA/author, CC BY-SA 3.0 IGO", a link to the licence, changes noted); "a commercial use requires a separate written authorisation by ESA". Crophalo is a real business, so an image would need its own notice to say CC BY-SA 3.0 IGO. No Sentinel-2 picture with that notice was checked: not used.
- So the cards keep Crophalo's own drawings (js/home-craft-art.js), captioned as drawings. When a specific picture is found whose own page says it may be used (NASA media guidelines for NASA material; CC BY-SA 3.0 IGO with credit for ESA), add it here with its page address and its credit line, and swap it in js/home-craft.js (PICS).
