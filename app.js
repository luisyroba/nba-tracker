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
      return entries.map((entry, index) => ({
        ...entry,
        conference: group?.name || "NBA",
        conferencePosition: index + 1
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

    function parseRecord(recordText) {
      if (!recordText || typeof recordText !== "string") return null;
      const parts = recordText.split("-");
      if (parts.length < 2) return null;
      const wins = Number(parts[0]);
      const losses = Number(parts[1]);
      if (Number.isNaN(wins) || Number.isNaN(losses)) return null;
      return { wins, losses, pct: wins / (wins + losses) };
    }

    function parseLast10(last10Text) {
      if (!last10Text || typeof last10Text !== "string") return null;
      const parts = last10Text.split("-");
      if (parts.length < 2) return null;
      const wins = Number(parts[0]);
      const losses = Number(parts[1]);
      if (Number.isNaN(wins) || Number.isNaN(losses)) return null;
      return { wins, losses };
    }

    function parseStreak(streakText) {
      if (!streakText || typeof streakText !== "string") return null;
      const type = streakText.charAt(0).toUpperCase();
      const value = Number(streakText.slice(1));
      if (Number.isNaN(value)) return null;
      if (type === "W") return value;
      if (type === "L") return -value;
      return null;
    }

    const awayEntry = findTeamEntry(awayAbbr, awayName);
    const homeEntry = findTeamEntry(homeAbbr, homeName);

    const awayStats = {
      conference: awayEntry?.conference || "Pendiente",
      position: awayEntry?.conferencePosition || "-",
      record: getStatValue(awayEntry, "overall"),
      last10: getStatValue(awayEntry, "lastTen"),
      streak: getStatValue(awayEntry, "streak")
    };

    const homeStats = {
      conference: homeEntry?.conference || "Pendiente",
      position: homeEntry?.conferencePosition || "-",
      record: getStatValue(homeEntry, "overall"),
      last10: getStatValue(homeEntry, "lastTen"),
      streak: getStatValue(homeEntry, "streak")
    };

    const awayRecordParsed = parseRecord(awayStats.record);
    const homeRecordParsed = parseRecord(homeStats.record);
    const awayLast10Parsed = parseLast10(awayStats.last10);
    const homeLast10Parsed = parseLast10(homeStats.last10);
    const awayStreakParsed = parseStreak(awayStats.streak);
    const homeStreakParsed = parseStreak(homeStats.streak);

    let awayEdge = 0;
    let homeEdge = 0;

    if (awayRecordParsed && homeRecordParsed) {
      if (awayRecordParsed.pct > homeRecordParsed.pct) awayEdge++;
      if (homeRecordParsed.pct > awayRecordParsed.pct) homeEdge++;
    }

    if (awayLast10Parsed && homeLast10Parsed) {
      if (awayLast10Parsed.wins > homeLast10Parsed.wins) awayEdge++;
      if (homeLast10Parsed.wins > awayLast10Parsed.wins) homeEdge++;
    }

    if (awayStreakParsed !== null && homeStreakParsed !== null) {
      if (awayStreakParsed > homeStreakParsed) awayEdge++;
      if (homeStreakParsed > awayStreakParsed) homeEdge++;
    }

    let edgeText = "Matchup equilibrado";
    if (awayEdge > homeEdge) edgeText = `Ligera ventaja ${awayName}`;
    if (homeEdge > awayEdge) edgeText = `Ligera ventaja ${homeName}`;

    let autoNote = "Sin señal fuerte todavía; conviene revisar mercado y contexto final.";
    if (awayEdge >= 2 && awayLast10Parsed && homeLast10Parsed) {
      autoNote = `${awayName} llega con mejor perfil reciente en esta comparación básica.`;
    }
    if (homeEdge >= 2 && awayLast10Parsed && homeLast10Parsed) {
      autoNote = `${homeName} llega con mejor perfil reciente en esta comparación básica.`;
    }

    panel.innerHTML = `
      <div class="analysis-box">
        <div class="analysis-header">
          <h3>${awayName} vs ${homeName}</h3>
          <p class="analysis-subtitle">Análisis pregame NBA</p>
          <p class="analysis-date">${gameDate}</p>
        </div>

        <div class="betting-notes">
          <h4>${edgeText}</h4>
          <p>${autoNote}</p>
        </div>

        <div class="pregame-compare">
          <div class="pregame-row pregame-head">
            <div>${awayName}</div>
            <div>Métrica</div>
            <div>${homeName}</div>
          </div>

          <div class="pregame-row">
            <div class="away">${awayStats.conference}</div>
            <div class="metric">Conferencia</div>
            <div class="home">${homeStats.conference}</div>
          </div>

          <div class="pregame-row">
            <div class="away">${awayStats.record} · ${awayStats.position}º</div>
            <div class="metric">Récord · Conf</div>
            <div class="home">${homeStats.record} · ${homeStats.position}º</div>
          </div>

          <div class="pregame-row">
            <div class="away">${awayStats.last10}</div>
            <div class="metric">Últimos 10</div>
            <div class="home">${homeStats.last10}</div>
          </div>

          <div class="pregame-row">
            <div class="away">${awayStats.streak}</div>
            <div class="metric">Racha</div>
            <div class="home">${homeStats.streak}</div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("ERROR ANALYSIS:", error);
    panel.innerHTML = "<p>No se pudo cargar el análisis pregame del partido.</p>";
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
