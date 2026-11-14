# Crophalo: one field, one better rotation, from NASA data

**The problem.** A farmer who wants to change a rotation has to guess how the new crop fits this field's frost dates,
heat and rain, and how much the soil is left bare between crops.

**What Crophalo does.** You pick your field on a map and answer four short questions. Crophalo reads the field's own daily
weather record from NASA POWER since 2001 and shows one recommended rotation, the one reason it suits the field, and how it
compares with what you grow now.

**The demo: Oxford County, Ontario.** Current plan: corn, then soybeans. Answers already chosen: rain-fed, loam assumed. The judge clicks
through the same four steps a farmer does, then opens the field report.

**Key points**

- **One recommendation, with its reason.** Overview names one plan for this field and compares it with the current rotation;
  Options sets the plans side by side.
- **Every figure has its source.** Each number carries an "i" that opens its source card, NASA first.
- **Counts, never chances.** The record is written as counts over the tested years, with the years named, in the fold
  "What this is based on". The past record is never called a chance or a forecast.
- **Regional is shown as regional.** NASA SMAP root-zone soil moisture is one value for the 9 km cell around the field,
  drawn with its footprint and date, never as a pattern inside the field.
- **The ground through the year.** The Calendar tab shows, month by month, whether the ground holds a crop, residue, living
  cover or bare soil, for the current and the proposed plan, each marked Planned.
- **From report to farm.** "Add to My Farm" opens the same field in My Farm: one date, one finding, Compare plans, and the
  same field and date in 3D, where plants and residue look different.
- **Honest gaps.** Anything Crophalo has not read says "not read yet"; it never shows a sample number.
- **Free and private.** No account and no sign-in; your fields are kept on your own computer. It runs from one folder on a Mac or a Windows PC.

**NASA data used.** NASA POWER daily weather (frost dates, heat units, rain timing; its rain from GPM IMERG or MERRA-2) and
NASA SMAP Level-4 root-zone soil moisture. Credit and links: `docs/nasa-data-used.md`. Crophalo is not made, reviewed or
endorsed by NASA.

**Built with.** Plain HTML, CSS and JavaScript with no build step, a small Node server, and Python lookups for the NASA
services. Every part has its own suite, and `sh scripts/check.sh` runs them all.
