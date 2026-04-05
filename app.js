const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");

async function loadNBAGames() {
  statusEl.textContent = "Cargando partidos NBA...";
  gamesContainer.innerHTML = "";

  const url = "https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4387";

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.events || data.events.length === 0) {
      statusEl.textContent = "No se encontraron partidos.";
      gamesContainer.innerHTML = "<p>No hay partidos disponibles.</p>";
      return;
    }

    statusEl.textContent = "Partidos NBA cargados";

    data.events.forEach(game => {
      const div = document.createElement("div");
      div.className = "game";

      const date = game.dateEvent || "Sin fecha";
      const time = game.strTime || "Sin hora";
      const home = game.strHomeTeam || "Local";
      const away = game.strAwayTeam || "Visitante";
      const venue = game.strVenue || "Sin estadio";

      div.innerHTML = `
        <strong>${away}</strong> vs <strong>${home}</strong><br>
        Fecha: ${date}<br>
        Hora: ${time}<br>
        Estadio: ${venue}
      `;

      gamesContainer.appendChild(div);
    });
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Error al cargar los partidos NBA";
    gamesContainer.innerHTML = "<p>No se pudo obtener la información.</p>";
  }
}

loadNBAGames();
