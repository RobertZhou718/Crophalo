// A small demo of the two plans the report hands over for the Ontario field (corn, soybeans, then corn; or corn, soybeans, then winter wheat).
// Used only by the tests and by a developer trying the board before the crop engine answers: the app itself never ships these.
export const PLACE = { lat: 44.40, lon: -79.78, label: 'Barrie & Simcoe County, Ontario', name: 'Barrie & Simcoe County', cc: 'CA' };
const S = (year, crop, sow, harvest, after = 'residue', residueUntil = null, window = null) => ({ year, crop, sow, harvest, after, residueUntil, window });
export const CURRENT = { id: 'current', name: 'Current plan', kind: 'current', seasons: [S(2027, 'corn', '2027-05-05', '2027-10-20'), S(2028, 'soy', '2028-05-20', '2028-10-05', 'residue', '2029-04-30'), S(2029, 'corn', '2029-05-05', '2029-10-20')] };
export const PROPOSED = { id: 'proposed', name: 'Proposed plan', kind: 'proposed', seasons: [S(2027, 'corn', '2027-05-05', '2027-10-20'), S(2028, 'soy', '2028-05-20', '2028-10-05', 'residue', '2028-10-12'), S(2029, 'wheat', '2028-10-12', '2029-07-20', 'residue', null, { earliest: '2028-09-20', latest: '2028-10-15' })] };
export const REPORT = { place: PLACE, area: 10, areaEstimated: true, current: CURRENT, proposed: PROPOSED, date: '2028-10-05' };
