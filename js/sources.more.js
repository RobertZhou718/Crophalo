// More source notes for the report: the references the report's figures point to besides the weather sources of js/sources.js. Same shape as there.
// Pure: a table. Each note says who runs the source and what it is, in one plain line; nothing here claims more than the source says.
// Checked by scripts/test_report.mjs (every note has every field; the NASA ones come first in a list).
import { SOURCES } from './sources.js';

export const MORE = {
  fao56: { org: 'FAO', name: 'FAO crop water guide (Irrigation and Drainage Paper 56)', nasa: false, who: 'Food and Agriculture Organization of the United Nations',
    what: 'The standard guide to how long crops take to grow and how much water they use, stage by stage.',
    talk: 'Crophalo takes the length of each growth stage and the crop water need from this guide, then fits them to your field’s own frost and heat record.', url: 'https://www.fao.org/4/x0490e/x0490e00.htm' },
  rules: { org: 'Crophalo', name: 'Crophalo’s own rules', nasa: false, who: 'Crophalo',
    what: 'The plain farming rules Crophalo applies to your weather: for example, which crops follow which, and when soil is left bare.',
    talk: 'These are rules of thumb written down in one place and tested. They are a guide to think with, not advice: check with farmers near you or your adviser.', url: 'https://crophalo.earth/' },
  omafra: { org: 'OMAFRA', name: 'Ontario agronomy guide for field crops: winter wheat', nasa: false, who: 'Ontario Ministry of Agriculture, Food and Agribusiness',
    what: 'Ontario’s own guidance on growing winter wheat, including when to sow it in the fall.',
    talk: 'Crophalo points to this guide for sowing dates and seeding advice for winter wheat in Ontario.', url: 'https://www.ontario.ca/files/2022-10/omafra-agronomy-guide-for-field-crops-chapter-4-en-2022-10-13.pdf' },
  erosion: { org: 'Ontario', name: 'Soil erosion: causes and effects', nasa: false, who: 'Government of Ontario',
    what: 'Why rain on bare or thinly covered soil carries topsoil away, and what slows it down.',
    talk: 'Living plants and crop residue protect the soil surface from falling rain and slow the water running over it.', url: 'https://www.ontario.ca/page/soil-erosion-causes-and-effects' },
  smap: { org: 'NASA', name: 'NASA SMAP soil moisture', nasa: true, who: 'NASA Jet Propulsion Laboratory',
    what: 'Soil wetness seen from space, for squares about 9 km wide: a regional value, not a reading of your field.',
    talk: 'SMAP’s squares are far larger than a field, so Crophalo shows its value with the size of the area and the date, never as a pattern inside the field.', url: 'https://smap.jpl.nasa.gov/' },
};
export const ALL_SOURCES = { ...SOURCES, ...MORE };
