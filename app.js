const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");

async function loadNBAGames() {
  statusEl.textContent = "Cargando partidos NBA reales...";
  gamesContainer.innerHTML = "";

  const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

  const period = event.status?.period ?? null;
  const clock = event.status?.displayClock || "";
  const shortDetail = event.status?.type?.shortDetail || "";
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const events = data.events || [];

    if (events.length === 0) {
      statusEl.textContent = "No se encontraron partidos NBA";
      gamesContainer.innerHTML = "<p>No hay juegos disponibles.</p>";
      return;
    }

    statusEl.textContent = `Se cargaron ${events.length} partidos NBA`;

    events.forEach(event => {
      const comp = event.competitions?.[0];
      const competitors = comp?.competitors || [];

      const home = competitors.find(t => t.homeAway === "home");
      const away = competitors.find(t => t.homeAway === "away");

      const homeName = home?.team?.displayName || "Local";
      const awayName = away?.team?.displayName || "Visitante";
      const homeScore = home?.score ?? "-";
      const awayScore = away?.score ?? "-";
      const status = event.status?.type?.description || "Sin estado";
      const date = event.date ? new Date(event.date).toLocaleString("es-CL") : "Sin fecha";

                const homeRecord = home?.records?.[0]?.summary || "Sin récord";
      const awayRecord = away?.records?.[0]?.summary || "Sin récord";
      const gameId = event.id || "";

      let liveInfo = "";
      if (period && clock) {
        liveInfo = `<div class="live-extra">Q${period} · ${clock}</div>`;
      } else if (shortDetail) {
        liveInfo = `<div class="live-extra">${shortDetail}</div>`;
      }

      const div = document.createElement("div");
      div.className = "game";
      div.innerHTML = `
        <div class="teams-row">
          <div class="team-block">
            <div class="team-name">${awayName}</div>
            <div class="team-record">${awayRecord}</div>
          </div>

          <div class="game-center">
            <div class="game-score">${awayScore} - ${homeScore}</div>
            <div class="game-status">${status}</div>
            ${liveInfo}
            <div class="game-date">${date}</div>
          </div>

          <div class="team-block">
            <div class="team-name">${homeName}</div>
            <div class="team-record">${homeRecord}</div>
          </div>
        </div>

        <button class="analyze-btn" data-game-id="${gameId}">
          Analizar partido
        </button>
      `;

      gamesContainer.appendChild(div);
    });
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Error al cargar partidos NBA reales";
    gamesContainer.innerHTML = `
      <p>No se pudo cargar ESPN.</p>
      <p>Si falla, el siguiente paso será usar un proxy gratuito o una carga desde JSON propio actualizado.</p>
    `;
  }
}

loadNBAGames();
setInterval(loadNBAGames, 30000);
