// Crophalo's crop table: 63 field crops, 6 cover crops and fallow (CROPS), 43 trees, bushes, vines and palms plus
// "Other trees or bushes" (GARDENS), and the 24 ready rotations (PRESETS), every row with its published source.
// Pure: no page, no storage, no network. Rule-of-thumb values for whole regions, NOT local recommendations.
// Checked by scripts/test_crops.mjs.
import { own } from './words.js';

// ---- the contract: one entry per field crop
// name     the plain name shown; the bracket holds the other common name and is dropped where space is short
// type     cash | forage | cover | fallow          group  grain legume oil fibre root sugar veg other forage cover fallow
// fam      botanical family: the pest and disease break is "a different family"
// water    water the crop needs in its season for a full yield, mm (FAO Irrigation Water Management Training Manual 3, its table of crop water needs; FAO-56),
//          a regional rule of thumb where that table has no row for the crop: each row says which
// days     growing season, days (FAO-56 Table 11 where one of its rows fits, else a regional rule of thumb: each row says which)
// root     effective rooting depth, m (FAO-56 Table 22 where it lists the crop, else a regional rule of thumb: each row says which)
// nfix     nitrogen from the air the NEXT crop can count on once the grain or hay is hauled off, 0-1 (300 kg N per ha a year = 1)
// om, cover, resid   plant matter left for the soil; ground protection while the crop stands; straw cover after harvest (0-1, Crophalo's own scales)
// drought  drought tolerance 0-1 (FAO Irrigation and Drainage Papers 33 and 66, yield response factor Ky; ECOCROP rain range)
// heat     daily high, °C, where heat stress starts        frost  frost tolerance 0-1        minT  lowest monthly mean, °C, for useful growth
// tMin, tOpt [low, high], tMax   mean temperature over the growing season, °C: lowest, best range, highest (FAO ECOCROP)
// major    one of the world's widely grown and traded field crops (FAOSTAT harvested area, more than about 5 million ha): easier to sell
// income   illustrative relative gross margin 0-1, a rough guide and not prices; cover crops sit just under 0 because seed costs money
// forage   feed value for livestock 0-1          sow, harv  months (1-12) in the northern temperate zone; the calendar moves them
// tropic   false = sown by the calendar even in the tropics (the cool-season crops and the few others the table marks); absent = sown with the rains there
// ffd      frost-free days it needs          maxGs  wettest growing-season rain, mm, before disease (Crophalo's own limit)
// minRain  yearly rain, mm, it needs without irrigation (FAO ECOCROP rain range)          color  the crop's one colour in the halo and the pictures
// nfix, heat, frost, minT, ffd, sow and harv are Crophalo's own regional estimates, like om, cover, resid and income: no publication is on record for them.
// Limits that keep a crop out of places where it does not grow (the lines under the table; absent = no such limit):
// minSeason  mean °C over sowing to harvest a heat-loving crop needs      minHot  warmest month, °C, it needs
// maxCool, maxCoolHumid  the coolest month must not be warmer than this, °C (the humid figure where it rains over 1,000 mm a year)
// minCool  coolest month, °C, it needs      mildAutumn  sown in autumn where winters are mild      minRatio  its own rain-fed water floor
// maxAlt   highest ground, m, where it is grown      needDry  months under 60 mm it needs to ripen      heatMargin  °C above heat before "far too hot"
// scl      host of sclerotinia stem rot (hosts are no clean break from each other)      legumeMix  a grass and legume mix
// soilTest { ph: [best low, best high, lowest, highest], salt: [threshold ECe dS/m, % yield lost per dS/m above it] }, used only with a typed lab test
export const CROPS = {
  corn: { name: 'Corn (maize)', type: 'cash', group: 'grain', fam: 'grass', water: 650, days: 150, root: 1.7, nfix: 0, om: 0.9, cover: 0.55, resid: 0.55, drought: 0.3, heat: 32, frost: 0.1, minT: 14,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 10, tOpt: [18, 33], tMax: 47, major: true, income: 0.7, forage: 0.4, sow: 4, harv: 10, ffd: 125, color: '#f5b83d' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  wheat: { name: 'Winter wheat', type: 'cash', group: 'grain', fam: 'grass', water: 550, days: 270, root: 1.8, nfix: 0, om: 0.7, cover: 0.7, resid: 0.45, drought: 0.55, heat: 30, frost: 0.85, minT: 3,   // water FAO Manual 3 and FAO-56; days a regional rule of thumb (FAO-56 Table 11 prints 180, 240 and 335 for winter wheat); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [15, 23], tMax: 27, major: true, income: 0.5, forage: 0.3, sow: 10, harv: 7, tropic: false, color: '#d9a441' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  barley: { name: 'Spring barley', type: 'cash', group: 'grain', fam: 'grass', water: 450, days: 110, root: 1.5, nfix: 0, om: 0.6, cover: 0.6, resid: 0.4, drought: 0.65, heat: 30, frost: 0.55, minT: 5,   // water FAO Manual 3 and FAO-56; days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 120, 130, 135, 150, 160, 200); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 2, tOpt: [15, 20], tMax: 40, major: true, income: 0.42, forage: 0.55, sow: 3, harv: 7, color: '#c9a95c' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  sorghum: { name: 'Sorghum (milo)', type: 'cash', group: 'grain', fam: 'grass', water: 550, days: 125, root: 2, nfix: 0, om: 0.8, cover: 0.6, resid: 0.55, drought: 0.85, heat: 38, frost: 0, minT: 17,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 8, tOpt: [22, 35], tMax: 40, major: true, income: 0.46, forage: 0.7, sow: 5, harv: 10, ffd: 125, color: '#c0763a' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  swheat: { name: 'Spring wheat', type: 'cash', group: 'grain', fam: 'grass', water: 500, days: 125, root: 1.5, nfix: 0, om: 0.65, cover: 0.65, resid: 0.45, drought: 0.5, heat: 30, frost: 0.5, minT: 5,   // water FAO Manual 3 and FAO-56; days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 120, 130, 135, 150, 160, 200); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [15, 23], tMax: 27, major: true, income: 0.48, forage: 0.3, sow: 4, harv: 8, color: '#e2c06a' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  oats: { name: 'Oats', type: 'cash', group: 'grain', fam: 'grass', water: 500, days: 115, root: 1.5, nfix: 0, om: 0.6, cover: 0.65, resid: 0.45, drought: 0.45, heat: 28, frost: 0.45, minT: 5,   // water FAO Manual 3 and FAO-56; days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 120, 130, 135, 150, 160, 200); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [16, 20], tMax: 30, income: 0.38, forage: 0.5, sow: 4, harv: 8, tropic: false, color: '#d9cf9a' },   // temperatures FAO ECOCROP
  rye: { name: 'Rye (grain)', type: 'cash', group: 'grain', fam: 'grass', water: 500, days: 290, root: 1.6, nfix: 0, om: 0.75, cover: 0.75, resid: 0.55, drought: 0.65, heat: 29, frost: 0.95, minT: 2,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's row from FAO-56 Table 11 is 165); root a regional rule of thumb (not in FAO-56 Table 22); drought FAO 33/66 Ky and ECOCROP rain
    tMin: 3, tOpt: [15, 20], tMax: 31, income: 0.36, forage: 0.4, sow: 9, harv: 7, tropic: false, color: '#b9a37a' },   // temperatures FAO ECOCROP
  rice: { name: 'Rice (paddy)', type: 'cash', group: 'grain', fam: 'grass', days: 135, root: 0.6, nfix: 0, om: 0.6, cover: 0.6, resid: 0.4, drought: 0.1, heat: 35, frost: 0, minT: 16,   // water on its own line under the table; days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 150, 180); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 10, tOpt: [20, 30], tMax: 36, major: true, income: 0.6, forage: 0.3, sow: 5, harv: 9, minRain: 1000, color: '#e0c870' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area; rain limit ECOCROP
  pmillet: { name: 'Pearl millet', type: 'cash', group: 'grain', fam: 'grass', water: 450, days: 95, root: 2, nfix: 0, om: 0.7, cover: 0.5, resid: 0.45, drought: 0.95, heat: 40, frost: 0, minT: 18,   // water FAO Manual 3 and FAO-56 (its sorghum and millet row); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 105, 140); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 12, tOpt: [25, 35], tMax: 40, major: true, income: 0.35, forage: 0.5, sow: 6, harv: 9, ffd: 90, color: '#b8a46e' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  fmillet: { name: 'Finger millet', type: 'cash', group: 'grain', fam: 'grass', water: 400, days: 120, root: 1, nfix: 0, om: 0.5, cover: 0.55, resid: 0.35, drought: 0.7, heat: 34, frost: 0.05, minT: 14,   // water a regional rule of thumb (FAO Manual 3 prints 450 to 650 mm for sorghum and millet); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 105, 140); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 8, tOpt: [18, 30], tMax: 35, income: 0.4, forage: 0.4, sow: 5, harv: 9, ffd: 100, color: '#a5714a' },   // temperatures FAO ECOCROP
  teff: { name: 'Teff', type: 'cash', group: 'grain', fam: 'grass', water: 350, days: 110, root: 0.6, nfix: 0, om: 0.45, cover: 0.6, resid: 0.3, drought: 0.6, heat: 32, frost: 0.05, minT: 12,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 2, tOpt: [22, 28], tMax: 30, income: 0.6, forage: 0.4, sow: 6, harv: 9, color: '#c9a57a' },   // temperatures FAO ECOCROP
  quinoa: { name: 'Quinoa', type: 'cash', group: 'grain', fam: 'chenopod', water: 400, days: 150, root: 1.5, nfix: 0, om: 0.4, cover: 0.45, resid: 0.25, drought: 0.8, heat: 30, frost: 0.55, minT: 6,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 2, tOpt: [14, 18], tMax: 35, income: 0.7, forage: 0.1, sow: 4, harv: 8, maxGs: 500, color: '#d9784a' },   // temperatures FAO ECOCROP; maxGs Crophalo's own wet-season disease limit (no publication on record)
  soy: { name: 'Soybeans', type: 'cash', group: 'legume', fam: 'legume', water: 575, days: 140, root: 1.3, om: 0.4, cover: 0.45, resid: 0.2, drought: 0.5, heat: 33, frost: 0.1, minT: 14,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 10, tOpt: [20, 33], tMax: 38, major: true, income: 0.65, forage: 0.2, sow: 5, harv: 10, ffd: 115, color: '#8bc34a' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  chickpea: { name: 'Chickpeas', type: 'cash', group: 'legume', fam: 'legume', water: 350, days: 120, root: 1, nfix: 0.23, om: 0.35, cover: 0.35, resid: 0.2, drought: 0.8, heat: 33, frost: 0.4, minT: 8,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (not in FAO-56 Table 11); root FAO-56 Table 22; drought from FAO ECOCROP rain
    tMin: 7, tOpt: [15, 29], tMax: 35, major: true, income: 0.76, forage: 0.1, sow: 3, harv: 7, maxGs: 420, tropic: false, color: '#b5c26b' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area; maxGs Crophalo's own wet-season disease limit (no publication on record)
  lentil: { name: 'Lentils', type: 'cash', group: 'legume', fam: 'legume', water: 300, days: 120, root: 0.8, nfix: 0.3, om: 0.3, cover: 0.3, resid: 0.15, drought: 0.75, heat: 30, frost: 0.45, minT: 6,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 150, 170); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [15, 29], tMax: 32, major: true, income: 0.78, forage: 0.15, sow: 3, harv: 7, maxGs: 420, tropic: false, color: '#a39a4a' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area; maxGs Crophalo's own wet-season disease limit (no publication on record)
  pea: { name: 'Field peas', type: 'cash', group: 'legume', fam: 'legume', water: 425, days: 100, root: 1, nfix: 0.37, om: 0.35, cover: 0.4, resid: 0.2, drought: 0.45, heat: 28, frost: 0.55, minT: 5,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 4, tOpt: [10, 24], tMax: 30, major: true, income: 0.5, forage: 0.4, sow: 3, harv: 7, color: '#7fbf6a' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  bean: { name: 'Dry beans', type: 'cash', group: 'legume', fam: 'legume', water: 400, days: 105, root: 0.9, nfix: 0.13, om: 0.3, cover: 0.4, resid: 0.15, drought: 0.3, heat: 30, frost: 0.05, minT: 13,   // water FAO Manual 3 and FAO-56; days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 95, 100, 110); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 7, tOpt: [16, 25], tMax: 32, major: true, income: 0.62, forage: 0.1, sow: 5, harv: 9, ffd: 100, color: '#b5543a' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  faba: { name: 'Faba beans', type: 'cash', group: 'legume', fam: 'legume', water: 450, days: 120, root: 0.7, nfix: 0.5, om: 0.45, cover: 0.5, resid: 0.25, drought: 0.3, heat: 28, frost: 0.5, minT: 5,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 90, 100); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [18, 28], tMax: 32, income: 0.55, forage: 0.3, sow: 3, harv: 8, color: '#5f9a45' },   // temperatures FAO ECOCROP
  cowpea: { name: 'Cowpeas', type: 'cash', group: 'legume', fam: 'legume', water: 375, days: 100, root: 1, nfix: 0.27, om: 0.35, cover: 0.6, resid: 0.2, drought: 0.85, heat: 38, frost: 0, minT: 18,   // water a regional rule of thumb (not in FAO Manual 3's table); days FAO-56 Table 11 (its four stages add to 100; the printed total is 110); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 15, tOpt: [25, 35], tMax: 40, major: true, income: 0.5, forage: 0.35, sow: 5, harv: 8, ffd: 90, color: '#9aa85a' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  groundnut: { name: 'Peanuts (groundnuts)', type: 'cash', group: 'legume', fam: 'legume', water: 600, days: 130, root: 1, nfix: 0.37, om: 0.25, cover: 0.55, resid: 0.1, drought: 0.75, heat: 34, frost: 0, minT: 16,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 10, tOpt: [22, 32], tMax: 45, major: true, income: 0.65, forage: 0.3, sow: 5, harv: 10, ffd: 140, color: '#d9b27a' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  pigeonpea: { name: 'Pigeon peas', type: 'cash', group: 'legume', fam: 'legume', water: 650, days: 180, root: 2, nfix: 0.33, om: 0.6, cover: 0.55, resid: 0.35, drought: 0.85, heat: 37, frost: 0.05, minT: 16,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 10, tOpt: [18, 38], tMax: 45, income: 0.55, forage: 0.3, sow: 6, harv: 12, ffd: 150, color: '#7a8a3a' },   // temperatures FAO ECOCROP
  mung: { name: 'Mung beans', type: 'cash', group: 'legume', fam: 'legume', water: 300, days: 75, root: 1, nfix: 0.17, om: 0.25, cover: 0.5, resid: 0.15, drought: 0.6, heat: 36, frost: 0, minT: 15,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (FAO-56 Table 11 has one row for green gram and cowpeas: its stages add to 100, its printed total is 110); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 8, tOpt: [21, 36], tMax: 40, income: 0.6, forage: 0.2, sow: 6, harv: 8, ffd: 75, color: '#4f8f3a' },   // temperatures FAO ECOCROP
  sunflower: { name: 'Sunflowers', type: 'cash', group: 'oil', fam: 'composite', water: 800, days: 130, root: 1.5, nfix: 0, om: 0.6, cover: 0.5, resid: 0.35, drought: 0.7, heat: 35, frost: 0.2, minT: 11,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [17, 34], tMax: 45, major: true, income: 0.58, forage: 0.1, sow: 4, harv: 9, ffd: 105, color: '#ffd23f' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  canola: { name: 'Canola (rapeseed)', type: 'cash', group: 'oil', fam: 'brassica', water: 450, days: 300, root: 1.5, nfix: 0, om: 0.5, cover: 0.55, resid: 0.3, drought: 0.45, heat: 29, frost: 0.7, minT: 4,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's row from FAO-56 Table 11 is 195); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [15, 25], tMax: 41, major: true, income: 0.6, forage: 0.2, sow: 9, harv: 7, tropic: false, color: '#e6d84c' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  scanola: { name: 'Spring canola', type: 'cash', group: 'oil', fam: 'brassica', water: 450, days: 110, root: 1.5, nfix: 0, om: 0.5, cover: 0.55, resid: 0.3, drought: 0.45, heat: 29, frost: 0.5, minT: 4,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (not in FAO-56 Table 11); root FAO-56 Table 22; drought from FAO ECOCROP rain
    tMin: 5, tOpt: [15, 25], tMax: 41, major: true, income: 0.6, forage: 0.2, sow: 5, harv: 9, tropic: false, color: '#e6d84c' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  sesame: { name: 'Sesame', type: 'cash', group: 'oil', fam: 'sesame', water: 450, days: 100, root: 1.5, nfix: 0, om: 0.35, cover: 0.4, resid: 0.2, drought: 0.8, heat: 38, frost: 0, minT: 18,   // water a regional rule of thumb (not in FAO Manual 3's table); days FAO-56 Table 11 (the printed total; its four stages add to 110); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 10, tOpt: [20, 30], tMax: 40, income: 0.65, forage: 0.05, sow: 6, harv: 9, ffd: 120, maxGs: 700, color: '#e9e1cf' },   // temperatures FAO ECOCROP; maxGs Crophalo's own wet-season disease limit (no publication on record)
  safflower: { name: 'Safflower', type: 'cash', group: 'oil', fam: 'composite', water: 650, days: 140, root: 2, nfix: 0, om: 0.45, cover: 0.45, resid: 0.3, drought: 0.85, heat: 34, frost: 0.45, minT: 7,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 125, 145, 190); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [20, 32], tMax: 45, income: 0.45, forage: 0.1, sow: 4, harv: 8, maxGs: 400, tropic: false, color: '#f08a24' },   // temperatures FAO ECOCROP; maxGs Crophalo's own wet-season disease limit (no publication on record)
  flax: { name: 'Flax (linseed)', type: 'cash', group: 'oil', fam: 'flax', water: 400, days: 120, root: 1.2, nfix: 0, om: 0.35, cover: 0.4, resid: 0.3, drought: 0.5, heat: 30, frost: 0.35, minT: 6,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 150, 220); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [16, 24], tMax: 30, income: 0.5, forage: 0.1, sow: 4, harv: 8, tropic: false, color: '#6a8fe0' },   // temperatures FAO ECOCROP
  cotton: { name: 'Cotton', type: 'cash', group: 'fibre', fam: 'mallow', water: 1000, days: 180, root: 1.7, nfix: 0, om: 0.5, cover: 0.35, resid: 0.15, drought: 0.65, heat: 36, frost: 0, minT: 18,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 15, tOpt: [22, 36], tMax: 42, major: true, income: 0.62, forage: 0, sow: 4, harv: 10, ffd: 175, color: '#e8e2d0' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  potato: { name: 'Potatoes', type: 'cash', group: 'root', fam: 'nightshade', water: 600, days: 130, root: 0.6, nfix: 0, om: 0.3, cover: 0.6, resid: 0.1, drought: 0.25, heat: 28, frost: 0.15, minT: 10,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 7, tOpt: [15, 25], tMax: 30, major: true, income: 0.75, forage: 0.1, sow: 4, harv: 9, color: '#c8a165' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area
  sweetpotato: { name: 'Sweet potatoes', type: 'cash', group: 'root', fam: 'morning-glory', water: 500, days: 135, root: 1.5, nfix: 0, om: 0.25, cover: 0.7, resid: 0.1, drought: 0.6, heat: 34, frost: 0, minT: 16,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 125, 150); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 10, tOpt: [18, 28], tMax: 38, income: 0.65, forage: 0.3, sow: 5, harv: 9, ffd: 120, color: '#c45a6a' },   // temperatures FAO ECOCROP
  cassava: { name: 'Cassava', type: 'cash', group: 'root', fam: 'euphorbia', water: 1000, days: 300, root: 1, nfix: 0, om: 0.35, cover: 0.5, resid: 0.15, drought: 0.85, heat: 36, frost: 0, minT: 18,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (FAO-56 Table 11 prints 210 for the first year and 360 for the second); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 10, tOpt: [20, 29], tMax: 35, major: true, income: 0.55, forage: 0.2, sow: 4, harv: 2, ffd: 300, minRain: 500, color: '#9a6a3a' },   // temperatures FAO ECOCROP; major by FAOSTAT harvested area; rain limit ECOCROP
  yam: { name: 'Yams', type: 'cash', group: 'root', fam: 'yam', water: 1000, days: 240, root: 0.8, nfix: 0, om: 0.25, cover: 0.45, resid: 0.1, drought: 0.4, heat: 35, frost: 0, minT: 20,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 15, tOpt: [25, 32], tMax: 38, income: 0.7, forage: 0.1, sow: 3, harv: 11, ffd: 270, minRain: 800, color: '#8a6a48' },   // temperatures FAO ECOCROP; rain limit ECOCROP
  sugarbeet: { name: 'Sugar beets', type: 'cash', group: 'sugar', fam: 'chenopod', water: 650, days: 180, root: 1.2, nfix: 0, om: 0.4, cover: 0.6, resid: 0.15, drought: 0.5, heat: 30, frost: 0.3, minT: 6,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 4, tOpt: [15, 25], tMax: 35, income: 0.7, forage: 0.3, sow: 3, harv: 10, tropic: false, color: '#efe6cf' },   // temperatures FAO ECOCROP
  tomato: { name: 'Tomatoes', type: 'cash', group: 'veg', fam: 'nightshade', water: 600, days: 145, root: 1.5, nfix: 0, om: 0.25, cover: 0.45, resid: 0.15, drought: 0.35, heat: 32, frost: 0, minT: 14,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 7, tOpt: [20, 27], tMax: 35, income: 0.9, forage: 0.05, sow: 5, harv: 9, ffd: 110, tropic: false, color: '#e5533d' },   // temperatures FAO ECOCROP
  onion: { name: 'Onions', type: 'cash', group: 'veg', fam: 'allium', water: 450, days: 150, root: 0.6, nfix: 0, om: 0.1, cover: 0.25, resid: 0.05, drought: 0.25, heat: 30, frost: 0.55, minT: 6,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 4, tOpt: [12, 25], tMax: 30, income: 0.85, forage: 0, sow: 3, harv: 8, tropic: false, color: '#c9845a' },   // temperatures FAO ECOCROP
  cabbage: { name: 'Cabbage', type: 'cash', group: 'veg', fam: 'brassica', water: 425, days: 130, root: 0.8, nfix: 0, om: 0.3, cover: 0.55, resid: 0.15, drought: 0.35, heat: 28, frost: 0.65, minT: 6,   // water FAO Manual 3 and FAO-56; days a regional rule of thumb (FAO-56 Table 11 prints 165 for cabbage; FAO Manual 3 gives 120 to 140); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 7, tOpt: [15, 24], tMax: 32, income: 0.75, forage: 0.2, sow: 4, harv: 8, tropic: false, color: '#8fc46a' },   // temperatures FAO ECOCROP
  watermelon: { name: 'Watermelons', type: 'cash', group: 'veg', fam: 'cucurbit', water: 500, days: 100, root: 1.5, nfix: 0, om: 0.2, cover: 0.45, resid: 0.1, drought: 0.45, heat: 35, frost: 0, minT: 18,   // water FAO Manual 3 and FAO-56 (its melon row); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 80, 110); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 15, tOpt: [20, 35], tMax: 40, income: 0.75, forage: 0.05, sow: 5, harv: 8, ffd: 100, tropic: false, color: '#3f8f3a' },   // temperatures FAO ECOCROP
  pepper: { name: 'Peppers', type: 'cash', group: 'veg', fam: 'nightshade', water: 750, days: 125, root: 1, nfix: 0, om: 0.2, cover: 0.4, resid: 0.1, drought: 0.3, heat: 32, frost: 0, minT: 15,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 8, tOpt: [17, 30], tMax: 35, income: 0.88, forage: 0, sow: 5, harv: 9, ffd: 110, tropic: false, color: '#d9362a' },   // temperatures FAO ECOCROP
  tobacco: { name: 'Tobacco', type: 'cash', group: 'other', fam: 'nightshade', water: 500, days: 130, root: 0.8, nfix: 0, om: 0.2, cover: 0.4, resid: 0.1, drought: 0.45, heat: 32, frost: 0.05, minT: 14,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (FAO Manual 3 gives 130 to 160); root a regional rule of thumb (not in FAO-56 Table 22); drought from FAO ECOCROP rain
    tMin: 7, tOpt: [15, 30], tMax: 35, income: 0.8, forage: 0, sow: 5, harv: 9, ffd: 100, color: '#8aa84a' },   // temperatures FAO ECOCROP
  alfalfa: { name: 'Alfalfa hay', type: 'forage', group: 'forage', fam: 'legume', water: 1000, days: 200, root: 2, om: 0.85, cover: 0.95, resid: 0.9, drought: 0.65, heat: 35, frost: 0.8, minT: 6,   // water FAO Manual 3 and FAO-56; days a regional rule of thumb for a hay stand; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [21, 27], tMax: 45, income: 0.6, forage: 1, sow: 4, harv: 10, tropic: false, color: '#2e9d57' },   // temperatures FAO ECOCROP
  ley: { name: 'Grass-clover ley', type: 'forage', group: 'forage', fam: 'grass', water: 750, days: 210, root: 1, nfix: 0.5, om: 0.9, cover: 0.95, resid: 0.9, drought: 0.4, heat: 28, frost: 0.85, minT: 5,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 4, tOpt: [14, 25], tMax: 35, income: 0.4, forage: 0.95, sow: 4, harv: 10, tropic: false, color: '#6fbf5f' },   // temperatures FAO ECOCROP
  ryecover: { name: 'Cereal rye cover', type: 'cover', group: 'cover', fam: 'grass', water: 130, days: 200, root: 1.3, nfix: 0, om: 0.8, cover: 0.9, resid: 0.7, drought: 0.7, heat: 30, frost: 1, minT: 1,   // water, days and root from university extension cover-crop guides (no guide is named on record); drought from FAO ECOCROP rain
    tMin: 3, tOpt: [15, 20], tMax: 31, income: -0.05, forage: 0.5, sow: 10, harv: 4, tropic: false, color: '#4f8a5b' },   // temperatures FAO ECOCROP
  vetchmix: { name: 'Vetch + rye cover', type: 'cover', group: 'cover', fam: 'legume', water: 140, days: 210, root: 1, nfix: 0.3, om: 0.75, cover: 0.9, resid: 0.6, drought: 0.55, heat: 30, frost: 0.7, minT: 4,   // water, days and root from university extension cover-crop guides (no guide is named on record); drought from FAO ECOCROP rain
    tMin: 2, tOpt: [12, 22], tMax: 28, income: -0.07, forage: 0.4, sow: 9, harv: 4, tropic: false, color: '#3f9e7a' },   // temperatures FAO ECOCROP
  radish: { name: 'Radish cover mix', type: 'cover', group: 'cover', fam: 'brassica', water: 90, days: 75, root: 1.5, nfix: 0, om: 0.5, cover: 0.75, resid: 0.3, drought: 0.5, heat: 30, frost: 0.4, minT: 6,   // water, days and root from university extension cover-crop guides (no guide is named on record); drought from FAO ECOCROP rain
    tMin: 10, tOpt: [12, 26], tMax: 37, income: -0.05, forage: 0.3, sow: 8, harv: 11, tropic: false, color: '#6bb38a' },   // temperatures FAO ECOCROP
  sunnhemp: { name: 'Sunn hemp cover', type: 'cover', group: 'cover', fam: 'legume', water: 300, days: 75, root: 1.2, nfix: 0.37, om: 0.8, cover: 0.85, resid: 0.6, drought: 0.75, heat: 38, frost: 0, minT: 16,   // water, days and root from university extension cover-crop guides (no guide is named on record); drought from FAO ECOCROP rain
    tOpt: [20, 30], tMax: 40, income: -0.05, forage: 0.4, sow: 7, harv: 9, ffd: 75, color: '#e2b62e' },   // temperatures FAO ECOCROP
  clover: { name: 'Crimson clover cover', type: 'cover', group: 'cover', fam: 'legume', water: 200, days: 210, root: 0.9, nfix: 0.37, om: 0.6, cover: 0.85, resid: 0.5, drought: 0.4, heat: 28, frost: 0.6, minT: 4,   // water, days and root from university extension cover-crop guides (no guide is named on record); drought from FAO ECOCROP rain
    tMin: 4, tOpt: [13, 22], tMax: 28, income: -0.06, forage: 0.5, sow: 9, harv: 4, tropic: false, color: '#d6455a' },   // temperatures FAO ECOCROP
  mustard: { name: 'Mustard cover', type: 'cover', group: 'cover', fam: 'brassica', water: 150, days: 75, root: 1, nfix: 0, om: 0.5, cover: 0.75, resid: 0.3, drought: 0.5, heat: 30, frost: 0.3, minT: 5,   // water, days and root from university extension cover-crop guides (no guide is named on record); drought from FAO ECOCROP rain
    tMin: 7, tOpt: [15, 28], tMax: 40, income: -0.04, forage: 0.2, sow: 8, harv: 11, tropic: false, color: '#e8d040' },   // temperatures FAO ECOCROP
  carrot: { name: 'Carrots', type: 'cash', group: 'veg', fam: 'carrot', water: 400, days: 125, root: 1, nfix: 0, om: 0.15, cover: 0.45, resid: 0.05, drought: 0.35, heat: 30, frost: 0.45, minT: 7,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 100, 150, 200; FAO Manual 3 gives 100 to 150); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 3, tOpt: [15, 24], tMax: 30, income: 0.8, forage: 0.1, sow: 4, harv: 8, tropic: false, color: '#ef8a2e' },   // temperatures FAO ECOCROP
  garlic: { name: 'Garlic', type: 'cash', group: 'veg', fam: 'allium', water: 470, days: 240, root: 0.5, nfix: 0, om: 0.1, cover: 0.2, resid: 0.05, drought: 0.25, heat: 30, frost: 0.8, minT: 7,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (not in FAO-56 Table 11); root FAO-56 Table 22; drought from FAO ECOCROP rain
    tMin: 7, tOpt: [18, 30], tMax: 35, income: 0.9, forage: 0, sow: 10, harv: 7, tropic: false, color: '#e9dccb' },   // temperatures FAO ECOCROP
  lettuce: { name: 'Lettuce', type: 'cash', group: 'veg', fam: 'composite', water: 310, days: 105, root: 0.5, nfix: 0, om: 0.15, cover: 0.45, resid: 0.1, drought: 0.15, heat: 28, frost: 0.4, minT: 7,   // water a regional rule of thumb (not in FAO Manual 3's table); days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [12, 21], tMax: 30, income: 0.85, forage: 0.05, sow: 4, harv: 6, tropic: false, color: '#9ccc65' },   // temperatures FAO ECOCROP
  cucumber: { name: 'Cucumbers', type: 'cash', group: 'veg', fam: 'cucurbit', water: 500, days: 115, root: 1.2, nfix: 0, om: 0.2, cover: 0.5, resid: 0.1, drought: 0.3, heat: 32, frost: 0, minT: 16,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 105, 130; FAO Manual 3 gives 105 to 130); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 6, tOpt: [18, 32], tMax: 38, income: 0.8, forage: 0, sow: 5, harv: 8, ffd: 90, color: '#4f9a3a' },   // temperatures FAO ECOCROP
  eggplant: { name: 'Eggplants (brinjal)', type: 'cash', group: 'veg', fam: 'nightshade', water: 600, days: 135, root: 1.2, nfix: 0, om: 0.25, cover: 0.4, resid: 0.15, drought: 0.35, heat: 35, frost: 0, minT: 18,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 130, 140; FAO Manual 3 gives 130 to 140); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 9, tOpt: [20, 35], tMax: 40, income: 0.8, forage: 0, sow: 5, harv: 9, ffd: 110, color: '#6a3a8a' },   // temperatures FAO ECOCROP
  okra: { name: 'Okra', type: 'cash', group: 'veg', fam: 'mallow', water: 400, days: 110, root: 1, nfix: 0, om: 0.35, cover: 0.45, resid: 0.3, drought: 0.5, heat: 38, frost: 0, minT: 18,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 12, tOpt: [20, 30], tMax: 35, income: 0.7, forage: 0.05, sow: 5, harv: 9, ffd: 100, color: '#7fae4a' },   // temperatures FAO ECOCROP
  pumpkin: { name: 'Pumpkins and squash', type: 'cash', group: 'veg', fam: 'cucurbit', water: 480, days: 110, root: 1.5, nfix: 0, om: 0.25, cover: 0.65, resid: 0.15, drought: 0.45, heat: 32, frost: 0.05, minT: 10,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 100, 120; FAO Manual 3 gives 95 to 120); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 9, tOpt: [20, 30], tMax: 38, income: 0.6, forage: 0.15, sow: 5, harv: 9, ffd: 100, color: '#e9782a' },   // temperatures FAO ECOCROP
  sweetcorn: { name: 'Sweet corn', type: 'cash', group: 'veg', fam: 'grass', water: 550, days: 95, root: 1.2, nfix: 0, om: 0.7, cover: 0.5, resid: 0.45, drought: 0.25, heat: 32, frost: 0.1, minT: 10,   // water FAO Manual 3 and FAO-56 (its maize row); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 80, 90, 140; FAO Manual 3 gives 80 to 110); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 12, tOpt: [16, 24], tMax: 38, income: 0.7, forage: 0.4, sow: 5, harv: 8, ffd: 90, color: '#f7d65a' },   // temperatures FAO ECOCROP
  spinach: { name: 'Spinach', type: 'cash', group: 'veg', fam: 'chenopod', water: 320, days: 80, root: 0.5, nfix: 0, om: 0.1, cover: 0.4, resid: 0.05, drought: 0.15, heat: 26, frost: 0.8, minT: 4,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 60, 70, 100; FAO Manual 3 gives 60 to 100); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 2, tOpt: [13, 20], tMax: 27, income: 0.75, forage: 0.05, sow: 3, harv: 5, tropic: false, color: '#3f8a3a' },   // temperatures FAO ECOCROP
  greenbean: { name: 'Green beans', type: 'cash', group: 'veg', fam: 'legume', water: 350, days: 85, root: 0.7, nfix: 0.13, om: 0.25, cover: 0.4, resid: 0.15, drought: 0.25, heat: 30, frost: 0.05, minT: 10,   // water FAO Manual 3 and FAO-56 (its bean row); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 75, 90; FAO Manual 3 gives 75 to 90); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 7, tOpt: [16, 25], tMax: 32, income: 0.75, forage: 0.1, sow: 5, harv: 7, ffd: 70, color: '#6aae4a' },   // temperatures FAO ECOCROP
  melon: { name: 'Melons (cantaloupe)', type: 'cash', group: 'veg', fam: 'cucurbit', water: 500, days: 120, root: 1.5, nfix: 0, om: 0.2, cover: 0.5, resid: 0.1, drought: 0.45, heat: 35, frost: 0, minT: 16,   // water FAO Manual 3 and FAO-56; days FAO-56 Table 11; root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 9, tOpt: [18, 30], tMax: 35, income: 0.75, forage: 0.05, sow: 5, harv: 8, ffd: 100, tropic: false, color: '#e2b86a' },   // temperatures FAO ECOCROP
  cauliflower: { name: 'Cauliflower and broccoli', type: 'cash', group: 'veg', fam: 'brassica', water: 400, days: 135, root: 0.6, nfix: 0, om: 0.35, cover: 0.55, resid: 0.25, drought: 0.3, heat: 28, frost: 0.6, minT: 6,   // water a regional rule of thumb (not in FAO Manual 3's table); days FAO-56 Table 11 (its broccoli row; cauliflower is printed at 140); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [10, 25], tMax: 30, income: 0.8, forage: 0.15, sow: 4, harv: 8, tropic: false, color: '#ece4c8' },   // temperatures FAO ECOCROP
  hemp: { name: 'Hemp', type: 'cash', group: 'fibre', fam: 'hemp', water: 475, days: 120, root: 1.5, nfix: 0, om: 0.4, cover: 0.8, resid: 0.25, drought: 0.5, heat: 32, frost: 0.35, minT: 8,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 6, tOpt: [15, 28], tMax: 32, income: 0.55, forage: 0.05, sow: 5, harv: 9, color: '#5f8f4a' },   // temperatures FAO ECOCROP
  jute: { name: 'Jute', type: 'cash', group: 'fibre', fam: 'mallow', water: 550, days: 120, root: 1, nfix: 0, om: 0.35, cover: 0.75, resid: 0.15, drought: 0.3, heat: 38, frost: 0, minT: 17,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 15, tOpt: [22, 35], tMax: 45, income: 0.4, forage: 0, sow: 4, harv: 8, minRain: 1000, color: '#a89a5a' },   // temperatures FAO ECOCROP; rain limit ECOCROP
  buckwheat: { name: 'Buckwheat', type: 'cash', group: 'grain', fam: 'buckwheat', water: 450, days: 80, root: 0.8, nfix: 0, om: 0.4, cover: 0.75, resid: 0.35, drought: 0.3, heat: 28, frost: 0.05, minT: 10,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 7, tOpt: [17, 27], tMax: 40, income: 0.45, forage: 0.2, sow: 6, harv: 9, ffd: 80, tropic: false, color: '#8a6a5a' },   // temperatures FAO ECOCROP
  triticale: { name: 'Triticale', type: 'cash', group: 'grain', fam: 'grass', water: 550, days: 270, root: 1.8, nfix: 0, om: 0.8, cover: 0.75, resid: 0.55, drought: 0.6, heat: 30, frost: 0.8, minT: 3,   // water a regional rule of thumb (not in FAO Manual 3's table); days a regional rule of thumb (FAO-56 Table 11 prints 180, 240 and 335 for winter wheat); root a regional rule of thumb (not in FAO-56 Table 22); drought FAO 33/66 Ky and ECOCROP rain
    tMin: 5, tOpt: [15, 23], tMax: 27, income: 0.4, forage: 0.55, sow: 10, harv: 7, tropic: false, color: '#c4aa6a' },   // temperatures FAO ECOCROP
  durum: { name: 'Durum wheat', type: 'cash', group: 'grain', fam: 'grass', water: 500, days: 125, root: 1.5, nfix: 0, om: 0.65, cover: 0.65, resid: 0.45, drought: 0.55, heat: 30, frost: 0.45, minT: 5,   // water FAO Manual 3 and FAO-56 (its wheat row); days a regional rule of thumb (the sowing calendar's rows from FAO-56 Table 11 run 120, 130, 135, 150, 160, 200); root FAO-56 Table 22; drought FAO 33/66 Ky and ECOCROP rain
    tMin: 6, tOpt: [17, 25], tMax: 30, income: 0.55, forage: 0.3, sow: 4, harv: 8, tropic: false, color: '#e0b45a' },   // temperatures FAO ECOCROP
  lupin: { name: 'Lupins', type: 'cash', group: 'legume', fam: 'legume', water: 400, days: 130, root: 1.5, nfix: 0.43, om: 0.4, cover: 0.5, resid: 0.25, drought: 0.5, heat: 30, frost: 0.5, minT: 5,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 4, tOpt: [12, 18], tMax: 26, income: 0.45, forage: 0.3, sow: 4, harv: 8, tropic: false, color: '#6f7fd0' },   // temperatures FAO ECOCROP
  taro: { name: 'Taro (cocoyam)', type: 'cash', group: 'root', fam: 'aroid', water: 620, days: 210, root: 0.6, nfix: 0, om: 0.2, cover: 0.6, resid: 0.1, drought: 0.15, heat: 35, frost: 0, minT: 16,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 10, tOpt: [21, 28], tMax: 35, income: 0.6, forage: 0.1, sow: 4, harv: 10, minRain: 1000, color: '#8a7aa0' },   // temperatures FAO ECOCROP; rain limit ECOCROP
  bambara: { name: 'Bambara groundnuts', type: 'cash', group: 'legume', fam: 'legume', water: 500, days: 130, root: 1, nfix: 0.34, om: 0.25, cover: 0.5, resid: 0.1, drought: 0.8, heat: 35, frost: 0, minT: 18,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 16, tOpt: [19, 30], tMax: 38, income: 0.5, forage: 0.2, sow: 5, harv: 9, color: '#b08a5a' },   // temperatures FAO ECOCROP
  mustardseed: { name: 'Mustard (for seed)', type: 'cash', group: 'oil', fam: 'brassica', water: 400, days: 100, root: 1.5, nfix: 0, om: 0.5, cover: 0.6, resid: 0.35, drought: 0.5, heat: 30, frost: 0.45, minT: 7,   // water, days and root regional rules of thumb (in neither FAO Manual 3's table nor FAO-56 Tables 11 and 22); drought from FAO ECOCROP rain
    tMin: 7, tOpt: [15, 28], tMax: 40, income: 0.5, forage: 0.1, sow: 5, harv: 8, tropic: false, color: '#d9c03a' },   // temperatures FAO ECOCROP
  fallow: { name: 'Fallow', type: 'fallow', group: 'fallow', fam: 'none', water: 0, root: 0, nfix: 0, om: 0, cover: 0.05, resid: 0.05, drought: 0, heat: 99, frost: 1, minT: -99,   // no crop in the ground: nothing to cite, the 0, 99 and -99 switch every crop check off
    income: 0, forage: 0, sow: 1, harv: 12, color: '#a9856a' },   // bare soil the whole year
};

// ---- soil-test limits: a crop with no published value here is never ruled out by a soil test
export const TEST_PH = {
  corn: [5.5, 7.5, 5, 8.5], wheat: [6, 7.5, 5, 8.5], barley: [6, 7.5, 5, 8.5], sorghum: [6, 7.5, 5, 8.5], swheat: [6, 7.5, 5, 8.5], oats: [5.5, 7, 4.5, 8],   // pH: FAO ECOCROP, rounded to 0.5
  rye: [5.5, 7, 4.5, 8], rice: [5.5, 7, 4, 8.5], soy: [6, 7.5, 5, 8], chickpea: [6, 8, 5, 9], lentil: [6, 7.5, 5, 8.5], pea: [6, 7.5, 5, 8],   // pH: FAO ECOCROP, rounded to 0.5
  bean: [6, 7, 5, 8], faba: [6, 7.5, 5, 8.5], groundnut: [5.5, 7, 4.5, 8], sunflower: [6, 7.5, 5, 8.5], canola: [6, 7.5, 5, 8.5], cotton: [6, 7.5, 5, 8.5],   // pH: FAO ECOCROP, rounded to 0.5
  potato: [5, 6.5, 4.5, 7.5], sugarbeet: [6, 7.5, 5.5, 8.5], tomato: [5.5, 7, 5, 8], onion: [6, 7, 5.5, 8], cabbage: [6, 7.5, 5, 8.5], pepper: [5.5, 7, 5, 8],   // pH: FAO ECOCROP, rounded to 0.5
  alfalfa: [6.5, 7.5, 5.5, 8.5], carrot: [5.5, 7, 5, 8], lettuce: [6, 7, 5.5, 8], cucumber: [5.5, 7, 5, 8], sweetcorn: [5.5, 7.5, 5, 8.5], greenbean: [6, 7, 5, 8],   // pH: FAO ECOCROP, rounded to 0.5
  triticale: [5.5, 7.5, 4.5, 8.5], durum: [6, 8, 5, 8.5],   // pH: FAO ECOCROP, rounded to 0.5
};
export const TEST_SAL = {
  corn: [1.7, 12], wheat: [6, 7.1], barley: [8, 5], sorghum: [6.8, 16], swheat: [6, 7.1],   // salt: Maas & Hoffman 1977; FAO Irrigation and Drainage Paper 29 rev. 1, Table 4
  rye: [11.4, 10.8],   // salt: printed in neither FAO Irrigation and Drainage Paper 29 rev. 1 Table 4 nor FAO-56 Table 23; which publication it rests on is not on record
  rice: [3, 12], soy: [5, 20], bean: [1, 19], faba: [1.6, 9.6], cowpea: [4.9, 12], groundnut: [3.2, 29],   // salt: Maas & Hoffman 1977; FAO Irrigation and Drainage Paper 29 rev. 1, Table 4
  canola: [11, 13], safflower: [7, 5.3],   // salt: printed in neither FAO Irrigation and Drainage Paper 29 rev. 1 Table 4 nor FAO-56 Table 23; which publication they rest on is not on record
  flax: [1.7, 12], cotton: [7.7, 5.2], potato: [1.7, 12], sweetpotato: [1.5, 11], sugarbeet: [7, 5.9], tomato: [2.5, 9.9], onion: [1.2, 16], cabbage: [1.8, 9.7], pepper: [1.5, 14],   // salt: Maas & Hoffman 1977; FAO Irrigation and Drainage Paper 29 rev. 1, Table 4
  alfalfa: [2, 7.3], carrot: [1, 14], lettuce: [1.3, 13], cucumber: [2.5, 13],   // salt: Maas & Hoffman 1977; FAO Irrigation and Drainage Paper 29 rev. 1, Table 4
  eggplant: [1.1, 6.9],   // salt: printed in neither FAO Irrigation and Drainage Paper 29 rev. 1 Table 4 nor FAO-56 Table 23; which publication it rests on is not on record
  sweetcorn: [1.7, 12], spinach: [2, 7.6], greenbean: [1, 19],   // salt: Maas & Hoffman 1977; FAO Irrigation and Drainage Paper 29 rev. 1, Table 4
  triticale: [6.1, 2.5],   // salt: printed in neither FAO Irrigation and Drainage Paper 29 rev. 1 Table 4 nor FAO-56 Table 23; which publication it rests on is not on record
  durum: [5.9, 3.8],   // salt: FAO-56 Table 23, the top of its range for durum wheat (5.7 to 5.9) and the low end of its loss (3.8 to 5.5); FAO Irrigation and Drainage Paper 29 rev. 1 Table 4 prints 5.7
};

// ---- the contract: one entry per crop that stays in the ground (nothing rotates, so these are compared with the climate, never scored)
// name, garden   the crop and what its place is called          stays, rain, soil, frost   the four plain sentences of the garden report
// rainOpt [low, high], rainMin, rainMax   yearly rain, mm: best range and outer limits
// dry       needs a dry season to flower and dislikes a very wet place          noFrost   any frost kills it
// kill      frost, °C, that hurts new growth          winterKill   cold, °C, that hurts the resting plant
// heat, heatSevere   daily high, °C, where heat stress starts; where clear harm starts
// ph [low, high], phAbs [low, high]   best soil pH and the outer range          steep   commonly grown on slopes or terraces
// irrigated  lives on ground water or irrigation, not rain          humid   needs humid air as well as rain; watering cannot stand in for it
// chill [need, high]   winter chill hours (0 to 7.2 °C)          wb   its World Bank Pink Sheet price column (absent = no world price)
// summer, summerMild   warmth it needs, °C: the year's average for frost-tender tropical crops, the warmest month for the rest
// maxSummer, msTol     hottest month a cool-summer crop takes; the slack above it before it is hidden (1.5 when absent)
// minMonth  coolest month it needs          minNight  coldest night of a normal year a frost-free tropical tree takes
// needCool  the coolest month must be at or under this: a cool rest          warm   lowest monthly mean it grows at (10 of 12 months must reach it)
// maxDryMonths  months under 30 mm it takes          minDry  months under 60 mm it NEEDS          dryS  the two midsummer months must average under this, mm
// dryA, dryB    too many months under 60 mm (A) or 100 mm (B) and the place is savanna          wetMult  how far above rainOpt high it is kept (1.5 when absent)
// maxAlt    highest ground, m, where it is grown for a living          chillSoft, chillHard, protectable   see the lines under the table
// budCold   which bud-frost tables of BUD_COLD_F fit it          src   the sources, for the "i" button          color   its one colour
// An absent yes-or-no field means no. The order is also the order shown when nothing else separates two crops.
export const GARDENS = {
  tea: { name: 'Tea', garden: 'tea garden', rainOpt: [1400, 2000], rainMin: 1000, rainMax: 5000, kill: 0, heat: 30, heatSevere: 35, ph: [4.5, 5.5], phAbs: [4, 6], steep: true, wb: 'Tea, avg 3 auctions', color: '#3f8f4a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Tea bushes are picked for many decades.', rain: 'Tea likes plenty of rain all through the year.',
    soil: 'Tea likes acid soil, about pH 4.5 to 5.5.', frost: 'new shoots (the flush) and young leaves',
    src: 'FAO ECOCROP database; De Costa, Mohotti & Wijeratne 2007, Ecophysiology of tea, Braz. J. Plant Physiol.; UF/IFAS EDIS HS308' },
  hazelnut: { name: 'Hazelnuts', garden: 'hazelnut garden', rainOpt: [900, 1100], rainMin: 600, kill: -3, heat: 35, ph: [6, 6.5], phAbs: [5.5, 7.5], steep: true, chill: [290, 1550], color: '#a8743a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Hazelnut bushes give nuts for 40 to 50 years.', rain: 'Hazelnut likes rain spread over the year and suffers in long dry summers.',
    soil: 'Hazelnut likes deep soil that drains well, about pH 6 to 6.5.', frost: 'new leaves, shoots and young nuts',
    src: 'FAO ECOCROP database; Oregon State Univ. Extension EM 9072 Growing Hazelnuts in the Pacific Northwest; Mehlenbacher 1991' },
  coffee: { name: 'Arabica coffee', garden: 'coffee farm', rainOpt: [1400, 2300], rainMin: 750, rainMax: 4200, dry: true, noFrost: true, heat: 30, ph: [5.5, 7], phAbs: [4.3, 8.4], steep: true, wb: 'Coffee, Arabica', color: '#b23a2e',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Arabica coffee bushes give beans for 20 to 30 years with good pruning.', rain: 'Arabica likes 1,400 to 2,300 mm of rain, with a short dry spell before flowering.',
    soil: 'Arabica likes deep, rich soil that drains well, about pH 5.5 to 7.', frost: 'leaves, young shoots and berries',
    src: 'FAO ECOCROP database; Camargo 2010, Bragantia 69(1):239-247; DaMatta & Ramalho 2006, Braz. J. Plant Physiol. 18:55-81' },
  robusta: { name: 'Robusta coffee', garden: 'coffee farm', rainOpt: [1700, 3000], rainMin: 900, rainMax: 4000, dry: true, noFrost: true, heat: 32, ph: [5, 6.3], phAbs: [4, 8], wb: 'Coffee, Robusta', color: '#8a3a2a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Robusta coffee bushes give beans for 20 to 30 years.', rain: 'Robusta likes lots of rain, 1,700 to 3,000 mm, with a short dry spell.',
    soil: 'Robusta likes deep soil that drains well, about pH 5 to 6.3.', frost: 'leaves and young berries (cold below 6 C already hurts)',
    src: 'FAO ECOCROP database; Camargo 2010, Bragantia 69(1); Kath et al. 2020, Global Change Biology' },
  cocoa: { name: 'Cocoa', garden: 'cocoa farm', rainOpt: [1200, 3000], rainMin: 900, rainMax: 7600, noFrost: true, heat: 32, ph: [5, 6.5], phAbs: [4, 8], wb: 'Cocoa', color: '#b5651d',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Cocoa trees give pods for about 20 to 30 years.', rain: 'Cocoa likes about 1,500 to 2,500 mm of rain and no more than four dry months.',
    soil: 'Cocoa likes deep soil that drains well, about pH 5 to 6.5.', frost: 'the whole tree: leaves, flowers and pods',
    src: 'FAO ECOCROP database; ICCO, Growing cocoa; Eskes 2006 cited in ICCO symposium paper T1.252' },
  oilpalm: { name: 'Oil palm', garden: 'plantation', rainOpt: [1500, 3000], rainMin: 1000, rainMax: 8000, noFrost: true, heat: 33, ph: [4.5, 6], phAbs: [3.2, 8], wb: 'Palm oil', color: '#d9772a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Oil palms give fruit bunches for about 25 years, then are replanted.', rain: 'Oil palm likes 1,500 to 3,000 mm of rain with no long dry season.',
    soil: 'Oil palm likes deep, moist soil that drains well, about pH 4.5 to 6.', frost: 'leaves and the growing spear',
    src: 'FAO ECOCROP database; MINADER Cameroon, Oil palm plantation management sheet; TNAU Agritech / Corley & Tinker climatic ranges' },
  rubber: { name: 'Rubber', garden: 'rubber plantation', rainOpt: [2000, 4000], rainMin: 1200, rainMax: 6000, noFrost: true, heat: 34, ph: [4.5, 6], phAbs: [3.5, 8], steep: true, wb: 'Rubber, TSR20 **', color: '#7a6a55',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Rubber trees are tapped for about 25 to 30 years.', rain: 'Rubber likes heavy rain, 2,000 to 4,000 mm, spread through the year.',
    soil: 'Rubber likes deep soil that drains well, about pH 4.5 to 6.', frost: 'leaves and young shoots',
    src: 'FAO ECOCROP database; Philippine Dept. of Agriculture; NSF Sri Lanka land suitability for rubber' },
  banana: { name: 'Bananas and plantains', garden: 'banana plantation', rainOpt: [1400, 2400], rainMin: 1000, rainMax: 5000, noFrost: true, heat: 38, ph: [5.5, 6.5], phAbs: [4.5, 8], wb: 'Banana, US', color: '#f2cf3a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'A banana field gives bunches for about 5 to 10 years before replanting.', rain: 'Bananas need water all year, about 1,400 to 2,400 mm of rain.',
    soil: 'Bananas like deep, rich soil that drains well, about pH 5.5 to 6.5.', frost: 'leaves and the fruit bunch',
    src: 'FAO ECOCROP database; FAO Land & Water crop information: Banana' },
  citrus: { name: 'Oranges and citrus', garden: 'orange grove', rainOpt: [1200, 2000], rainMin: 450, rainMax: 2700, kill: 0, heat: 36, heatSevere: 39, ph: [5, 6], phAbs: [4, 8.3], wb: 'Orange', color: '#f39a1e',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Orange trees give fruit for 30 to 50 years.', rain: 'Oranges like 1,200 to 2,000 mm of rain, or watering in dry months.',
    soil: 'Oranges like deep soil that drains well, about pH 5 to 6.', frost: 'flowers and young fruit; harder frost hurts leaves and branches',
    src: 'FAO ECOCROP database; FAO Land & Water crop information: Citrus; Citrus heat-stress reviews' },
  olive: { name: 'Olives', garden: 'olive grove', rainMin: 200, dry: true, kill: 0, heat: 30, heatSevere: 35, ph: [6, 7], phAbs: [5.3, 8.5], steep: true, color: '#6f7a3a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Olive trees can give fruit for a hundred years or more.', rain: 'Olive likes dry summers and only 400 to 700 mm of rain a year.',
    soil: 'Olive likes soil that drains fast, about pH 6 to 7.', frost: 'flowers and fruit; hard winter frost hurts branches',
    src: 'FAO ECOCROP database; FAO Land & Water crop information: Olive; FAO I2800E' },
  grape: { name: 'Grapes', garden: 'vineyard', dry: true, kill: -1.2, heat: 35, ph: [5.5, 7.5], phAbs: [4.5, 8.5], steep: true, chill: [136, 392], color: '#6a3f9a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Grapevines give grapes for 25 to 50 years.', rain: 'Grapes like dry summers and about 700 to 850 mm of rain a year.',
    soil: 'Grapes like soil that drains well, about pH 5.5 to 7.5.', frost: 'new shoots and young flower clusters',
    src: 'FAO ECOCROP database; FAO Land & Water crop information: Grape; WSU Wine Extension, Cold hardiness table' },
  apple: { name: 'Apples and pears', garden: 'orchard', rainOpt: [700, 2500], rainMin: 500, rainMax: 3200, kill: -2.2, heat: 35, ph: [6, 7], phAbs: [4.5, 8], steep: true, chill: [800, 1500], color: '#d6392e',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Apple and pear trees give fruit for 15 to 30 years.', rain: 'Apples and pears like steady rain or watering, and need a cold winter.',
    soil: 'Apples and pears like deep soil that drains well, about pH 6 to 7.', frost: 'flowers and young fruit',
    src: 'FAO ECOCROP database; MSU Extension, Critical spring temperatures for tree fruit bud stages; OEHHA 2022 Indicators of Climate Change in California: Winter chill' },
  stonefruit: { name: 'Peaches, apricots, cherries', garden: 'orchard', rainOpt: [500, 1300], rainMin: 300, rainMax: 1600, kill: -2.2, heat: 35, ph: [5.5, 7], phAbs: [4.5, 8], steep: true, chill: [650, 1300], color: '#f29a76',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Peach, apricot and cherry trees give fruit for about 15 to 25 years.', rain: 'These trees like 500 to 1,300 mm of rain and need a cold winter.',
    soil: 'They like deep soil that drains well, about pH 5.5 to 7.', frost: 'flowers and young fruit',
    src: 'FAO ECOCROP database; WSU Tree Fruit, Critical bud temperatures; MSU Extension critical spring temperatures' },
  almond: { name: 'Almonds', garden: 'orchard', rainOpt: [600, 900], rainMin: 250, rainMax: 1500, dry: true, kill: -2.2, heat: 38, ph: [6.5, 7], phAbs: [5.5, 8], color: '#c79a6a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Almond trees give nuts for about 20 to 25 years.', rain: 'Almonds like dry summers and 600 to 900 mm of rain.',
    soil: 'Almonds like deep soil that drains very well, about pH 6.5 to 7.', frost: 'flowers and small nuts',
    src: 'FAO ECOCROP database; UC ANR / The Almond Doctor, almond frost critical temperatures; OEHHA 2022 Winter chill indicator' },
  walnut: { name: 'Walnuts', garden: 'orchard', rainOpt: [800, 1700], rainMin: 400, rainMax: 2200, kill: -1.1, winterKill: -24, heat: 38, ph: [5.5, 6.5], phAbs: [4.5, 8.3], chill: [600, 1000], color: '#9a6a42',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Walnut trees give nuts for 40 to 60 years or more.', rain: 'Walnuts like 800 to 1,700 mm of rain, or watering in summer.',
    soil: 'Walnuts like very deep soil that drains well, about pH 5.5 to 6.5.', frost: 'new shoots, flowers and small nuts',
    src: 'FAO ECOCROP database; UC IPM walnut sunburn; UC frost guidance; NSW DPI Climate vulnerability factsheet: Walnut' },
  pistachio: { name: 'Pistachios', garden: 'orchard', rainOpt: [400, 700], rainMin: 250, rainMax: 1100, dry: true, kill: -1, heat: 40, ph: [7, 8], phAbs: [6, 8.5], chill: [750, 1000], color: '#a8bf6a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Pistachio trees give nuts for 50 years or more.', rain: 'Pistachio likes long hot dry summers and only 400 to 700 mm of rain.',
    soil: 'Pistachio likes soil that drains fast, about pH 7 to 8.', frost: 'flowers and new shoots',
    src: 'FAO ECOCROP database; UC Cooperative Extension pistachio; NSW DPI Pistachio industry expansion' },
  cashew: { name: 'Cashews', garden: 'cashew orchard', rainOpt: [750, 1600], rainMin: 400, rainMax: 4000, dry: true, noFrost: true, heat: 36, ph: [4.5, 6.5], phAbs: [3.8, 8.7], steep: true, color: '#f0b040',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Cashew trees give nuts for about 20 to 30 years.', rain: 'Cashew likes 750 to 1,600 mm of rain and a long dry season.',
    soil: 'Cashew grows on poor, sandy soil that drains well, about pH 4.5 to 6.5.', frost: 'leaves, flowers and young trees',
    src: 'FAO ECOCROP database; USAID cashew growers manual; Kerala Agricultural Univ.' },
  coconut: { name: 'Coconuts', garden: 'coconut grove', rainOpt: [1200, 2400], rainMin: 650, rainMax: 4000, noFrost: true, heat: 38, ph: [5, 8], phAbs: [4.3, 8.7], wb: 'Coconut oil', color: '#7a5234',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Tall coconut palms give nuts for about 60 years.', rain: 'Coconut likes 1,200 to 2,400 mm of rain spread over the year.',
    soil: 'Coconut likes sandy or loamy soil that drains well, about pH 5 to 8.', frost: 'leaves and young nuts',
    src: 'FAO ECOCROP database; ICAR-CPCRI Coconut extension publication No.133; Vikaspedia coconut cultivation practices' },
  mango: { name: 'Mangoes', garden: 'mango orchard', rainOpt: [600, 1500], rainMin: 300, dry: true, kill: -1.1, winterKill: -4, heat: 40, ph: [5.5, 7.5], phAbs: [4.3, 8.5], color: '#f5a623',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Mango trees give fruit for many decades.', rain: 'Mango likes 600 to 1,500 mm of rain and a dry season before flowering.',
    soil: 'Mango likes deep soil that drains well, about pH 5.5 to 7.5.', frost: 'flowers, young fruit and young trees',
    src: 'FAO ECOCROP database; UF/IFAS Extension' },
  datepalm: { name: 'Date palms', garden: 'date palm grove', rainOpt: [200, 300], rainMin: 100, dry: true, kill: -6, heat: 40, ph: [6.5, 8], phAbs: [6, 8.5], irrigated: true, color: '#9a5a2a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Date palms give fruit for 40 to 60 years or more.', rain: 'Date palms like almost no rain; they need water from the ground or irrigation.',
    soil: 'Date palms like sandy soil that drains well, about pH 6.5 to 8.', frost: 'leaves and flower clusters',
    src: 'FAO ECOCROP database; FAO 2002 Date Palm Cultivation' },
  avocado: { name: 'Avocados', garden: 'avocado orchard', rainOpt: [500, 2000], rainMin: 300, rainMax: 2500, kill: -1.1, heat: 32, ph: [5, 7], phAbs: [4.5, 8.3], steep: true, color: '#5a7a2e',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Avocado trees give fruit for about 20 to 40 years.', rain: 'Avocado likes 500 to 2,000 mm of rain, but never standing water.',
    soil: 'Avocado needs soil that drains very well, about pH 5 to 7.', frost: 'flowers, young fruit and new leaves',
    src: 'FAO ECOCROP database; UF/IFAS; UC Cooperative Extension avocado notes; UC Master Gardeners' },
  sugarcane: { name: 'Sugarcane', garden: 'cane field', rainOpt: [1500, 2000], rainMin: 1000, rainMax: 5000, dry: true, kill: 0, heat: 38, ph: [5, 8], phAbs: [4.5, 9], wb: 'Sugar, world', color: '#93b83a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Sugarcane is cut every year and regrows for 3 to 5 harvests.', rain: 'Sugarcane needs lots of water, 1,500 to 2,500 mm, then a dry, cool ripening time.',
    soil: 'Sugarcane likes deep soil that drains well, about pH 5 to 8.', frost: 'leaves and the top growing buds',
    src: 'FAO ECOCROP database; FAO Land & Water crop information: Sugarcane' },
  pineapple: { name: 'Pineapples', garden: 'pineapple field', rainOpt: [800, 2500], rainMin: 550, rainMax: 3500, noFrost: true, heat: 32, heatSevere: 35, ph: [4.5, 6.5], phAbs: [3.5, 9], color: '#e9b82e',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'A pineapple field gives one main crop and one more crop, over 2 to 4 years.', rain: 'Pineapple likes 800 to 2,500 mm of rain and can stand dry spells.',
    soil: 'Pineapple likes acid, light soil that drains well, about pH 4.5 to 6.5.', frost: 'leaves and fruit',
    src: 'FAO ECOCROP database; FAO Land & Water crop information: Pineapple; Queensland DAF pineapple' },
  strawberry: { name: 'Strawberries', garden: 'berry field', rainOpt: [600, 900], rainMin: 300, rainMax: 1700, kill: -1.1, heat: 30, ph: [5.5, 6.5], phAbs: [4.5, 8.2], color: '#e0343c',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Strawberry plants give fruit for 2 to 4 years.', rain: 'Strawberries need steady water, about 600 to 900 mm of rain or watering.',
    soil: 'Strawberries like soil that drains well, about pH 5.5 to 6.5.', frost: 'open flowers',
    src: 'FAO ECOCROP database; Virginia Tech Extension SPES-56, Frost/Freeze Protection in Strawberry; Clemson/SC Extension and MSU Extension' },
  blueberry: { name: 'Blueberries', garden: 'berry field', rainOpt: [900, 1100], rainMin: 700, rainMax: 1300, kill: -2.2, heat: 30, heatSevere: 40, ph: [4.5, 5.5], phAbs: [3, 5.5], chill: [150, 1000], color: '#3f58b0',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Blueberry bushes can give fruit for 30 to 50 years.', rain: 'Blueberries need steady moisture because their roots are shallow.',
    soil: 'Blueberries need acid soil that drains well, about pH 4.5 to 5.5.', frost: 'open flowers and young fruit',
    src: 'FAO ECOCROP database; Penn State Extension, Highbush Blueberry Production; Oregon State Extension' },
  raspberry: { name: 'Raspberries and blackberries', garden: 'berry field', rainOpt: [800, 1200], rainMin: 300, rainMax: 1700, kill: -1, heat: 32, ph: [5.5, 6.5], phAbs: [4.5, 7.8], chill: [200, 1400], color: '#c2305a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Raspberry and blackberry plants give fruit for about 8 to 15 years.', rain: 'They need steady water while fruiting, about 800 to 1,200 mm of rain.',
    soil: 'They like soil that drains well, about pH 5.5 to 6.5.', frost: 'flowers and new shoots',
    src: 'FAO ECOCROP database; Oregon State Extension EC 1306; Univ. Kentucky HO-15 and Fruit Scout, Winter injury on brambles' },
  kiwi: { name: 'Kiwifruit', garden: 'kiwifruit orchard', rainOpt: [900, 1300], rainMin: 700, rainMax: 1500, kill: -1, winterKill: -10, heat: 35, ph: [6, 7], phAbs: [5.5, 7.5], chill: [600, 1100], color: '#8a6f3a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Kiwifruit vines give fruit from year 3 or 4 for 25 years or more.', rain: 'Kiwifruit needs plenty of water in summer, but its roots die in flooded soil.',
    soil: 'Kiwifruit likes deep soil that drains well, about pH 6 to 7.', frost: 'new shoots and flower buds',
    src: 'FAO ECOCROP database; UC ANR Small Farms Network, Kiwifruit production in California; NZKGI Kiwifruit Book, chapter 2' },
  fig: { name: 'Figs', garden: 'fig orchard', rainOpt: [700, 1500], rainMin: 300, rainMax: 2700, kill: -1, winterKill: -9, heat: 38, ph: [6, 7], phAbs: [4.3, 8.6], color: '#6a3f6a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Fig trees give fruit for 35 to 40 years or more.', rain: 'Figs stand dry weather; rain at ripening can split the fruit.',
    soil: 'Figs like soil that drains well, about pH 6 to 7.', frost: 'new shoots, buds and young fruit',
    src: 'FAO ECOCROP database; UF/IFAS EDIS HS27, The Fig; Valley Fig Growers / California Grown' },
  pomegranate: { name: 'Pomegranates', garden: 'pomegranate orchard', rainOpt: [900, 1200], rainMin: 400, rainMax: 4200, dry: true, kill: -2.2, winterKill: -11, heat: 40, ph: [5.5, 7], phAbs: [5.5, 8.5], color: '#c22a3a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Pomegranate trees give fruit for 20 to 30 years or more.', rain: 'Pomegranate likes hot, dry summers; rain at ripening can split fruit.',
    soil: 'Pomegranate likes soil that drains well, about pH 5.5 to 7.', frost: 'new shoots, flowers and young bark',
    src: 'FAO ECOCROP database; UGA Extension C997, Pomegranate Production; UF/IFAS EDIS HS44, The Pomegranate' },
  pecan: { name: 'Pecans', garden: 'pecan orchard', rainOpt: [600, 1200], rainMin: 400, rainMax: 1800, kill: -2.2, winterKill: -20, heat: 40, ph: [5.5, 6.5], phAbs: [5, 7.5], chill: [200, 500], color: '#8a5a36',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Pecan trees give nuts for many decades, starting in year 4 to 7.', rain: 'Pecans need much water in summer; dry places must irrigate.',
    soil: 'Pecans like deep soil that drains well, about pH 5.5 to 6.5.', frost: 'new shoots, leaves and flowers',
    src: 'FAO ECOCROP database; UF/IFAS EDIS HS984, The Pecan Tree; UGA Extension pecan blog' },
  macadamia: { name: 'Macadamia', garden: 'macadamia orchard', rainOpt: [1000, 3000], rainMin: 700, rainMax: 3500, kill: -2, winterKill: -4, heat: 35, ph: [5, 6.5], phAbs: [4.5, 7], steep: true, color: '#c9a274',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Macadamia trees give nuts from year 4 or 5 for many decades.', rain: 'Macadamia needs rain all through the year, about 1,200 mm or more.',
    soil: 'Macadamia likes deep, acid soil that drains well, about pH 5 to 6.5.', frost: 'young trees, flowers and new leaves',
    src: 'FAO ECOCROP database; NSW macadamia culture summary 1983; California Rare Fruit Growers, Macadamia fruit facts' },
  chestnut: { name: 'Chestnuts', garden: 'chestnut grove', rainOpt: [900, 1300], rainMin: 500, rainMax: 1600, kill: -1, winterKill: -29, heat: 32, ph: [5.5, 6.5], phAbs: [4, 7], steep: true, chill: [400, 500], color: '#7a4526',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Chestnut trees give nuts from year 2 or 3 for many decades.', rain: 'Chestnut needs rain in summer; long dry summers give small nuts.',
    soil: 'Chestnut likes acid soil that drains well, about pH 5.5 to 6.5.', frost: 'new shoots, buds and catkins',
    src: 'FAO ECOCROP database; Univ. Missouri Center for Agroforestry AF1007, Growing Chinese Chestnuts in Missouri; MSU Extension, Michigan chestnut updates' },
  blackpepper: { name: 'Black pepper', garden: 'spice garden', rainMax: 5500, noFrost: true, heat: 35, heatSevere: 40, ph: [4.5, 6.5], phAbs: [4.5, 7.5], steep: true, color: '#b02a2a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Pepper vines give berries from year 3 for about 15 to 20 years.', rain: 'Pepper needs plenty of rain spread over the year.',
    soil: 'Pepper likes rich soil that drains well, about pH 4.5 to 6.5.', frost: 'the whole vine',
    src: 'FAO ECOCROP database; ICAR-IISR, Good Agricultural Practices: Black Pepper; DASD India, Good Agricultural Practices for Black Pepper' },
  cardamom: { name: 'Cardamom', garden: 'spice garden', rainOpt: [3000, 6000], rainMin: 1500, rainMax: 7000, noFrost: true, heat: 32, heatSevere: 35, ph: [5.5, 6], phAbs: [4.8, 7], steep: true, color: '#7fae5a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Cardamom plants give pods from year 3 for about 8 to 12 years.', rain: 'Cardamom needs much rain spread through the year, and shade.',
    soil: 'Cardamom likes rich forest soil that drains well, about pH 5.5 to 6.', frost: 'the whole plant',
    src: 'FAO ECOCROP database; Spices Board India, small cardamom cultivation manual; AICRP on Spices, Cardamom' },
  vanilla: { name: 'Vanilla', garden: 'spice garden', rainOpt: [2000, 2500], rainMin: 1500, rainMax: 3000, dry: true, noFrost: true, heat: 32, ph: [5.5, 6.5], phAbs: [4.3, 8], color: '#4a3526',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Vanilla vines give beans from year 3 for about 12 to 14 years.', rain: 'Vanilla needs rain most of the year and a short dry spell to flower.',
    soil: 'Vanilla likes loose, rich soil that drains well, about pH 5.5 to 6.5.', frost: 'the whole vine',
    src: 'FAO ECOCROP database; TNAU Agritech, Vanilla; Vikaspedia, Vanilla package of practices' },
  cinnamon: { name: 'Cinnamon', garden: 'spice garden', rainOpt: [2000, 2600], rainMin: 1200, rainMax: 3000, noFrost: true, heat: 32, heatSevere: 36, ph: [5.5, 6.5], phAbs: [5, 7], color: '#b5653a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Cinnamon bushes are cut for bark from year 3 or 4 for many decades.', rain: 'Cinnamon needs a warm, wet climate with plenty of rain.',
    soil: 'Cinnamon likes deep soil that drains well, about pH 5.5 to 6.5.', frost: 'the whole plant',
    src: 'FAO ECOCROP database; Sri Lanka Dept. of Export Agriculture farmer guide; Northern Province cinnamon guide; AICRP on Spices, Cinnamon' },
  hops: { name: 'Hops', garden: 'hop yard', rainOpt: [400, 700], rainMin: 300, rainMax: 1300, kill: -2, winterKill: -29, heat: 29, ph: [6, 7], phAbs: [5, 8], chill: [720, 1440], color: '#9cc45a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'A hop yard gives cones from year 2 and lasts about 15 to 20 years.', rain: 'Hops need steady water and long summer days.',
    soil: 'Hops like deep soil that drains well, about pH 6 to 7.', frost: 'young spring shoots',
    src: 'FAO ECOCROP database; Univ. Tennessee Extension, Hop production presentations; Colorado State Univ. 2019, Hops don\'t need to go dormant to flower' },
  sisal: { name: 'Sisal', garden: 'sisal plantation', rainOpt: [900, 1250], rainMin: 500, rainMax: 1800, kill: -5, winterKill: -5, heat: 40, heatSevere: 45, ph: [6, 7.5], phAbs: [5.5, 8], color: '#5f9a8a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Sisal plants give leaves for about 7 to 15 years, then flower and die.', rain: 'Sisal stands dry spells; it grows best with 900 to 1,250 mm of rain.',
    soil: 'Sisal likes light soil that drains well, about pH 6 to 7.5.', frost: 'leaves',
    src: 'FAO ECOCROP database; South Africa DALRRD, Sisal production brochure; ICRAF Useful Trees, Agave sisalana' },
  papaya: { name: 'Papaya', garden: 'papaya field', rainOpt: [1500, 2500], rainMin: 1000, rainMax: 3000, noFrost: true, heat: 32, ph: [5.5, 6.7], phAbs: [4.5, 8], color: '#f08a3c',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'A papaya plant fruits within a year and is replaced after 2 to 4 years.', rain: 'Papaya needs plenty of rain or watering, but flooding kills it fast.',
    soil: 'Papaya likes light soil that drains very well, about pH 5.5 to 6.7.', frost: 'the whole plant: leaves, top and fruit',
    src: 'FAO ECOCROP database; UF/IFAS EDIS HS11, Papaya Growing in the Florida Home Landscape; Morton 1987, Fruits of Warm Climates: Papaya' },
  guava: { name: 'Guava', garden: 'guava orchard', rainOpt: [1000, 3000], rainMin: 400, rainMax: 5000, kill: -2, winterKill: -4, heat: 38, ph: [4.5, 7], phAbs: [4, 8.5], color: '#a8c94a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Guava trees give fruit for 15 to 40 years; best in the first 15.', rain: 'Guava likes 1,000 to 2,000 mm of rain but stands dry spells.',
    soil: 'Guava grows in many soils, best about pH 4.5 to 7.', frost: 'young trees, new shoots and leaves',
    src: 'FAO ECOCROP database; UF/IFAS EDIS HS4, Guava Growing in the Florida Home Landscape; Morton 1987, Fruits of Warm Climates: Guava' },
  lychee: { name: 'Lychee', garden: 'lychee orchard', rainOpt: [1000, 1700], rainMin: 700, rainMax: 2800, dry: true, kill: -2, winterKill: -4, heat: 35, heatSevere: 40, ph: [5.5, 6.5], phAbs: [5, 8.5], color: '#c8324e',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Lychee trees fruit from year 3 to 5 and can bear for 100 years.', rain: 'Lychee needs hot, wet summers and a cool, dry winter to flower.',
    soil: 'Lychee likes deep soil that drains well, about pH 5.5 to 6.5.', frost: 'young trees, new flush and flowers',
    src: 'FAO ECOCROP database; UF/IFAS EDIS HS6, Lychee Growing in the Florida Home Landscape; Morton 1987, Fruits of Warm Climates: Lychee' },
  passionfruit: { name: 'Passion fruit', garden: 'passion fruit field', rainOpt: [900, 2000], rainMin: 600, rainMax: 2500, kill: -1, winterKill: -2, heat: 32, ph: [6, 7], phAbs: [5.5, 8.5], color: '#5a2f6a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'Passion fruit vines fruit within 1 to 2 years and last 3 to 6 years.', rain: 'Passion fruit needs 900 to 2,000 mm of rain spread through the year.',
    soil: 'Passion fruit likes soil that drains well, about pH 6 to 7.', frost: 'leaves, shoots and whole vine',
    src: 'FAO ECOCROP database; UF/IFAS EDIS HS1467, The Emerging Passion Fruit Industry in Florida; UF/IFAS EDIS HS1397, Passion Fruit Problems in the Home Landscape' },
  asparagus: { name: 'Asparagus', garden: 'asparagus field', rainOpt: [800, 1200], rainMin: 500, rainMax: 4000, kill: -2.2, heat: 29, ph: [6.5, 7.5], phAbs: [6, 8.2], color: '#5f9a4a',   // needs from FAO ECOCROP and the crop bodies named in src
    stays: 'An asparagus field is cut from year 2 or 3 for 12 to 20 years.', rain: 'Asparagus needs 800 to 1,200 mm of rain or watering, and a yearly rest.',
    soil: 'Asparagus likes deep soil that drains well, about pH 6.5 to 7.5.', frost: 'young spears',
    src: 'FAO ECOCROP database; MSU Extension, Growing asparagus; Purdue Extension HO-96-W, Asparagus' },
  trees: { name: 'Other trees or bushes', garden: 'orchard', color: '#4f9a4a',   // the catch-all entry: no figures, so no climate check
    stays: 'Fruit and nut trees stay for many years.', rain: 'Young fruit needs water in dry spells.',
    soil: 'Most trees need deep soil that drains well.', frost: 'flowers and young fruit',
    src: 'General guidance' },
};

// ---- limits found by holding the tables against real places: one line each, with the place that proves it where one is on record
const fix = (ids, more) => { for (const id of [].concat(ids)) Object.assign((own(CROPS, id) ? CROPS : GARDENS)[id], more); };

// field crops: a cool season is needed
fix(['wheat', 'swheat', 'durum', 'triticale'], { maxCool: 22, maxCoolHumid: 19 });   // no wheat in the humid lowland tropics, where every month is 24 °C or more; rust and leaf blight fail it even at 21 °C in Tabasco, Veracruz and Belize, while drier Pune keeps 22
fix('barley', { maxCool: 20.5, maxCoolHumid: 19 });   // barley fails with wheat in the wet tropics (Tabasco, Veracruz, Belize)
fix(['canola', 'scanola', 'oats', 'rye'], { maxCool: 20, maxCoolHumid: 19 });   // cool-season crops: none where the coolest month stays warm, as on the coast of Tanzania (23 to 28 °C all year)
// field crops: a warm enough season is needed (one finding covers all ten: the Yukon, Nunavik and the northern edge of the prairies are offered none of them)
fix('cotton', { minSeason: 21 });   // no cotton on the Black Sea coast; none in the Yukon, Nunavik or at the northern edge of the prairies
fix('rice', { minSeason: 18 });   // no rice in Germany; none in the Yukon, Nunavik or at the northern edge of the prairies
fix('sorghum', { minSeason: 19 });   // no sorghum in the Yukon, Nunavik or at the northern edge of the prairies
fix('soy', { minSeason: 15.3 });   // no soybeans in the Yukon, Nunavik or at the northern edge of the prairies
fix('corn', { minSeason: 13.3 });   // no corn in the Yukon, Nunavik or at the northern edge of the prairies; Ottawa, Quebec and southern Manitoba grow it
fix('sunflower', { minSeason: 14 });   // no sunflowers in the Yukon, Nunavik or at the northern edge of the prairies
fix('scanola', { minSeason: 12 });   // no spring canola in the Yukon, Nunavik or at the northern edge of the prairies
fix('chickpea', { minSeason: 10.3 });   // no chickpeas in the Yukon, Nunavik or at the northern edge of the prairies
fix('lentil', { minSeason: 9.5 });   // no lentils in the Yukon, Nunavik or at the northern edge of the prairies
fix('barley', { minSeason: 3.3 });   // no barley in the Yukon, Nunavik or at the northern edge of the prairies
// field crops: a real summer is needed (Quito's cool highlands grow wheat all year; Norway's Arctic coast grows none)
fix(['wheat', 'canola', 'scanola'], { minHot: 14 });   // no wheat or canola on Norway's Arctic coast: the warmest month must reach 14 °C
fix('swheat', { minHot: 12 });   // no wheat on Norway's Arctic coast: spring wheat's warmest month must reach 12 °C
fix('barley', { minHot: 11 });   // barley's warmest month must reach 11 °C
fix('oats', { minHot: 10 });   // oats' warmest month must reach 10 °C
fix('sunflower', { minHot: 18 });   // none in central Sweden, hottest month about 17 °C
// field crops: single limits
fix('cassava', { minCool: 16 });   // cassava needs a coolest month of 16 °C
fix('cotton', { heatMargin: 7 });   // a watered cotton canopy cools itself: upper Sindh, hottest month 38 °C, grows it, so "far too hot" starts at 43 °C
fix('cotton', { needDry: 2 });   // cotton needs two months under 60 mm to ripen and dry
fix('cotton', { maxAlt: 1500 });   // a 50 km weather square cannot see that a field sits on a 2,000 m plateau
fix('pmillet', { maxAlt: 1600 });   // the same blind spot: a 50 km weather square cannot see a 2,000 m plateau
fix('cassava', { maxAlt: 1800 });   // the same blind spot: a 50 km weather square cannot see a 2,000 m plateau
fix(['barley', 'oats'], { mildAutumn: true });   // sown in autumn where winters are mild: Iraq, Morocco, Egypt, Spain
fix(['chickpea', 'lentil', 'faba', 'durum', 'swheat', 'mustardseed', 'potato'], { mildAutumn: true });   // winter crops of Punjab, the Nile, Iraq and Andalusia
fix(['faba', 'potato'], { tropic: false });   // rabi crops in India, winter crops in Egypt: sown by the calendar, not with the rains
fix(['sunflower', 'canola', 'scanola', 'mustardseed', 'safflower', 'soy', 'bean', 'greenbean', 'pea', 'lentil', 'faba', 'chickpea', 'lupin'], { scl: true });   // all hosts of sclerotinia stem rot: keep them 3 to 4 years apart
fix('soy', { nfix: 0.3 });   // most of the nitrogen leaves with the beans: this is what the next crop can count on, not the gross amount fixed
fix('alfalfa', { nfix: 0.5 });   // the hay takes much of it away: what the next crop can count on
fix('ley', { legumeMix: true });   // the clover fixes nitrogen; the grass half is still a cereal relative for pests
fix('rice', { water: 1100 });   // a flooded paddy also loses water to seepage and puddling (FAO: roughly 1,000 to 2,000 mm in the field)
fix('swheat', { minRatio: 0.52 });   // Saskatoon (388 mm a year) grows rain-fed spring wheat on stored soil water; only where its season averages 11 °C or more, and then shown as borderline
fix(['oats', 'sesame', 'pigeonpea', 'durum'], { major: true });   // each is grown on more than 5 million ha
fix('sugarbeet', { major: false });   // under 5 million ha worldwide (FAOSTAT)
fix('sunnhemp', { tMin: 10 });   // a tropical cover crop: no growth in a season cooler than 10 °C

// trees and bushes: humid air and rain in most months
fix(['tea', 'robusta', 'cocoa', 'oilpalm', 'rubber', 'coconut', 'blackpepper', 'cardamom', 'vanilla', 'cinnamon'], { humid: true });   // watering does not make Fresno, Meknes or Dubbo tea country, nor a dry place cocoa or oil palm country
fix('tea', { maxDryMonths: 4 });   // tea rests through a dry winter but not through a dry Mediterranean summer
fix('oilpalm', { maxDryMonths: 3 });   // oil palm needs rain in almost every month: none in the monsoon-and-dry climate of Nashik
fix(['cocoa', 'cardamom', 'vanilla'], { maxDryMonths: 4 });   // none in the monsoon-and-dry climate of Nashik
fix(['rubber', 'robusta', 'blackpepper', 'cinnamon'], { maxDryMonths: 5 });   // none on the Nashik plateau
fix('coconut', { maxDryMonths: 6 });   // coconuts stand the longest dry season of the wet-tropics crops
fix('blueberry', { maxDryMonths: 2 });   // no blueberries through a dry Mediterranean summer (lowbush in Maine, southern highbush in Florida)
fix(['cocoa', 'oilpalm', 'robusta'], { dryA: 4, dryB: 6 });   // a savanna with a long dry season is not cocoa, robusta or oil palm country
fix('rubber', { dryA: 4, dryB: 7 });   // nor is such a savanna rubber country
// trees and bushes: cool nights and cool months in the tropics
fix(['coconut', 'oilpalm', 'cocoa', 'vanilla'], { minNight: 12 });   // Ribeirão Preto is too cold for cocoa and coconut though no frost falls there
fix('blackpepper', { minNight: 11 });   // chilling injury well above freezing
fix(['cinnamon', 'cashew'], { minNight: 10 });   // chilling injury well above freezing
fix('robusta', { minNight: 9 });   // cold below 6 °C already hurts robusta leaves and berries
fix('rubber', { minNight: 8 });   // chilling injury well above freezing
fix(['pineapple', 'papaya'], { minNight: 3 });   // they take a cool night but not a near-frost
fix(['coconut', 'oilpalm'], { minMonth: 20 });   // they stop growing below about 20 °C: none in Crete or the Nile Delta though no frost falls there
fix('cocoa', { minMonth: 20 });   // cocoa stops growing below about 20 °C, like the two palms; an 18 °C figure is also on record, and the stricter one is kept until the owner settles it
fix(['robusta', 'rubber', 'blackpepper', 'vanilla', 'cinnamon'], { minMonth: 18 });   // lowland tropical crops: the coolest month must stay warm
fix('cashew', { minMonth: 17 });   // a tree of the hot tropics
fix('pineapple', { minMonth: 15 });   // growth stops in a cool winter
fix(['cardamom', 'sisal', 'papaya'], { minMonth: 14 });   // growth stops in a cool winter
fix('banana', { minMonth: 13 });   // Guangdong, the Canaries and Israel still grow bananas
fix('coffee', { minMonth: 12.5 });   // arabica is a crop of mild highlands with no cold season
fix(['guava', 'macadamia'], { minMonth: 12 });   // the cool Mediterranean winters of Fès are too cold
fix(['mango', 'passionfruit'], { minMonth: 12 });   // they need a warm winter as well as a frost-free one
fix('lychee', { minMonth: 10 });   // lychee wants a cool winter to flower, not a cold one
fix('sugarcane', { minMonth: 9 });   // Louisiana grows cane through a cool winter
fix('avocado', { minMonth: 7 });   // avocados take a cool winter, not a cold one
// trees and bushes: highest ground (a 50 km weather square cannot see that a field sits on a 2,000 m plateau)
fix('coconut', { maxAlt: 450 });   // palms of the coast, not of the hills
fix('oilpalm', { maxAlt: 600 });   // oil palm is a palm of the wet lowlands
fix('rubber', { maxAlt: 800 });   // rubber is a tree of the wet lowlands
fix(['robusta', 'cocoa', 'cashew', 'blackpepper', 'vanilla', 'cinnamon'], { maxAlt: 1000 });   // lowland and foothill crops of the hot tropics
fix('mango', { maxAlt: 1500 });   // mango is grown for a living only below about 1,500 m
fix(['sugarcane', 'macadamia', 'papaya'], { maxAlt: 1800 });   // above this it is too cool for them
fix('guava', { maxAlt: 2000 });   // guava climbs highest of the tropical fruit
// trees and bushes: months warm enough to grow
fix('macadamia', { warm: 10 });   // growth stops at 10 °C (NSW DPI)
fix(['blackpepper', 'cardamom', 'vanilla', 'sisal', 'guava'], { warm: 10 });   // they grow all year: ten of twelve months must reach 10 °C
fix('papaya', { warm: 12 });   // papaya stops growing sooner in the cool
fix('lychee', { warm: 15 });   // lychee needs a long warm season between its cool winters
fix('cinnamon', { warm: 18 });   // cinnamon grows only in steady warmth
// trees and bushes: warmth needed (the year's average for frost-tender tropical crops, 3 °C under their lowest best temperature; the warmest month for the rest, 4 °C under it)
fix('tea', { summer: 15.5 });   // no tea in Edinburgh or Dublin
fix('coffee', { summer: 17.5 });   // none on the cool Andean plateau (Boyacá, 15 °C), in highland Peru or New Zealand; Colombian, Kenyan and Ethiopian coffee land averages 18 °C or more
fix('citrus', { summer: 23, summerMild: 20 });   // none in Bordeaux or Kent; Lisbon's weather square reads cool on the coast, and citrus is grown there
fix('olive', { summer: 21 });   // olives need a warm summer to fill the fruit
fix('grape', { summer: 19.5 });   // none in Finland or central Sweden (hottest month 17.3 °C, nights to -20 °C); Kent and Cowichan are warmer
fix('apple', { summer: 15 });   // Lofoten and Vesterålen at 13 °C are too cool; Hardanger and Oulu at 16 °C are not
fix('almond', { summer: 21 });   // almonds ripen only in a warm summer
fix('walnut', { summer: 18.5 });   // none in Alaska or on the Newfoundland coast, hottest month 16.6 °C
fix('pistachio', { summer: 25 });   // pistachios need very hot summers
fix('mango', { summer: 23 });   // mango is a tree of the hot tropics and subtropics
fix('datepalm', { summer: 28 });   // dates ripen only in a very hot summer
fix('avocado', { summer: 20.5 });   // none on the fog coast of Oregon or northern California, nor the Atlantic coast of France at 19 °C
fix('sugarcane', { summer: 23 });   // cane needs a long hot season
fix('pineapple', { summer: 21 });   // none near Perth or Sydney (year averages 16 to 18 °C); Queensland, Hawaii and Costa Rica average 22 °C or more
fix('pecan', { summer: 27.5 });   // Kennewick at 25.6 °C and Taganrog and the Kuban at 25.2 to 25.5 °C are too cool; Georgia, Texas and northern Mexico are above 27
fix('hops', { summer: 17 });   // Kent, the Fraser valley and Yakima grow hops; Newfoundland and the cool coast of British Columbia do not
fix('lychee', { summer: 22 });   // none in the Ethiopian and Kenyan highlands, hottest month 17 to 20 °C
fix('guava', { summer: 21 });   // none on New Zealand's cool west coast
fix(['macadamia', 'passionfruit'], { summer: 21 });   // Galicia's 18.6 °C Atlantic summers do not ripen them
fix(['oilpalm', 'rubber'], { summer: 22 });   // crops of the hot lowland tropics
fix(['cashew', 'cinnamon'], { summer: 21 });   // crops of the hot tropics
fix(['robusta', 'banana', 'coconut', 'cardamom', 'pomegranate'], { summer: 19 });   // each needs this much warmth to crop
fix(['cocoa', 'vanilla', 'papaya'], { summer: 18 });   // each needs this much warmth to crop
fix(['kiwi', 'blackpepper'], { summer: 17 });   // each needs this much warmth to crop
// trees and bushes: summers too hot
fix('apple', { maxSummer: 28.2, msTol: 0.9 });   // apples do not crop in the 34 °C summers of the Punjab plain
fix('blueberry', { maxSummer: 29 });   // nor do blueberries crop in the Punjab plain's summers
fix('raspberry', { maxSummer: 27 });   // cane berries are fruit of cool summers
fix('hazelnut', { maxSummer: 26 });   // hazelnuts fail in the Punjab plain's heat
fix('hops', { maxSummer: 27 });   // hops fail in the Punjab plain's heat too
fix('kiwi', { maxSummer: 31 });   // kiwifruit takes a warmer summer than the berries, not a hot one
fix('tea', { maxSummer: 30, msTol: 0.4 });   // no tea in the 31 °C savanna; Assam at 29.6 °C is tea country
fix('coffee', { maxSummer: 25 });   // no arabica in the equatorial lowlands or the Nile Delta
fix('olive', { maxSummer: 33, msTol: 1.5 });   // Delhi is too hot for olives
fix('almond', { maxSummer: 32 });   // the hottest month an almond orchard takes
fix('walnut', { maxSummer: 28 });   // no walnuts on the humid Gulf coast
fix('pistachio', { maxSummer: 34, msTol: 1 });   // very hot summers suit pistachios, up to a point
fix('pecan', { maxSummer: 32 });   // the hottest month a pecan orchard takes
// trees and bushes: a cool rest is needed
fix(['asparagus', 'olive'], { needCool: 16 });   // none in the equatorial lowlands
fix('almond', { needCool: 14 });   // none where even the coldest month is warmer than 14 °C (Tamaulipas); Sfax and Andalusia are about 11
fix('grape', { needCool: 22 });   // none where every month is warmer than 24 °C: the Congo basin, Riau
// trees and bushes: rain and wetness
fix('datepalm', { rainMax: 500 });   // dates rot in humid air: none on the humid Çukurova coast (700 mm)
fix('olive', { rainOpt: [400, 1000], rainMax: 2200, wetMult: 2 });   // Sicily, Liguria and Corfu grow olives at 700 to 1,100 mm
fix('olive', { dryS: 105 });   // olives need a dry summer, not Niigata's wet one
fix('coffee', { wetMult: 2.2 });   // Costa Rica's Central Valley grows arabica at 2,500 mm
fix('grape', { rainOpt: [650, 1000], rainMin: 300 });   // Bordeaux, the Mosel and Rías Baixas are vine country, and so are the irrigated vineyards of the dry central coast
fix('grape', { rainMax: 2400, wetMult: 2.8 });   // the humid south of Brazil grows grapes at 2,000 mm, and tropical Maharashtra prunes twice a year
fix('mango', { rainMax: 4000, wetMult: 99, minDry: 3 });   // a dry season to flower, not a low yearly total: the Konkan coast (3,000 mm, five dry months) and Kerala grow it, all-year-wet Riau and the Chocó do not
fix('pomegranate', { wetMult: 1.45 });   // not a crop of the wet tropics
fix('hazelnut', { rainMax: 1800 });   // Oregon's Willamette Valley is the biggest hazelnut area of the United States
fix('walnut', { dry: true, wetMult: 0.8 });   // no walnuts on the humid Gulf coast
fix('blackpepper', { rainOpt: [1250, 3000], rainMin: 1000 });   // ICAR-IISR's range: a 2,000 mm floor would rule out Vietnam's Central Highlands
fix('citrus', { irrigated: true });   // orange groves live on watering in the dry months, not on rain alone
// trees and bushes: winter cold
fix('tea', { winterKill: -12 });   // hardy tea of Japan, Georgia and the Black Sea; the tender Assam type dies at -5 °C
fix('datepalm', { winterKill: -7 });   // date palms take a short frost, not a hard winter
fix('olive', { winterKill: -12 });   // hard winter frost kills the branches
fix('citrus', { winterKill: -9 });   // what mandarins and satsumas take; sweet oranges and lemons are hurt near -6 °C, so an orange grove needs a milder winter than this limit
fix('almond', { winterKill: -9 });   // flowers and wood do not survive the winters of the interior west, nor Ontario's; the resting tree alone would take -15 °C
fix('grape', { winterKill: -23, protectable: true });   // vines are buried for winter in Ukraine and Russia, so a near-killing winter costs less
fix('pistachio', { winterKill: -13 });   // a tree of mild winters
fix('hazelnut', { winterKill: -15 });   // the cold a resting hazelnut bush takes
fix('sugarcane', { winterKill: -10 });   // Louisiana cane is cut before the hard frosts
fix('apple', { winterKill: -35 });   // Antonovka and Michurin's hardy apples of Russia
fix('blueberry', { winterKill: -32 });   // blueberries come through hard northern winters (lowbush in Maine)
fix('stonefruit', { winterKill: -24 });   // peach and apricot buds are hurt near -20 °C and the wood near -25; only tart cherry takes -30
fix('avocado', { winterKill: -3 });   // Hass is damaged below about -3 °C: no avocados in Iowa
fix('raspberry', { winterKill: -35 });   // resting canes take -35 °C (ECOCROP)
// strawberry carries no winterKill on purpose: straw mulch and snow keep the crowns alive (Ohio State, UVM)
// trees and bushes: winter chill and spring frost on the buds
fix('almond', { chill: [100, 350] });   // low-chill almonds of Sfax and Andalusia; the weather square understates chill on mild coasts
fix('grape', { chillSoft: true });   // tropical Maharashtra crops grapes with two prunings a year and no winter chill
fix('apple', { chillHard: true });   // orchards need real winter cold: none in Florida
fix('apple', { budCold: ['apple', 'pear'] });   // WSU bud tables for apple and pear
fix('stonefruit', { budCold: ['peach', 'apricot', 'sweetcherry'] });   // WSU bud tables for peach, apricot and sweet cherry
fix('grape', { budCold: ['grape'] });   // WSU Prosser table for grape buds

// ---- spring frost on buds: each stage is [name, °F at which 10% of the buds die, °F at which 90% die], exactly as printed;
// harm starts at the 10% figure. Washington State University Extension bulletins (apple EB0913, pear EB0978, sweet cherry EB1128,
// peach EB0914 Elberta, apricot EB1240, as compiled by M. Longstroth, MSU Extension); grape: Proebsting, Brummund and Clore, WSU Prosser, primary buds.
// There is no plum entry among the gardens, so no plum table is carried; hazelnut, almond, walnut and the rest are not in these tables: they get the forecast only.
export const BUD_COLD_F = {
  apple: { name: 'apple', stages: [['Silver tip', 15, 2], ['Green tip', 18, 10], ['Half-inch green', 23, 15], ['Tight cluster', 27, 21], ['First pink', 28, 24], ['Full pink', 28, 25], ['First bloom', 28, 25], ['Full bloom', 28, 25], ['Post bloom', 28, 25]] },   // WSU Extension, °F as printed
  pear: { name: 'pear', stages: [['Bud scales separating', 15, 0], ['Blossom buds exposed', 20, 6], ['Tight cluster', 24, 15], ['First white', 25, 19], ['Full white', 26, 22], ['First bloom', 27, 23], ['Full bloom', 28, 24], ['Post bloom', 28, 24]] },   // WSU Extension, °F as printed
  apricot: { name: 'apricot', stages: [['Swollen bud', 15, null], ['Tips separate', 20, 0], ['Calyx red', 22, 9], ['First white', 24, 14], ['First bloom', 25, 19], ['Full bloom', 27, 22], ['In the shuck', 27, 24], ['Green fruit', 28, 25]] },   // WSU Extension, °F as printed
  peach: { name: 'peach', stages: [['Swollen bud', 18, 1], ['Calyx green', 21, 5], ['Calyx red', 23, 9], ['First pink', 25, 15], ['First bloom', 26, 21], ['Full bloom', 27, 24], ['Post bloom', 28, 25]] },   // WSU Extension, °F as printed
  sweetcherry: { name: 'cherry', stages: [['Swollen bud', 17, 5], ['Side green', 22, 9], ['Green tip', 25, 14], ['Tight cluster', 26, 17], ['Open cluster', 27, 21], ['First white', 27, 24], ['First bloom', 28, 25], ['Full bloom', 28, 25], ['Post bloom', 28, 25]] },   // WSU Extension, °F as printed
  grape: { name: 'grape', stages: [['First swell', 13, -3], ['Full swell', 21, 10], ['Bud burst', 25, 16], ['First leaf', 27, 21], ['Second leaf', 28, 22], ['Third leaf', 28, 26], ['Fourth leaf', 28, 27], ['Fifth leaf', 28, 27]] },   // WSU Extension, °F as printed
};

// ---- the ready rotations: slots is one crop per year of the cycle; zone only orders the list for a place and never hides anything
export const PRESETS = {
  'corn-soy': { label: 'Corn → Soybeans', slots: ['corn', 'soy'], zone: 'any' },
  'corn-corn': { label: 'Corn on corn', slots: ['corn'], zone: 'any' },
  'soy-soy': { label: 'Soybeans every year', slots: ['soy'], zone: 'any' },
  'wheat-fallow': { label: 'Wheat → Fallow', slots: ['wheat', 'fallow'], zone: 'dry' },
  'wheat-wheat': { label: 'Wheat on wheat', slots: ['wheat'], zone: 'temperate' },
  'wheat-barley': { label: 'Wheat → Barley', slots: ['wheat', 'barley'], zone: 'temperate' },
  'cotton-wheat': { label: 'Cotton → Wheat', slots: ['cotton', 'wheat'], zone: 'warm' },
  'corn-soy-wheat': { label: 'Corn → Soybeans → Wheat', slots: ['corn', 'soy', 'wheat'], zone: 'temperate' },
  'sunflower-wheat': { label: 'Sunflowers → Wheat', slots: ['sunflower', 'wheat'], zone: 'temperate' },
  'corn-bean': { label: 'Corn → Dry beans', slots: ['corn', 'bean'], zone: 'highland' },
  'potato-wheat': { label: 'Potatoes → Wheat', slots: ['potato', 'wheat'], zone: 'temperate' },
  'wheat-chickpea': { label: 'Wheat → Chickpeas', slots: ['wheat', 'chickpea'], zone: 'warm' },
  'millet-cowpea': { label: 'Pearl millet → Cowpeas', slots: ['pmillet', 'cowpea'], zone: 'tropic-dry' },
  'sorghum-groundnut': { label: 'Sorghum → Peanuts', slots: ['sorghum', 'groundnut'], zone: 'tropic-dry' },
  'cassava-corn': { label: 'Cassava → Corn', slots: ['cassava', 'corn'], zone: 'tropic-wet' },
  'rice-rice': { label: 'Rice every year', slots: ['rice'], zone: 'tropic-wet' },
  'teff-faba': { label: 'Teff → Faba beans', slots: ['teff', 'faba'], zone: 'highland' },
  'cotton-corn': { label: 'Cotton → Corn', slots: ['cotton', 'corn'], zone: 'warm' },
  'tobacco-corn': { label: 'Tobacco → Corn', slots: ['tobacco', 'corn'], zone: 'tropic-dry' },
  'sugarbeet-wheat': { label: 'Sugar beets → Wheat', slots: ['sugarbeet', 'wheat'], zone: 'temperate' },
  'canola-wheat': { label: 'Canola → Wheat', slots: ['canola', 'wheat'], zone: 'temperate' },
  'scanola-swheat': { label: 'Spring canola → Spring wheat', slots: ['scanola', 'swheat'], zone: 'temperate' },
  'wheat-lentil': { label: 'Wheat → Lentils', slots: ['wheat', 'lentil'], zone: 'dry' },
  custom: { label: 'Build my own', slots: [] },
};

// ---- the five "what is this?" explanations
export const WHAT_IT_DOES = {
  nfix: 'Peas, lentils, faba beans, clover and alfalfa (legumes) make their own fertiliser (nitrogen) from the air. A part of it stays in the soil, so the next crop may need less fertiliser. Soybeans and dry beans take much of it away with the grain.',
  cover: 'Cover crops are grown between your main crops to cover the soil. Their roots and leaves stop rain and wind taking soil, and feed the soil. But they drink some water too.',
  deep: 'Crops with deep roots (milo, sunflowers, alfalfa, radish) open holes in the soil so rain soaks in, and reach water that short roots cannot.',
  drought: 'Drought-tough crops (milo, chickpeas, barley, sunflowers) need less water. They may give a little less in a great year, but more in a dry year.',
  fallow: 'Leaving a field empty (fallow) can save some water for the next crop where rain is short. In a wet climate it saves little. But the bare soil can blow or wash away, and gets poorer.',
};

// ---- what a country's and a district's records call each crop (read by the "grown here" checks)
// FAOSTAT counts some crops under another crop's item, or only inside a catch-all item that cannot name the crop.
export const FAO_ALIAS = { pmillet: 'millet', fmillet: 'millet', swheat: 'wheat', durum: 'wheat', scanola: 'canola', robusta: 'coffee' };   // FAOSTAT has one item for all millets, all wheat, all rapeseed, all coffee
export const FAO_KIND = { pecan: 'nuts_nec', macadamia: 'nuts_nec', lychee: 'tropfruit_nec', passionfruit: 'tropfruit_nec', pomegranate: 'fruit_nec', guava: 'mango', mung: 'bean' };   // an empty item means none is grown; a filled one cannot say which crop
export const FAO_ONLY = { teff: ['ET', 'ER'] };   // teff is nearly all of "cereals n.e.c." in Ethiopia and Eritrea, and counted nowhere else
// The MapSPAM crop map (IFPRI): its own short names. A crop mapped on its own, or only inside a wider group.
export const SPAM_OF = {
  corn: ['maiz'], wheat: ['whea'], swheat: ['whea'], durum: ['whea'], barley: ['barl'], sorghum: ['sorg'], rice: ['rice'], pmillet: ['pmil'], fmillet: ['mill'],   // MapSPAM cereals
  soy: ['soyb'], chickpea: ['chic'], lentil: ['lent'], bean: ['bean'], cowpea: ['cowp'], groundnut: ['grou'], pigeonpea: ['pige'],   // MapSPAM pulses and soybeans
  sunflower: ['sunf'], canola: ['rape'], scanola: ['rape'], sesame: ['sesa'], cotton: ['cott'], potato: ['pota'], sweetpotato: ['swpo'], cassava: ['cass'], yam: ['yams'],   // MapSPAM oil crops, cotton, roots
  sugarbeet: ['sugb'], tobacco: ['toba'], tomato: ['toma'], onion: ['onio'], tea: ['teas'], coffee: ['coff'], robusta: ['rcof'], cocoa: ['coco'], oilpalm: ['oilp'],   // MapSPAM sugar, vegetables, stimulants
  rubber: ['rubb'], banana: ['bana', 'plnt'], citrus: ['citr'], coconut: ['cnut'], sugarcane: ['sugc'],   // MapSPAM tree crops and cane (bananas and plantains are two map layers)
};
export const SPAM_KIND = {
  oats: ['ocer'], rye: ['ocer'], quinoa: ['ocer'], buckwheat: ['ocer'], triticale: ['ocer'], teff: ['ocer'],   // MapSPAM "other cereals"
  pea: ['opul'], faba: ['opul'], lupin: ['opul'], bambara: ['opul'], mung: ['bean', 'opul'],   // MapSPAM "other pulses" (mung beans may sit with beans)
  safflower: ['ooil'], flax: ['ooil'], mustardseed: ['ooil'], olive: ['ooil'], hemp: ['ooil', 'ofib'], jute: ['ofib'], sisal: ['ofib'], taro: ['orts'],   // MapSPAM other oil crops, other fibre, other roots
  apple: ['temf'], stonefruit: ['temf'], grape: ['temf'], blueberry: ['temf'], raspberry: ['temf'], kiwi: ['temf', 'trof'], fig: ['temf', 'trof'], pomegranate: ['temf', 'trof'],   // MapSPAM temperate fruit
  mango: ['trof'], avocado: ['trof'], pineapple: ['trof'], datepalm: ['trof'], papaya: ['trof'], guava: ['trof'], lychee: ['trof'], passionfruit: ['trof'],   // MapSPAM tropical fruit
};
// Nuts, spices and hops ("rest of crops") and vegetables other than tomatoes and onions are never judged by the map:
// around Trabzon the map puts no "rest of crops" at all, yet hazelnuts are the main crop there.

// ---- every table is closed: a screen can read a crop but never change one
const lock = thing => { if (thing && typeof thing === 'object' && !Object.isFrozen(thing)) { Object.freeze(thing); Object.values(thing).forEach(lock); } return thing; };
for (const id of Object.keys(CROPS)) {   // the typed-soil-test limits ride on the crop they belong to
  const ph = own(TEST_PH, id) ? TEST_PH[id] : null, salt = own(TEST_SAL, id) ? TEST_SAL[id] : null;
  if (ph || salt) CROPS[id].soilTest = { ...(ph && { ph }), ...(salt && { salt }) };
}
[CROPS, GARDENS, PRESETS, BUD_COLD_F, WHAT_IT_DOES, TEST_PH, TEST_SAL, FAO_ALIAS, FAO_KIND, FAO_ONLY, SPAM_OF, SPAM_KIND].forEach(lock);

// ---- reading the tables: own() guards every lookup, so "toString" or "__proto__" can never pass as a crop
export const TYPES = lock(['cash', 'forage', 'cover', 'fallow']);
export const GROUPS = lock(['grain', 'legume', 'oil', 'fibre', 'root', 'sugar', 'veg', 'other', 'forage', 'cover', 'fallow']);   // also the order of the crop chooser
export const FAMILIES = lock(['grass', 'legume', 'brassica', 'nightshade', 'cucurbit', 'composite', 'chenopod', 'allium', 'mallow', 'carrot', 'aroid', 'yam', 'euphorbia', 'morning-glory', 'sesame', 'flax', 'hemp', 'buckwheat', 'none']);
export const ZONES = lock(['temperate', 'warm', 'dry', 'tropic-wet', 'tropic-dry', 'highland', 'any']);
export const isCrop = id => own(CROPS, id), isGarden = id => own(GARDENS, id), isPreset = id => own(PRESETS, id);
export const cropOf = id => isCrop(id) ? CROPS[id] : null;   // a field crop, a cover crop or fallow
export const gardenOf = id => isGarden(id) ? GARDENS[id] : null;   // a tree, bush, vine or palm
export const presetOf = id => isPreset(id) ? PRESETS[id] : null;
export const entryOf = id => cropOf(id) ?? gardenOf(id);   // field and garden ids never clash (the suite checks it)
export const cropName = (id, short = false) => { const name = entryOf(id)?.name ?? ''; return short ? name.replace(/ \(.*\)$/, '') : name; };   // short drops the bracket: "Corn"
export const cropColor = id => entryOf(id)?.color ?? '';
export const cropIds = (keep = () => true) => Object.keys(CROPS).filter(id => keep(CROPS[id], id));
export const cropsOfType = type => cropIds(crop => crop.type === type);
export const cropsOfGroup = group => cropIds(crop => crop.group === group);
export const gardenIds = () => Object.keys(GARDENS);
export const presetIds = () => Object.keys(PRESETS);
export const pickerGroups = () => GROUPS.map(group => ({ group, ids: cropsOfGroup(group) }));   // the chooser's list of field entries, group by group, all 70; the 44 garden entries have their own list (gardenIds)
export const budTables = id => (gardenOf(id)?.budCold ?? []).map(key => BUD_COLD_F[key]);   // the bud-frost tables for a garden; none for most

// The chooser's search: every crop whose name holds the typed words. A whole word comes first ("pear" finds apples and pears before
// pearl millet), then a part of a word ("berr"); within each, field crops before trees, in table order. One fruit and many are one word
// here ("cherry" finds cherries). There is no plum entry, so "plum" finds nothing: another fruit's needs must never answer for plums.
const SEARCH_ALSO = lock({ citrus: 'lemon mandarin satsuma' });   // fruit an entry covers that its name does not spell out
const oneOf = word => word.replace(/ies$/, 'y').replace(/(ch|sh|x|ss|o)es$/, '$1').replace(/([^s])s$/, '$1');   // peaches → peach, cherries → cherry, potatoes → potato
export function findCrops(text) {
  const typed = String(text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const rank = (table, id) => {   // 1 = every typed word is a whole word of the name, 2 = found inside a word, 0 = not found
    const name = `${table[id].name} ${own(SEARCH_ALSO, id) ? SEARCH_ALSO[id] : ''}`.toLowerCase(), parts = name.split(/[^a-z]+/).filter(Boolean).map(oneOf);
    if (!typed.every(word => name.includes(word) || parts.includes(oneOf(word)))) return 0;
    return typed.every(word => parts.includes(oneOf(word))) ? 1 : 2;
  };
  const found = [...Object.keys(CROPS).map(id => [id, rank(CROPS, id)]), ...Object.keys(GARDENS).map(id => [id, rank(GARDENS, id)])];
  return [1, 2].flatMap(want => found.filter(([, got]) => got === want).map(([id]) => id));
}
