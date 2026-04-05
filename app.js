const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");
const analysisPanel = document.getElementById("analysis-panel");

const modal = document.getElementById("game-modal");
const modalCloseBtn = document.getElementById("modal-close");
const modalCloseBg = document.getElementById("modal-close-bg");

async function loadNBAGames() {
  if (!statusEl || !gamesContainer) return;

  statusEl.textContent = "Cargando partidos NBA reales...";
  gamesContainer.innerHTML = "";

  try {
    const response = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
    );

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
      const comp = event.competitions?.[0] || null;
      const competitors = comp?.competitors || [];

      const home = competitors.find(t => t.homeAway === "home");
      const away = competitors.find(t => t.homeAway === "away");

      const homeName = home?.team?.displayName || "Local";
      const awayName = away?.team?.displayName || "Visitante";
      const homeScore = home?.score ?? "-";
      const awayScore = away?.score ?? "-";
      const gameStatus = event.status?.type?.description || "Sin estado";
      const date = event.date
        ? new Date(event.date).toLocaleString("es-CL")
        : "Sin fecha";
      const period = event.status?.period || null;
      const clock = event.status?.displayClock || "";

      const div = document.createElement("article");
      div.className = "game-card";

      div.innerHTML = `
        <div class="game-top">
          <span class="game-status">${gameStatus}</span>
          <span class="game-date">${date}</span>
        </div>

        <div class="teams">
          <div class="team-row">
            <span class="team-name">${awayName}</span>
            <strong class="team-score">${awayScore}</strong>
          </div>

          <div class="team-row">
            <span class="team-name">${homeName}</span>
            <strong class="team-score">${homeScore}</strong>
          </div>
        </div>

        <div class="live-extra">${period ? `LIVE · Q${period} · ${clock}` : ""}</div>

        <div class="game-actions">
          <button class="analyze-btn" data-game-id="${event.id}">
            Analizar partido
          </button>
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

async function analyzeGame(gameId) {
  if (!analysisPanel) return;

  openModal();
  analysisPanel.innerHTML = "<p>Cargando análisis pregame...</p>";

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
        return team.abbreviation === abbr || team.displayName === name;
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

    analysisPanel.innerHTML = `
      <div class="analysis-box">
        <div class="analysis-header">
          <h3>${awayName} vs ${homeName}</h3>
          <p class="analysis-subtitle">Análisis pregame NBA</p>
          <p class="analysis-date">${gameDate}</p>
        </div>

        <div class="pregame-compare">
          <div class="pregame-row pregame-head">
            <div>${awayName}</div>
            <div>Métrica</div>
            <div>${homeName}</div>
          </div>

          <div class="pregame-row">
            <div>${awayStats.conference}</div>
            <div>Conferencia</div>
            <div>${homeStats.conference}</div>
          </div>

          <div class="pregame-row">
            <div>${awayStats.record}</div>
            <div>Récord</div>
            <div>${homeStats.record}</div>
          </div>

          <div class="pregame-row">
            <div>${awayStats.last10}</div>
            <div>Últimos 10</div>
            <div>${homeStats.last10}</div>
          </div>

          <div class="pregame-row">
            <div>${awayStats.streak}</div>
            <div>Racha</div>
            <div>${homeStats.streak}</div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("ERROR ANALYSIS:", error);
    analysisPanel.innerHTML = "<p>No se pudo cargar el análisis pregame del partido.</p>";
  }
}

function openModal() {
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

gamesContainer.addEventListener("click", (e) => {
  const btn = e.target.closest(".analyze-btn");
  if (!btn) return;

  const gameId = btn.dataset.gameId;
  if (!gameId) return;

  analyzeGame(gameId);
});

modalCloseBtn?.addEventListener("click", closeModal);
modalCloseBg?.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
  }
});

loadNBAGames();
