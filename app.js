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

      const div = document.createElement("div");
      div.className = "game";
      div.innerHTML = `
        <strong>${awayName}</strong> vs <strong>${homeName}</strong><br>
        Fecha: ${date}<br>
        Marcador: ${awayScore} - ${homeScore}<br>
        Estado: ${status}
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
