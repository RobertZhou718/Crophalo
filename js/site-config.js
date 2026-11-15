// Where Crophalo's own data server answers: the satellite lookups, the crop map, the height map, the prices and the reminder pushes (every /api/ address).
// Empty means "on the same address as these pages": one server on this computer, or one host that serves both. When the website is put on a static host
// and the server on a name of its own, the website's deploy writes this file again with the server's address (https:// and a name, nothing after it),
// from the repository variable CROPHALO_API (deploy/stage-site.mjs); nothing else in the app changes. Read by js/api.js only. Checked by scripts/test_apiurl.mjs.
export const API_ORIGIN = '';
