const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");

async function loadNBAGames() {
  statusEl.textContent = "Cargando partidos NBA reales...";
  gamesContainer.innerHTML = "";

  try {
    const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard");
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
           <div class="live-extra">${period ? `Q${period} · ${clock}` : ""}</div>
           <div class="game-date">${date}</div>
          </div>
          <div class="team-block">
            <div class="team-name">${homeName}</div>
          </div>
        </div>
      `;
      gamesContainer.appendChild(div);
    }
  } catch (error) {
    console.error("ERROR ESPN:", error);
    statusEl.textContent = "Error al cargar ESPN";
    gamesContainer.innerHTML = "<p>No se pudo cargar la API de ESPN.</p>";
  }
}

loadNBAGames();
