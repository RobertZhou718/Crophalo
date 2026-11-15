// More source notes for the report: the references the report's figures point to besides the weather sources of js/sources.js. Same shape as there.
// Pure: a table. Each note says who runs the source and what it is, in one plain line; nothing here claims more than the source says.
// Checked by scripts/test_report.mjs (every note has every field; the NASA ones come first in a list).
// The report's own extra notes, added to the shared table (js/sources.js) when this file loads: only keys it does not already hold.
import { SOURCES } from './sources.js';
export const MORE = {
  rules: { org: 'Crophalo', name: 'Crophalo’s own rules', nasa: false, who: 'Crophalo',
    what: 'The plain farming rules Crophalo applies to your weather: for example, which crops follow which, and when soil is left bare.',
    talk: 'These are rules of thumb written down in one place and tested. They are a guide to think with, not advice: check with farmers near you or your adviser.', url: 'https://crophalo.earth/' },
  omafra: { org: 'OMAFRA', name: 'Ontario agronomy guide for field crops: winter wheat', nasa: false, who: 'Ontario Ministry of Agriculture, Food and Agribusiness',
    what: 'Ontario’s own guidance on growing winter wheat, including when to sow it in the fall.',
    talk: 'Crophalo points to this guide for sowing dates and seeding advice for winter wheat in Ontario.', url: 'https://www.ontario.ca/document/agronomy-guide-field-crops' },
  erosion: { org: 'Ontario', name: 'Soil erosion: causes and effects', nasa: false, who: 'Government of Ontario',
    what: 'Why rain on bare or thinly covered soil carries topsoil away, and what slows it down.',
    talk: 'Living plants and crop residue protect the soil surface from falling rain and slow the water running over it.', url: 'https://www.ontario.ca/page/soil-erosion-causes-and-effects' },
  grace: { org: 'NASA', name: 'NASA GRACE-FO regional water storage', nasa: true, who: 'NASA Jet Propulsion Laboratory, with the German Research Centre for Geosciences (GFZ)',
    what: 'How much water is stored in the ground, the rivers and the aquifers of a whole region, from the gravity measured by a pair of satellites.',
    talk: 'GRACE-FO measures tiny changes in the pull of gravity between two satellites. A region’s total stored water goes up and down with it. The squares are hundreds of kilometres wide, so it says nothing about a single field.', url: 'https://gracefo.jpl.nasa.gov/' },
  ecostress: { org: 'NASA', name: 'NASA ECOSTRESS ground temperature', nasa: true, who: 'NASA Jet Propulsion Laboratory',
    what: 'The temperature of the ground surface itself, seen by a heat camera on the International Space Station, on the days it passes over and the sky is clear.',
    talk: 'ECOSTRESS looks at the ground, not the air, so bare soil can read much hotter than the weather. It sees a place only a few times a month, and not through cloud.', url: 'https://ecostress.jpl.nasa.gov/' },
  hls: { org: 'NASA', name: 'NASA Harmonized Landsat Sentinel-2 (HLS)', nasa: true, who: 'NASA Goddard Space Flight Center, with the US Geological Survey and the European Space Agency',
    what: 'Satellite photos of the land every few days at 30 m, joined from the Landsat and Sentinel-2 satellites, used to see how green a field is.',
    talk: 'A cloud-free photo shows how much green plant cover a patch of ground has. Crophalo uses only the clear ones, and never counts a cloudy day as bare.', url: 'https://hls.gsfc.nasa.gov/' },
  worldbank: { org: 'World Bank', name: 'World Bank commodity prices (the Pink Sheet)', nasa: false, who: 'The World Bank',
    what: 'Monthly world prices of the main crops, in US dollars per tonne.',
    talk: 'These are world market prices, not what a farmer is paid. Your own price depends on your buyer, your quality and your place.', url: 'https://www.worldbank.org/en/research/commodity-markets' },
  gbif: { org: 'GBIF', name: 'GBIF pest and species sightings', nasa: false, who: 'The Global Biodiversity Information Facility',
    what: 'Sightings of plants, insects and other living things that people and institutions have reported, with their place and date.',
    talk: 'Few people report pests, so no sighting near you does not mean the pest is not there. Ask your neighbours.', url: 'https://www.gbif.org/' },
  hrdem: { org: 'NRCan', name: 'NRCan HRDEM lidar, 1 m (Natural Resources Canada)', nasa: false, who: 'Natural Resources Canada',
    what: 'Canada’s own height map made from aircraft lidar, with a reading every metre. Slope and the way water runs are worked out from it.',
    talk: 'Lidar measures the ground by laser from an aircraft, so it can show small banks and ditches. The map used for the figure is named beside it, with how far apart its readings are.', url: 'https://natural-resources.canada.ca/' },
  usgs3dep: { org: 'USGS', name: 'USGS 3D Elevation Program (3DEP)', nasa: false, who: 'The US Geological Survey',
    what: 'The United States’ own height map, made mostly from aircraft lidar. Slope and the way water runs are worked out from it.',
    talk: 'The figure’s own line names which 3DEP map was used and how far apart its readings are. A height map cannot see every small ditch or bank.', url: 'https://www.usgs.gov/3d-elevation-program' },
  glo30: { org: 'Copernicus', name: 'Copernicus GLO-30 height map', nasa: false, who: 'The European Space Agency, for the European Union’s Copernicus programme',
    what: 'A world height map with a reading about every 30 m, used where no finer national map is available. It includes the tops of trees and buildings.',
    talk: 'It is made from radar from space, so it reads the top of what stands on the ground. Slope from it is a rough guide on a field, and small features are not in it.', url: 'https://dataspace.copernicus.eu/' },
  dem: { org: 'Height map', name: 'Height map for slope and height', nasa: false, who: 'The public height map named beside the figure',
    what: 'Ground height from a public height map, from which the slope of the field and the way water runs downhill are worked out.',
    talk: 'The figure’s own line names which height map was used and how far apart its readings are. A height map cannot see every small ditch or bank, so look at your own ground.', url: 'https://crophalo.earth/' },
};
for (const [key, note] of Object.entries(MORE)) if (!Object.hasOwn(SOURCES, key)) SOURCES[key] = note;
export const ALL_SOURCES = SOURCES;
