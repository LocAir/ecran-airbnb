// Tableau des scans de QR : ecran-airbnb.vercel.app/stats?cle=TA_CLE
// La clé se règle dans Vercel (variable d'environnement STATS_CLE).

const { LIENS, redis } = require("./go.js");

function moisPrecedents(n) {
  const [a, m] = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 15));
    return d.toISOString().slice(0, 7);
  });
}

module.exports = async (req, res) => {
  const cle = process.env.STATS_CLE;
  if (!cle || (req.query && req.query.cle) !== cle) { res.status(403).send("Accès refusé"); return; }
  const noms = Object.keys(LIENS);
  const mois = moisPrecedents(3);
  const cles = noms.flatMap(n => [`scan:${n}`, ...mois.map(m => `scan:${n}:${m}`)]);
  const r = await redis([["MGET", ...cles]]).catch(() => null);
  if (!r) { res.status(500).send("Base de comptage non branchée (Upstash Redis dans Vercel > Storage)"); return; }
  const v = (r[0] && r[0].result) || [];
  const lignes = noms.map((n, i) => {
    const base = i * (mois.length + 1);
    return { nom: n, total: +v[base] || 0, mois: mois.map((m, k) => +v[base + 1 + k] || 0) };
  }).sort((a, b) => b.total - a.total);

  if ((req.query && req.query.format) === "json") { res.status(200).json({ mois, lignes }); return; }
  const nomMois = m => new Date(m + "-15").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scans des QR codes</title><style>
body{font-family:system-ui,sans-serif;background:#0F1B2D;color:#F5EFE4;margin:0;padding:24px 16px}
h1{font-weight:600;font-size:22px;margin:0 0 4px}p{color:#B9C0CA;margin:0 0 20px;font-size:14px}
table{border-collapse:collapse;width:100%;max-width:720px;font-size:15px}
th,td{padding:10px 12px;border-bottom:1px solid #2A3A52;text-align:right}th:first-child,td:first-child{text-align:left}
th{color:#C8A15A;font-size:12px;letter-spacing:.06em;text-transform:uppercase}td b{color:#C8A15A}
</style></head><body><h1>Scans des QR codes</h1><p>Nombre de voyageurs qui ont scanné chaque QR.</p>
<table><tr><th>QR</th>${mois.map(m => `<th>${nomMois(m)}</th>`).join("")}<th>Total</th></tr>
${lignes.map(l => `<tr><td>${l.nom}</td>${l.mois.map(x => `<td>${x}</td>`).join("")}<td><b>${l.total}</b></td></tr>`).join("")}
</table></body></html>`);
};
