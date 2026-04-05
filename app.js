document.getElementById("status").textContent = "App cargada correctamente";

const sampleGames = [
  { home: "Boston Celtics", away: "Milwaukee Bucks", time: "19:30" },
  { home: "Denver Nuggets", away: "Phoenix Suns", time: "21:00" },
  { home: "Lakers", away: "Warriors", time: "22:30" }
];

const gamesContainer = document.getElementById("games");

sampleGames.forEach(game => {
  const div = document.createElement("div");
  div.className = "game";
  div.innerHTML = `
    <strong>${game.away}</strong> vs <strong>${game.home}</strong><br>
    Hora: ${game.time}
  `;
  gamesContainer.appendChild(div);
});
