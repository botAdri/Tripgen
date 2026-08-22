// ⚠️ À renseigner après déploiement du Worker (voir worker.js) :
const WORKER_URL = "https://tripgen.vyr9f5wysn.workers.dev";

const COLOR_PALETTE = ["#1E3A5F", "#C4562A", "#2D6B3A", "#7A4F2A", "#8B3A6A", "#4A7FA5", "#3D6B8A", "#1F5C7A", "#B5651D", "#4E6B3E"];

const inputScreen = document.getElementById("inputScreen");
const appScreen = document.getElementById("appScreen");
const tripDescription = document.getElementById("tripDescription");
const generateBtn = document.getElementById("generateBtn");
const errorBox = document.getElementById("errorBox");
const charCounter = document.getElementById("charCounter");

tripDescription.addEventListener("input", () => {
  charCounter.textContent = `${tripDescription.value.length} / 220`;
});

document.querySelectorAll(".example-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    tripDescription.value = chip.textContent;
    charCounter.textContent = `${tripDescription.value.length} / 220`;
  });
});

document.getElementById("newTripBtn").addEventListener("click", () => {
  appScreen.classList.add("hidden");
  inputScreen.classList.remove("hidden");
});

generateBtn.addEventListener("click", async () => {
  const description = tripDescription.value.trim();
  errorBox.classList.add("hidden");
  if (!description) return;

  generateBtn.disabled = true;
  generateBtn.textContent = "⏳ Génération en cours…";

  try {
    const controller = new AbortController();
    // Le Worker peut essayer jusqu'à 3 modèles gratuits l'un après l'autre :
    // on laisse une marge large, mais on affiche un message clair plutôt que
    // de laisser une erreur réseau brute s'afficher indéfiniment.
    const timeoutId = setTimeout(() => controller.abort(), 75000);

    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur inconnue");

    renderTrip(data);
    inputScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    // Le conteneur de la carte était caché (display:none) pendant que la carte
    // s'initialisait : Leaflet a mal calculé sa taille et n'a chargé qu'une
    // partie des tuiles. On force un recalcul maintenant qu'il est visible.
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        if (routeLine) map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
      }
    }, 50);
  } catch (err) {
    let message;
    if (err.name === "AbortError") {
      message = "La génération a pris trop de temps (plus de 75 s). Essayez une description plus courte, ou réessayez dans un instant.";
    } else if (err.message === "Failed to fetch" || err.message.includes("NetworkError")) {
      message = "Connexion au générateur impossible. Si vous êtes sur Firefox, vérifiez la protection anti-pistage / vos extensions (bloqueur de pub, VPN, antivirus) pour ce site.";
    } else {
      message = "Impossible de générer l'itinéraire : " + err.message + ". Vérifiez que WORKER_URL est bien configuré dans app.js.";
    }
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "✨ Générer mon itinéraire";
  }
});

// ═══ RENDU ═══
let map, stops = [], mapMarkers = [], routeLine = null, tripData = null;

function getTagHTML(tag, price) {
  if (tag === "free") return `<span class="activity-tag tag-free">✓ ${price}</span>`;
  if (tag === "must") return `<span class="activity-tag tag-must">⭐ Incontournable · ${price}</span>`;
  return `<span class="activity-tag tag-paid">💳 ${price}</span>`;
}

function renderTrip(data) {
  tripData = data;
  stops = data.stops.map((s, i) => ({ ...s, color: COLOR_PALETTE[i % COLOR_PALETTE.length] }));

  document.getElementById("tripTitle").innerHTML = `Guide de <span>${data.title || "Voyage"}</span>`;
  document.documentElement.style.setProperty("--accent", data.theme_color || "#C4562A");
  document.getElementById("statVilles").textContent = `🗺️ ${stops.length} étapes`;
  document.getElementById("statJours").textContent = `📅 ${data.total_days || "—"} jours`;
  document.getElementById("legendTitle").textContent = `Étapes du voyage`;

  if (!map) {
    map = L.map("map", { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
  }

  mapMarkers.forEach((m) => map.removeLayer(m));
  mapMarkers = [];
  if (routeLine) map.removeLayer(routeLine);

  const routeCoords = stops.map((s) => [s.lat, s.lng]);
  routeLine = L.polyline(routeCoords, { color: data.theme_color || "#C4562A", weight: 2.5, opacity: 0.55, dashArray: "8, 6" }).addTo(map);

  document.getElementById("legendRows").innerHTML = stops
    .map((s) => `<div class="legend-row"><div class="legend-dot" style="background:${s.color}"></div> ${s.name}</div>`)
    .join("");

  const tabsEl = document.getElementById("cityTabs");
  const panelEl = document.getElementById("activitiesPanel");
  tabsEl.innerHTML = "";
  panelEl.innerHTML = "";

  stops.forEach((stop, i) => {
    const tab = document.createElement("button");
    tab.className = "city-tab" + (i === 0 ? " active" : "");
    tab.style.borderBottomColor = i === 0 ? stop.color : "transparent";
    tab.innerHTML = `<span class="tab-num" style="background:${stop.color}">${stop.id}</span>${stop.name}`;
    tab.addEventListener("click", () => selectStop(i));
    tabsEl.appendChild(tab);

    const acts = stop.activites
      .map(
        (a) => `
      <div class="activity-card">
        <div class="activity-icon">${a.icon}</div>
        <div>
          <div class="activity-name">${a.name}</div>
          <div class="activity-sub">${a.desc}</div>
          ${getTagHTML(a.tag, a.price)}
        </div>
      </div>`
      )
      .join("");

    const panel = document.createElement("div");
    panel.className = "city-panel" + (i === 0 ? " active" : "");
    panel.innerHTML = `
      <div class="city-header" style="background:${stop.color}">
        <div class="city-name">${stop.name}</div>
        <div class="city-dates">📅 ${stop.dates}</div>
      </div>
      <div class="city-desc">${stop.desc}</div>
      <div class="activities-list">${acts}</div>
      <div class="budget-bar">
        <div class="budget-bar-title">💰 Budget étape</div>
        <div class="budget-item"><span>Hébergement</span><span>${stop.budget.heberg}</span></div>
        <div class="budget-item"><span>Restauration</span><span>${stop.budget.repas}</span></div>
        <div class="budget-item"><span>Activités</span><span>${stop.budget.activites}</span></div>
        <div class="budget-item budget-total"><span>Total étape</span><span>${stop.budget.total}</span></div>
      </div>`;
    panelEl.appendChild(panel);

    const icon = L.divIcon({
      html: `<div class="map-pin"><div class="map-pin-body" style="background:${stop.color}"><span class="map-pin-number">${stop.id}</span></div></div>`,
      iconSize: [36, 44], iconAnchor: [18, 44], popupAnchor: [0, -46], className: "",
    });
    const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(map);
    marker.on("click", () => selectStop(i));
    mapMarkers.push(marker);
  });

  map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
  renderBudgetModal(data);
}

function selectStop(idx) {
  document.querySelectorAll(".city-tab").forEach((t, i) => {
    t.classList.toggle("active", i === idx);
    t.style.borderBottomColor = i === idx ? stops[i].color : "transparent";
  });
  document.querySelectorAll(".city-panel").forEach((p, i) => p.classList.toggle("active", i === idx));
  map.flyTo([stops[idx].lat, stops[idx].lng], 10, { duration: 0.8 });
}

function parseNumbers(str) {
  return (String(str || "").match(/\d+(?:[.,]\d+)?/g) || []).map((n) => parseFloat(n.replace(",", ".")));
}

function renderBudgetModal(data) {
  const perStopTotals = stops.map((s) => parseNumbers(s.budget.total)[0] || 0);
  const stopsSum = perStopTotals.reduce((a, b) => a + b, 0);
  const bs = data.budget_summary || {};

  document.getElementById("budgetModalBody").innerHTML = `
    <h3>Budget global — 1 personne</h3>
    <div class="row"><span>Total des étapes (hébergement + repas + activités)</span><span>~${Math.round(stopsSum)} ${data.currency_symbol || "€"}</span></div>
    ${bs.flights ? `<div class="row"><span>✈️ Vols A/R</span><span>${bs.flights}</span></div>` : ""}
    ${bs.transport_local ? `<div class="row"><span>🚗 Transport local</span><span>${bs.transport_local}</span></div>` : ""}
    ${bs.tip ? `<div class="tip">💡 ${bs.tip}</div>` : ""}
  `;
}

document.getElementById("budgetFab").addEventListener("click", () => document.getElementById("budgetOverlay").classList.add("active"));
document.getElementById("budgetClose").addEventListener("click", () => document.getElementById("budgetOverlay").classList.remove("active"));
document.getElementById("budgetOverlay").addEventListener("click", (e) => {
  if (e.target.id === "budgetOverlay") e.currentTarget.classList.remove("active");
});

document.getElementById("icsExportBtn").addEventListener("click", () => {
  if (!stops.length) return;
  let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//GuideVoyage//FR\r\nCALSCALE:GREGORIAN\r\n";
  const esc = (s) => String(s).replace(/[,;]/g, "\\$&");
  stops.forEach((s) => {
    ics += "BEGIN:VEVENT\r\n";
    ics += `SUMMARY:${esc(s.name)} — ${esc(s.dates)}\r\n`;
    ics += `LOCATION:${esc(s.name)}\r\n`;
    ics += `DESCRIPTION:${esc(s.desc)}\r\n`;
    ics += "END:VEVENT\r\n";
  });
  ics += "END:VCALENDAR\r\n";
  const blob = new Blob([ics], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "itineraire.ics";
  a.click();
});
