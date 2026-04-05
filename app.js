const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");

async function loadNBAGames() {
  statusEl.textContent = "Cargando partidos NBA...";
  gamesContainer.innerHTML = "";

  const today = new Date().toISOString().split("T")[0];
  const url = `https://api.balldontlie.io/nba/v1/games?dates[]=${today}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const games = data.data || [];

    if (games.length === 0) {
      statusEl.textContent = "No hay partidos NBA para hoy";
      gamesContainer.innerHTML = "<p>No se encontraron juegos NBA hoy.</p>";
      return;
    }

    statusEl.textContent = `Se cargaron ${games.length} partidos NBA`;

    games.forEach(game => {
      const div = document.createElement("div");
      div.className = "game";

      const home = game.home_team?.full_name || "Local";
      const away = game.visitor_team?.full_name || "Visitante";
      const homeScore = game.home_team_score ?? "-";
      const awayScore = game.visitor_team_score ?? "-";
      const status = game.status || "Sin estado";
      const season = game.season || "N/A";

      div.innerHTML = `
        <strong>${away}</strong> vs <strong>${home}</strong><br>
        Marcador: ${awayScore} - ${homeScore}<br>
        Estado: ${status}<br>
        Temporada: ${season}
      `;

      gamesContainer.appendChild(div);
    });
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Error al cargar NBA";

    gamesContainer.innerHTML = `
      <p>No se pudo cargar la API principal.</p>
      <p>Prueba abrir en incógnito o revisa si BALLDONTLIE cambió acceso/cors.</p>
    `;
  }
}

loadNBAGames();
