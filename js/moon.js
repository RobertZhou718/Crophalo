// Crophalo's moon: where it stands and how much of it is lit, from the low-precision series of the astronomical almanac (about a third of a degree).
// Pure: no page, no storage, no network. Moments are UTC milliseconds, angles in degrees, the azimuth runs clockwise from north.
// Checked by scripts/test_farm3d.mjs against fresh answers of the US Naval Observatory.
import { julianDay } from './sun.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const norm360 = x => ((x % 360) + 360) % 360;
const sin = d => Math.sin(d * RAD), cos = d => Math.cos(d * RAD);

// The moon's place among the stars (ecliptic longitude and latitude, horizontal parallax) at a moment.
function ecliptic(ms) {
  const T = (julianDay(ms) - 2451545) / 36525;
  const lon = 218.32 + 481267.881 * T + 6.29 * sin(135.0 + 477198.87 * T) - 1.27 * sin(259.3 - 413335.36 * T) + 0.66 * sin(235.7 + 890534.22 * T)
    + 0.21 * sin(269.9 + 954397.74 * T) - 0.19 * sin(357.5 + 35999.05 * T) - 0.11 * sin(186.5 + 966404.03 * T);
  const lat = 5.13 * sin(93.3 + 483202.02 * T) + 0.28 * sin(228.2 + 960400.89 * T) - 0.28 * sin(318.3 + 6003.15 * T) - 0.17 * sin(217.6 - 407332.21 * T);
  const parallax = 0.9508 + 0.0518 * cos(135.0 + 477198.87 * T) + 0.0095 * cos(259.3 - 413335.36 * T) + 0.0078 * cos(235.7 + 890534.22 * T) + 0.0028 * cos(269.9 + 954397.74 * T);
  const sunLon = norm360(280.46 + 36000.77 * T + 1.915 * sin(357.53 + 35999.05 * T) + 0.02 * sin(2 * (357.53 + 35999.05 * T)));
  return { T, lon: norm360(lon), lat, parallax, sunLon };
}

// The moon over a place: apparent height (geocentric, as an almanac states it, and topocentric with the parallax), direction, the lit share and whether it is growing.
export function moonAt(ms, latDeg, lonDeg) {
  const { T, lon, lat, parallax, sunLon } = ecliptic(ms);
  const eps = 23.439 - 0.0130 * T;
  const ra = Math.atan2(sin(lon) * cos(eps) - Math.tan(lat * RAD) * sin(eps), cos(lon)) * DEG;
  const dec = Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)) * DEG;
  const gmst = norm360(280.46061837 + 360.98564736629 * (julianDay(ms) - 2451545));   // degrees
  const ha = norm360(gmst + lonDeg - ra);
  const height = Math.asin(sin(latDeg) * sin(dec) + cos(latDeg) * cos(dec) * cos(ha)) * DEG;
  const azimuth = norm360(Math.atan2(sin(ha), cos(ha) * sin(latDeg) - Math.tan(dec * RAD) * cos(latDeg)) * DEG + 180);
  const elong = norm360(lon - sunLon);                         // 0 new, 180 full
  const lit = (1 - cos(elong)) / 2;
  return { height, apparent: height - parallax * cos(height), azimuth, lit, growing: elong < 180, elongation: elong, declination: dec };
}

export function moonWords(m) {
  const pct = Math.round(m.lit * 100);
  if (pct <= 2) return 'New moon, hardly lit.';
  if (pct >= 98) return 'Full moon.';
  return `${pct}% lit, ${m.growing ? 'growing' : 'shrinking'}.`;
}
