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

  panel.innerHTML = "<p>Cargando análisis pregame...</p>";

  try {
    const [summaryRes, standingsRes] = await Promise.all([
      fetch(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`),
      fetch("https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings")
    ]);

    if (!summaryRes.ok) throw new Error(`Summary HTTP ${summaryRes.status}`);
    if (!standingsRes.ok) throw new Error(`Standings HTTP ${standingsRes.status}`);

    const summaryData = await summaryRes.json();
    const standingsData = await standingsRes.json();

    const comp = summaryData?.header?.competitions?.[0] || {};
    const competitors = comp?.competitors || [];

    const home = competitors.find(team => team.homeAway === "home");
    const away = competitors.find(team => team.homeAway === "away");

    const homeName = home?.team?.displayName || "Local";
    const awayName = away?.team?.displayName || "Visitante";
    const homeAbbr = home?.team?.abbreviation || "";
    const awayAbbr = away?.team?.abbreviation || "";

    const gameDate = comp?.date
      ? new Date(comp.date).toLocaleString("es-CL")
      : "Pendiente";

    const conferenceGroups = standingsData?.children || [];

    const allEntries = conferenceGroups.flatMap(group => {
      const entries = group?.standings?.entries || [];
      return entries.map(entry => ({
        ...entry,
        conference: group?.name || "NBA"
      }));
    });

    function findTeamEntry(abbr, name) {
      return allEntries.find(entry => {
        const team = entry?.team || {};
        return (
          team.abbreviation === abbr ||
          team.displayName === name
        );
      });
    }

    function getStatValue(entry, statName) {
      if (!entry?.stats) return "Pendiente";
      const stat = entry.stats.find(s => s.name === statName);
      return stat?.displayValue || stat?.value || "Pendiente";
    }

    const awayEntry = findTeamEntry(awayAbbr, awayName);
    const homeEntry = findTeamEntry(homeAbbr, homeName);

    const awayStats = {
      conference: awayEntry?.conference || "Pendiente",
      record: getStatValue(awayEntry, "overall"),
      last10: getStatValue(awayEntry, "lastTen"),
      streak: getStatValue(awayEntry, "streak")
    };

    const homeStats = {
      conference: homeEntry?.conference || "Pendiente",
      record: getStatValue(homeEntry, "overall"),
      last10: getStatValue(homeEntry, "lastTen"),
      streak: getStatValue(homeEntry, "streak")
    };

    panel.innerHTML = `
      <div class="analysis-box">
        <div class="analysis-header">
          <h3>${awayName} vs ${homeName}</h3>
          <p class="analysis-subtitle">Comparación pregame NBA</p>
          <p class="analysis-date">${gameDate}</p>
        </div>

       <div class="stats-wrap">
  <div class="stats-table">
    <div class="stats-row stats-header-row">
      <div class="stats-head team-left">${awayName}</div>
      <div class="stats-head stat-middle">Métrica</div>
      <div class="stats-head team-right">${homeName}</div>
    </div>

    <div class="stats-row">
      <div class="stats-cell team-value">${awayStats.conference}</div>
      <div class="stats-cell stat-name">Conferencia</div>
      <div class="stats-cell team-value">${homeStats.conference}</div>
    </div>

    <div class="stats-row">
      <div class="stats-cell team-value">${awayStats.record}</div>
      <div class="stats-cell stat-name">Récord</div>
      <div class="stats-cell team-value">${homeStats.record}</div>
    </div>

    <div class="stats-row">
      <div class="stats-cell team-value">${awayStats.last10}</div>
      <div class="stats-cell stat-name">Últimos 10</div>
      <div class="stats-cell team-value">${homeStats.last10}</div>
    </div>

    <div class="stats-row">
      <div class="stats-cell team-value">${awayStats.streak}</div>
      <div class="stats-cell stat-name">Racha</div>
      <div class="stats-cell team-value">${homeStats.streak}</div>
    </div>

    <div class="stats-row">
      <div class="stats-cell team-value">Pendiente</div>
      <div class="stats-cell stat-name">PPG</div>
      <div class="stats-cell team-value">Pendiente</div>
    </div>

    <div class="stats-row">
      <div class="stats-cell team-value">Pendiente</div>
      <div class="stats-cell stat-name">OPP PPG</div>
      <div class="stats-cell team-value">Pendiente</div>
    </div>

    <div class="stats-row">
      <div class="stats-cell team-value">Pendiente</div>
      <div class="stats-cell stat-name">Diferencial</div>
      <div class="stats-cell team-value">Pendiente</div>
    </div>

    <div class="stats-row">
      <div class="stats-cell team-value">Pendiente</div>
      <div class="stats-cell stat-name">B2B</div>
      <div class="stats-cell team-value">Pendiente</div>
    </div>
  </div>
</div>

        <div class="analysis-grid">
          <div class="analysis-team">
            <h4>${awayName}</h4>

            <div class="info-block">
              <h5>Lesionados</h5>
              <ul class="info-list">
                <li>No disponible en este feed del partido.</li>
              </ul>
            </div>

            <div class="info-block">
              <h5>Possible lineup</h5>
              <ul class="info-list">
                <li>Pendiente</li>
              </ul>
            </div>
          </div>

          <div class="analysis-team">
            <h4>${homeName}</h4>

            <div class="info-block">
              <h5>Lesionados</h5>
              <ul class="info-list">
                <li>No disponible en este feed del partido.</li>
              </ul>
            </div>

            <div class="info-block">
              <h5>Possible lineup</h5>
              <ul class="info-list">
                <li>Pendiente</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="betting-notes">
          <h4>Notas de apuesta</h4>
          <p>El panel ya compara forma básica por equipo con standings oficiales: conferencia, récord, últimos 10 y racha.</p>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("ERROR ANALYSIS:", error);
    panel.innerHTML = "<p>No se pudo cargar el análisis pregame del partido.</p>";
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
