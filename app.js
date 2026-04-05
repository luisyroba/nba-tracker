const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");

async function loadNBAGames() {
  statusEl.textContent = "Cargando partidos NBA reales...";
  gamesContainer.innerHTML = "";

  try {
    const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const events = data.events || [];

    if (!events.length) {
      statusEl.textContent = "No se encontraron partidos NBA";
      gamesContainer.innerHTML = "<p>No hay juegos disponibles.</p>";
      return;
    }

    statusEl.textContent = `Se cargaron ${events.length} partidos NBA`;

    for (const event of events) {
      const comp = event.competitions && event.competitions[0] ? event.competitions[0] : null;
      const competitors = comp && comp.competitors ? comp.competitors : [];

      const home = competitors.find(t => t.homeAway === "home");
      const away = competitors.find(t => t.homeAway === "away");

      const homeName = home && home.team ? home.team.displayName : "Local";
      const awayName = away && away.team ? away.team.displayName : "Visitante";
      const homeScore = home && home.score ? home.score : "-";
      const awayScore = away && away.score ? away.score : "-";
      const status = event.status && event.status.type ? event.status.type.description : "Sin estado";
      const date = event.date ? new Date(event.date).toLocaleString("es-CL") : "Sin fecha";
      const period = event.status && event.status.period ? event.status.period : null;
      const clock = event.status && event.status.displayClock ? event.status.displayClock : "";

      const div = document.createElement("div");
      div.className = "game";
      div.innerHTML = `
        <div class="teams-row">
          <div class="team-block">
            <div class="team-name">${awayName}</div>
          </div>

          <div class="game-center">
            <div class="game-score">${awayScore} - ${homeScore}</div>
            <div class="game-status">${status}</div>
            <div class="live-extra">${period ? `LIVE · Q${period} · ${clock}` : ""}</div>
            <div class="game-date">${date}</div>
          </div>

          <div class="team-block">
            <div class="team-name">${homeName}</div>
          </div>
        </div>

        <button class="analyze-btn" data-game-id="${event.id}">
          Analizar partido
        </button>
      `;

      gamesContainer.appendChild(div);
    }
  } catch (error) {
    console.error("ERROR ESPN:", error);
    statusEl.textContent = "Error al cargar ESPN";
    gamesContainer.innerHTML = "<p>No se pudo cargar la API de ESPN.</p>";
  }
}

async function analyzeGame(gameId) {
  const panel = document.getElementById("analysis-panel");
  if (!panel) return;

  panel.innerHTML = "<p>Cargando análisis del partido...</p>";

  try {
    const response = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const header = data.header || {};
    const competitions = header.competitions || [];
    const comp = competitions[0] || {};
    const competitors = comp.competitors || [];

    const home = competitors.find(t => t.homeAway === "home");
    const away = competitors.find(t => t.homeAway === "away");

    const homeName = home && home.team ? home.team.displayName : "Local";
    const awayName = away && away.team ? away.team.displayName : "Visitante";
    const homeScore = home && home.score ? home.score : "-";
    const awayScore = away && away.score ? away.score : "-";
    const status = comp && comp.status && comp.status.type ? comp.status.type.description : "Sin estado";

    panel.innerHTML = `
      <div class="analysis-box">
        <h3>${awayName} vs ${homeName}</h3>
        <p><strong>Marcador:</strong> ${awayScore} - ${homeScore}</p>
        <p><strong>Estado:</strong> ${status}</p>
        <p><strong>Game ID:</strong> ${gameId}</p>
      </div>
    `;
  } catch (error) {
    console.error("ERROR ANALYSIS:", error);
    panel.innerHTML = "<p>No se pudo cargar el análisis del partido.</p>";
  }
}

loadNBAGames();

gamesContainer.addEventListener("click", (e) => {
  const btn = e.target.closest(".analyze-btn");
  if (!btn) return;

  const gameId = btn.dataset.gameId;
  if (!gameId) return;

  analyzeGame(gameId);
});

setInterval(() => {
  loadNBAGames();
}, 30000);
