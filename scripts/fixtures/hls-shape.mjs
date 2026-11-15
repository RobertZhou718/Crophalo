// The shape of the NASA HLS greenness lookup's answer (/api/hlsndvi), made by hand for the checks: the numbers are NOT real readings, and no screen ever shows them.
// The days are counted back from the day the build began, so the file writes no calendar day of its own. The real answer's fields are the lookup's contract.
export const BUILD_DAY = Date.UTC(2026, 10, 14) / 864e5;
export const dayBack = n => new Date((BUILD_DAY - n) * 864e5).toISOString().slice(0, 10);
const pass = (back, ndvi, sensor = 'Sentinel-2', clear = 9) => ({ date: dayBack(back), sensor, ndvi, clear_pixels: clear, of_pixels: 9, tile_cloud_pct: 19, tile: 'T17TNH', granule: 'HLS.S30.T17TNH.shape.v2.0' });
export const HLS_SHAPE = {
  ok: true, source: 'NASA / USGS Harmonized Landsat and Sentinel-2 (HLS) surface reflectance, 30 m, version 2.0, from NASA\'s Land Processes DAAC', pixel_m: 30,
  window: { first: dayBack(365), last: dayBack(1) },
  passes: [pass(120, 0.15, 'Landsat 8 and 9', 7), pass(90, 0.52), pass(40, 0.33), pass(9, 0.44)],
  periods: 24, periods_read: 4, gaps: [], skipped_periods: [], not_usable: { cloud: 8, snow: 13, water: 0, outside: 0 }, read_errors: 0, newest_date: dayBack(9), newest_ndvi: 0.44,
};
