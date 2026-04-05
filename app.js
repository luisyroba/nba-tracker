const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");

async function loadNBAGames() {
  statusEl.textContent = "Cargando partidos NBA reales...";
  gamesContainer.innerHTML = "";

  const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

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
            const homeRecord = home?.records?.[0]?.summary || "Sin récord";
      const awayRecord = away?.records?.[0]?.summary || "Sin récord";

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
            <div class="game-date">${date}</div>
          </div>
          <div class="team-block">
            <div class="team-name">${homeName}</div>
            <div class="team-record">${homeRecord}</div>
          </div>
        </div>
        <button class="analyze-btn">Analizar partido</button>
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
