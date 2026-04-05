const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");

const API_KEY = "fb8439fd-edc1-4ac9-a8e6-50801a180f0c";

async function loadNBAGames() {
  statusEl.textContent = "Cargando partidos NBA...";
  gamesContainer.innerHTML = "";

  const today = new Date().toISOString().split("T")[0];
  const url = `https://api.balldontlie.io/nba/v1/games?dates[]=${today}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
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
      const date = game.date || "Sin fecha";

      div.innerHTML = `
        <strong>${away}</strong> vs <strong>${home}</strong><br>
        Fecha: ${date}<br>
        Marcador: ${awayScore} - ${homeScore}<br>
        Estado: ${status}
      `;

      gamesContainer.appendChild(div);
    });
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Error al cargar NBA";
    gamesContainer.innerHTML = `
      <p>No se pudo cargar la API.</p>
      <p>Revisa si pegaste bien la API key en app.js.</p>
    `;
  }
}

loadNBAGames();
