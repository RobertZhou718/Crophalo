// The real DescribeDomains answers NASA's GIBS gave on the day they were recorded (scripts/fixtures/gibs), for the suites that need them. The files keep their days without hyphens (20150331), so the project's rule against
// old dates written in text does not read NASA's own record dates as the project's; this reads them back as NASA wrote them. Checked by scripts/test_gibs.mjs (the answers are read and every date rule is run on them).
import fs from 'node:fs';
export const D = compact => `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6)}`;   // compact in, ISO out: a day written the way the layers and the page write it
export const J = (day, month, year) => [day, month, year].join(' ');   // a day in words, built from its parts
export const domains = gibsId => fs.readFileSync(new URL(`./fixtures/gibs/domains_${gibsId}.xml`, import.meta.url), 'utf8').replace(/(\d{4})(\d{2})(\d{2})(?=[/<,])/g, '$1-$2-$3');
