// Agenda de la semaine à Nice — fonction Vercel.
// Rassemble les événements des 7 prochains jours depuis :
//   1) Ticketmaster (concerts, matchs, spectacles)  → variable d'environnement TICKETMASTER_KEY
//   2) Une Google Sheet publiée en CSV (optionnelle) → variable d'environnement EVENEMENTS_CSV
//      Colonnes : date (AAAA-MM-JJ) ; heure (20:00) ; titre ; lieu ; categorie
// Renvoie au maximum 10 événements triés par date. Résultat mis en cache 3 h.

const VILLE = "Nice";
const JOURS = 7;
const MAX = 10;

const CATEGORIES = {
  Music: "Concert", Sports: "Sport", "Arts & Theatre": "Spectacle",
  Film: "Cinéma", Miscellaneous: "Événement", Family: "En famille"
};

function datesParis() {
  const auj = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }); // AAAA-MM-JJ
  const fin = new Date(Date.now() + JOURS * 864e5).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  return { auj, fin };
}

async function ticketmaster(auj, fin) {
  const key = process.env.TICKETMASTER_KEY;
  if (!key) return [];
  const p = new URLSearchParams({
    apikey: key, city: VILLE, countryCode: "FR", locale: "*", size: "60", sort: "date,asc",
    startDateTime: `${auj}T00:00:00Z`, endDateTime: `${fin}T23:59:59Z`
  });
  const r = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${p}`);
  if (!r.ok) return [];
  const j = await r.json();
  const evts = (j._embedded && j._embedded.events) || [];
  return evts.map(e => {
    const d = e.dates && e.dates.start || {};
    const heure = typeof d.localTime === "string" ? d.localTime.slice(0, 5) : "";
    const img = (e.images || []).filter(i => i.ratio === "16_9").sort((a, b) => a.width - b.width)
      .find(i => i.width >= 500) || (e.images || [])[0];
    const seg = e.classifications && e.classifications[0] && e.classifications[0].segment;
    return {
      date: d.localDate, heure,
      titre: e.name,
      lieu: e._embedded && e._embedded.venues && e._embedded.venues[0] ? e._embedded.venues[0].name : "",
      categorie: (seg && CATEGORIES[seg.name]) || "Événement",
      image: img ? img.url : ""
    };
  }).filter(e => e.date);
}

function lireCSV(texte) {
  const lignes = [];
  let champ = "", ligne = [], guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = "";
    } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

async function feuille() {
  const url = process.env.EVENEMENTS_CSV;
  if (!url) return [];
  const r = await fetch(url);
  if (!r.ok) return [];
  const [entete, ...lignes] = lireCSV(await r.text());
  const idx = n => entete.findIndex(h => h.trim().toLowerCase() === n);
  const [iD, iH, iT, iL, iC, iI] = ["date", "heure", "titre", "lieu", "categorie", "image"].map(idx);
  return lignes.filter(l => l[iD] && l[iT]).map(l => ({
    date: l[iD].trim(), heure: iH >= 0 ? (l[iH] || "").trim() : "",
    titre: l[iT].trim(), lieu: iL >= 0 ? (l[iL] || "").trim() : "",
    categorie: iC >= 0 && l[iC] ? l[iC].trim() : "Événement",
    image: iI >= 0 ? (l[iI] || "").trim() : ""
  }));
}

module.exports = async (req, res) => {
  const { auj, fin } = datesParis();
  const [tm, fs] = await Promise.all([ticketmaster(auj, fin).catch(() => []), feuille().catch(() => [])]);
  const vus = new Set();
  const events = [...fs, ...tm]                                   // la Google Sheet passe en priorité
    .filter(e => e.date >= auj && e.date <= fin)
    .sort((a, b) => (a.date + (a.heure || "99")).localeCompare(b.date + (b.heure || "99")))
    .filter(e => { const k = e.titre.toLowerCase(); if (vus.has(k)) return false; vus.add(k); return true; }) // 1 seule date par spectacle
    .slice(0, MAX);
  res.setHeader("Cache-Control", "s-maxage=10800, stale-while-revalidate=86400");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ du: auj, au: fin, events });
};
