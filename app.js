const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");

const sampleGames = [
  {
    away: "Boston Celtics",
    home: "Milwaukee Bucks",
    awayScore: 0,
    homeScore: 0,
    status: "Próximo partido"
  },
  {
    away: "Denver Nuggets",
    home: "Phoenix Suns",
    awayScore: 0,
    homeScore: 0,
    status: "Próximo partido"
  },
  {
    away: "Los Angeles Lakers",
    home: "Golden State Warriors",
    awayScore: 0,
    homeScore: 0,
    status: "Próximo partido"
  }
];

function loadLocalGames() {
  statusEl.textContent = "Modo local activo: mostrando juegos NBA de ejemplo";
  gamesContainer.innerHTML = "";

  sampleGames.forEach(game => {
    const div = document.createElement("div");
    div.className = "game";
    div.innerHTML = `
      <strong>${game.away}</strong> vs <strong>${game.home}</strong><br>
      Marcador: ${game.awayScore} - ${game.homeScore}<br>
      Estado: ${game.status}
    `;
    gamesContainer.appendChild(div);
  });
}

loadLocalGames();
