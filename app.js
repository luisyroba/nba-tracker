const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");
const form = document.getElementById("bet-form");
const resultEl = document.getElementById("calc-result");
const picksList = document.getElementById("picks-list");

const sampleGames = [
  { away: "Boston Celtics", home: "Milwaukee Bucks", status: "Próximo partido" },
  { away: "Denver Nuggets", home: "Phoenix Suns", status: "Próximo partido" },
  { away: "Los Angeles Lakers", home: "Golden State Warriors", status: "Próximo partido" }
];

function loadLocalGames() {
  statusEl.textContent = "Modo local activo: dashboard NBA listo";
  gamesContainer.innerHTML = "";

  sampleGames.forEach(game => {
    const div = document.createElement("div");
    div.className = "game";
    div.innerHTML = `
      <strong>${game.away}</strong> vs <strong>${game.home}</strong><br>
      Estado: ${game.status}
    `;
    gamesContainer.appendChild(div);
  });
}

function getPicks() {
  return JSON.parse(localStorage.getItem("nba_picks") || "[]");
}

function savePicks(picks) {
  localStorage.setItem("nba_picks", JSON.stringify(picks));
}

function renderPicks() {
  const picks = getPicks();
  picksList.innerHTML = "";

  if (picks.length === 0) {
    picksList.innerHTML = "<p>Aún no has guardado picks.</p>";
    return;
  }

  picks.forEach((pick, index) => {
    const div = document.createElement("div");
    div.className = "pick";

    const evClass = pick.ev >= 0 ? "positive" : "negative";

    div.innerHTML = `
      <strong>${pick.match}</strong><br>
      Mercado: ${pick.market}<br>
      Cuota: ${pick.odds}<br>
      Prob. implícita: ${pick.impliedProb}%<br>
      Tu prob.: ${pick.userProb}%<br>
      EV: <span class="${evClass}">${pick.ev}%</span><br>
      Stake: ${pick.stake}
    `;

    picksList.appendChild(div);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const match = document.getElementById("match").value.trim();
  const market = document.getElementById("market").value.trim();
  const odds = parseFloat(document.getElementById("odds").value);
  const userProb = parseFloat(document.getElementById("prob").value);
  const stake = parseFloat(document.getElementById("stake").value);

  const impliedProb = ((1 / odds) * 100).toFixed(2);
  const ev = ((odds * (userProb / 100)) - 1) * 100;
  const evRounded = ev.toFixed(2);

  resultEl.innerHTML = `
    <p>Probabilidad implícita: <strong>${impliedProb}%</strong></p>
    <p>EV estimado: <strong class="${ev >= 0 ? 'positive' : 'negative'}">${evRounded}%</strong></p>
  `;

  const picks = getPicks();
  picks.unshift({
    match,
    market,
    odds,
    userProb,
    impliedProb,
    ev: evRounded,
    stake
  });

  savePicks(picks);
  renderPicks();
  form.reset();
});

loadLocalGames();
renderPicks();
