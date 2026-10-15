// Liens suivis des QR codes : ecran-airbnb.vercel.app/go/<nom>
// Compte le scan (si la base Upstash Redis est branchée dans Vercel) puis redirige vers la vraie page.
// Pour ajouter un commerçant : ajoute une ligne ici, puis génère son QR avec /go/<nom>.

const LIENS = {
  trattoria:  "https://booking.ureserve.co/shop/external-booking/la-trattoria",
  riviera:    "https://wa.me/33674281739",
  armand:     "https://www.google.com/maps/search/?api=1&query=Maison+Armand+19+rue+de+France+Nice",
  carrefour:  "https://www.google.com/maps/search/?api=1&query=Carrefour+City+15+Rue+Meyerbeer+Nice",
  transports: "https://www.lignesdazur.com",
  pharmacies: "https://www.google.com/maps/search/pharmacie+Nice",
  avis:       "https://www.google.com/maps/search/?api=1&query=Hostias+conciergerie+Nice"
};

async function redis(commandes) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const r = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commandes)
  });
  return r.ok ? r.json() : null;
}

module.exports = async (req, res) => {
  const nom = String((req.query && req.query.c) || "").toLowerCase();
  const cible = LIENS[nom];
  if (!cible) { res.status(404).send("Lien inconnu"); return; }
  const mois = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }).slice(0, 7); // AAAA-MM
  try {
    await Promise.race([
      redis([["INCR", `scan:${nom}`], ["INCR", `scan:${nom}:${mois}`]]),
      new Promise(r => setTimeout(r, 800))            // ne jamais faire attendre le voyageur
    ]);
  } catch (e) {}
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(302, { Location: cible });
  res.end();
};

module.exports.LIENS = LIENS;
module.exports.redis = redis;
