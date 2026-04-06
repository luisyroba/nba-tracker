const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");
const analysisPanel = document.getElementById("analysis-panel");

const modal = document.getElementById("game-modal");
const modalCloseBtn = document.getElementById("modal-close");
const modalCloseBg = document.getElementById("modal-close-bg");

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function parseRecord(recordText) {
  if (!recordText || typeof recordText !== "string") return null;
  const parts = recordText.split("-");
  if (parts.length < 2) return null;
  const wins = Number(parts[0]);
  const losses = Number(parts[1]);
  if (Number.isNaN(wins) || Number.isNaN(losses)) return null;
  return {
    wins,
    losses,
    pct: wins / (wins + losses)
  };
}

function getStatValue(entry, statNames) {
  if (!entry?.stats) return "Pendiente";

  const names = Array.isArray(statNames) ? statNames : [statNames];

  for (const name of names) {
    const stat = entry.stats.find(s => s.name === name);
    if (stat?.displayValue !== undefined && stat?.displayValue !== null && stat.displayValue !== "") {
      return stat.displayValue;
    }
    if (stat?.value !== undefined && stat?.value !== null && stat.value !== "") {
      return String(stat.value);
    }
  }

  return "Pendiente";
}

function getConferenceLabel(conferenceName) {
  if (!conferenceName) return "NBA";
  const lower = conferenceName.toLowerCase();
  if (lower.includes("east")) return "Este";
  if (lower.includes("west")) return "Oeste";
  return conferenceName;
}

function buildStatRow(awayValue, label, homeValue, awayClass = "", homeClass = "") {
  return `
    <div class="pregame-row">
      <div class="away ${awayClass}">${awayValue}</div>
      <div class="metric">${escapeHtml(label)}</div>
      <div class="home ${homeClass}">${homeValue}</div>
    </div>
  `;
}

function compareNumbersHigherBetter(awayNum, homeNum) {
  if (awayNum === null || homeNum === null) return { away: "", home: "" };
  if (awayNum > homeNum) return { away: "edge", home: "" };
  if (homeNum > awayNum) return { away: "", home: "edge" };
  return { away: "", home: "" };
}

function compareNumbersLowerBetter(awayNum, homeNum) {
  if (awayNum === null || homeNum === null) return { away: "", home: "" };
  if (awayNum < homeNum) return { away: "edge", home: "" };
  if (homeNum < awayNum) return { away: "", home: "edge" };
  return { away: "", home: "" };
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatOneDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Pendiente";
  return value.toFixed(1);
}

function formatSignedOneDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Pendiente";
  if (value > 0) return `+${value.toFixed(1)}`;
  return value.toFixed(1);
}

function getTeamIdFromCompetitor(competitor) {
  return competitor?.team?.id || competitor?.id || null;
}

function normalizeGamesFromSchedule(data) {
  if (Array.isArray(data?.events)) return data.events;
  return [];
}

function getGameCalendarKey(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getPreviousCalendarKey(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getTeamGameInfo(event, teamId) {
  const comp = event?.competitions?.[0];
  if (!comp) return null;

  const competitors = comp?.competitors || [];
  const team = competitors.find(c => String(c?.team?.id || c?.id || "") === String(teamId));
  const opponent = competitors.find(c => String(c?.team?.id || c?.id || "") !== String(teamId));

  if (!team || !opponent) return null;

  const rawTeamScore = team?.score;
  const rawOpponentScore = opponent?.score;

  const teamScore =
    typeof rawTeamScore === "object"
      ? toNumber(rawTeamScore?.value ?? rawTeamScore?.displayValue)
      : toNumber(rawTeamScore);

  const opponentScore =
    typeof rawOpponentScore === "object"
      ? toNumber(rawOpponentScore?.value ?? rawOpponentScore?.displayValue)
      : toNumber(rawOpponentScore);

  const date = event?.date || comp?.date || null;
  const statusType = comp?.status?.type || event?.status?.type || {};
  const completed = Boolean(statusType?.completed || statusType?.state === "post");

  return {
    id: event?.id || comp?.id || null,
    date,
    dateKey: getGameCalendarKey(date),
    completed,
    homeAway: team?.homeAway || "unknown",
    teamScore,
    opponentScore,
    won: teamScore !== null && opponentScore !== null ? teamScore > opponentScore : null,
    opponentName: opponent?.team?.displayName || "Rival"
  };
}

function getRecentFormFromSchedule(data, teamId, gameDate, sampleSize = 5) {
  const events = normalizeGamesFromSchedule(data);
  const targetTime = gameDate ? new Date(gameDate).getTime() : Date.now();

  const recentGames = events
    .map(event => getTeamGameInfo(event, teamId))
    .filter(Boolean)
    .filter(game => game.completed)
    .filter(game => game.date && new Date(game.date).getTime() < targetTime)
    .filter(game => game.teamScore !== null && game.opponentScore !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, sampleSize);

  const wins = recentGames.filter(game => game.won === true).length;
  const losses = recentGames.filter(game => game.won === false).length;
  const scored = recentGames.map(game => game.teamScore);
  const allowed = recentGames.map(game => game.opponentScore);
  const diffList = recentGames.map(game => game.teamScore - game.opponentScore);

  return {
    games: recentGames,
    record: recentGames.length ? `${wins}-${losses}` : "Pendiente",
    scoredAvg: average(scored),
    allowedAvg: average(allowed),
    diffAvg: average(diffList)
  };
}

function getB2BStatus(data, teamId, gameDate) {
  const events = normalizeGamesFromSchedule(data);
  const targetTime = gameDate ? new Date(gameDate).getTime() : null;

  if (!targetTime) {
    return {
      isB2B: false,
      label: "No",
      detail: "Sin dato"
    };
  }

  const previousGames = events
    .map(event => getTeamGameInfo(event, teamId))
    .filter(Boolean)
    .filter(game => game.completed)
    .filter(game => game.date)
    .filter(game => new Date(game.date).getTime() < targetTime)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const previousGame = previousGames[0];

  if (!previousGame) {
    return {
      isB2B: false,
      label: "No",
      detail: "Descanso normal"
    };
  }

  const previousTime = new Date(previousGame.date).getTime();
  const diffHours = (targetTime - previousTime) / (1000 * 60 * 60);

  if (diffHours > 48) {
    return {
      isB2B: false,
      label: "No",
      detail: "Descanso normal"
    };
  }

  if (diffHours <= 30) {
    if (previousGame.homeAway === "home") {
      return {
        isB2B: true,
        label: "Sí",
        detail: "B2B en casa"
      };
    }

    if (previousGame.homeAway === "away") {
      return {
        isB2B: true,
        label: "Sí",
        detail: "B2B con viaje"
      };
    }

    return {
      isB2B: true,
      label: "Sí",
      detail: "B2B"
    };
  }

  return {
    isB2B: false,
    label: "No",
    detail: "Descanso normal"
  };
}
function renderFormChips(games) {
  if (!games?.length) {
    return `<div class="form-chips empty"><span class="form-empty">Sin datos</span></div>`;
  }

  const ordered = [...games].reverse();

  return `
    <div class="form-chips">
      ${ordered.map(game => `
        <span
          class="form-chip ${game.won ? "win" : "loss"}"
          title="${escapeHtml(`${game.won ? "Ganó" : "Perdió"} vs ${game.opponentName} (${game.teamScore}-${game.opponentScore})`)}"
        >
          ${game.won ? "G" : "P"}
        </span>
      `).join("")}
    </div>
  `;
}

async function fetchTeamSchedule(teamId) {
  if (!teamId) return null;

  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule`,
    `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data?.events) && data.events.length) return data;
    } catch (error) {
      console.warn("Schedule fetch failed:", url, error);
    }
  }

  return null;
}

async function loadNBAGames() {
  if (!statusEl || !gamesContainer) return;

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
      const comp = event.competitions?.[0] || null;
      const competitors = comp?.competitors || [];

      const home = competitors.find(t => t.homeAway === "home");
      const away = competitors.find(t => t.homeAway === "away");

      const homeName = home?.team?.displayName || "Local";
      const awayName = away?.team?.displayName || "Visitante";
      const homeScore = home?.score ?? "-";
      const awayScore = away?.score ?? "-";
      const gameStatus = event.status?.type?.description || "Sin estado";
      const date = event.date ? new Date(event.date).toLocaleString("es-CL") : "Sin fecha";
      const period = event.status?.period || null;
      const clock = event.status?.displayClock || "";

      const card = document.createElement("article");
      card.className = "game-card";

      card.innerHTML = `
        <div class="game-top">
          <span class="game-status">${escapeHtml(gameStatus)}</span>
          <span class="game-date">${escapeHtml(date)}</span>
        </div>

        <div class="teams">
          <div class="team-row">
            <span class="team-name">${escapeHtml(awayName)}</span>
            <strong class="team-score">${escapeHtml(
              typeof awayScore === "object" ? awayScore?.displayValue ?? "-" : awayScore
            )}</strong>
          </div>

          <div class="team-row">
            <span class="team-name">${escapeHtml(homeName)}</span>
            <strong class="team-score">${escapeHtml(
              typeof homeScore === "object" ? homeScore?.displayValue ?? "-" : homeScore
            )}</strong>
          </div>
        </div>

        <div class="live-extra">${period ? escapeHtml(`LIVE · Q${period} · ${clock}`) : ""}</div>

        <div class="game-actions">
          <button class="analyze-btn" data-game-id="${escapeHtml(event.id)}">
            Analizar partido
          </button>
        </div>
      `;

      gamesContainer.appendChild(card);
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
    const homeTeamId = getTeamIdFromCompetitor(home);
    const awayTeamId = getTeamIdFromCompetitor(away);

    const gameDate = comp?.date ? new Date(comp.date).toLocaleString("es-CL") : "Pendiente";

    const conferenceGroups = standingsData?.children || [];

    const allEntries = conferenceGroups.flatMap(group => {
      const entries = group?.standings?.entries || [];
      return entries.map((entry, index) => ({
        ...entry,
        conference: getConferenceLabel(group?.name || "NBA"),
        conferencePosition: index + 1
      }));
    });

    function findTeamEntry(abbr, name) {
      return allEntries.find(entry => {
        const team = entry?.team || {};
        return team.abbreviation === abbr || team.displayName === name;
      });
    }

    const [awaySchedule, homeSchedule] = await Promise.all([
      fetchTeamSchedule(awayTeamId),
      fetchTeamSchedule(homeTeamId)
    ]);

    const awayEntry = findTeamEntry(awayAbbr, awayName);
    const homeEntry = findTeamEntry(homeAbbr, homeName);

    const awayRecent5 = getRecentFormFromSchedule(awaySchedule, awayTeamId, comp?.date, 5);
    const homeRecent5 = getRecentFormFromSchedule(homeSchedule, homeTeamId, comp?.date, 5);

    const awayB2B = getB2BStatus(awaySchedule, awayTeamId, comp?.date);
    const homeB2B = getB2BStatus(homeSchedule, homeTeamId, comp?.date);

    const awayStats = {
      conference: awayEntry?.conference || "Pendiente",
      position: awayEntry?.conferencePosition || "-",
      record: getStatValue(awayEntry, ["overall", "wins"]),
      recentFormHtml: renderFormChips(awayRecent5.games),
      pointsScoredRecent: formatOneDecimal(awayRecent5.scoredAvg),
      pointsAllowedRecent: formatOneDecimal(awayRecent5.allowedAvg),
      diffRecent: formatSignedOneDecimal(awayRecent5.diffAvg),
      b2b: `${awayB2B.label} · ${awayB2B.detail}`
    };

    const homeStats = {
      conference: homeEntry?.conference || "Pendiente",
      position: homeEntry?.conferencePosition || "-",
      record: getStatValue(homeEntry, ["overall", "wins"]),
      recentFormHtml: renderFormChips(homeRecent5.games),
      pointsScoredRecent: formatOneDecimal(homeRecent5.scoredAvg),
      pointsAllowedRecent: formatOneDecimal(homeRecent5.allowedAvg),
      diffRecent: formatSignedOneDecimal(homeRecent5.diffAvg),
      b2b: `${homeB2B.label} · ${homeB2B.detail}`
    };

    const awayRecordParsed = parseRecord(awayStats.record);
    const homeRecordParsed = parseRecord(homeStats.record);
    const awayRecentScoredNum = toNumber(awayStats.pointsScoredRecent);
    const homeRecentScoredNum = toNumber(homeStats.pointsScoredRecent);
    const awayRecentAllowedNum = toNumber(awayStats.pointsAllowedRecent);
    const homeRecentAllowedNum = toNumber(homeStats.pointsAllowedRecent);
    const awayRecentDiffNum = toNumber(awayStats.diffRecent);
    const homeRecentDiffNum = toNumber(homeStats.diffRecent);

    let awayEdge = 0;
    let homeEdge = 0;

    if (awayRecordParsed && homeRecordParsed) {
      if (awayRecordParsed.pct > homeRecordParsed.pct) awayEdge++;
      if (homeRecordParsed.pct > awayRecordParsed.pct) homeEdge++;
    }

    if (awayRecentDiffNum !== null && homeRecentDiffNum !== null) {
      if (awayRecentDiffNum > homeRecentDiffNum) awayEdge += 2;
      if (homeRecentDiffNum > awayRecentDiffNum) homeEdge += 2;
    }

    if (awayRecentScoredNum !== null && homeRecentScoredNum !== null) {
      if (awayRecentScoredNum > homeRecentScoredNum) awayEdge++;
      if (homeRecentScoredNum > awayRecentScoredNum) homeEdge++;
    }

    if (awayRecentAllowedNum !== null && homeRecentAllowedNum !== null) {
      if (awayRecentAllowedNum < homeRecentAllowedNum) awayEdge++;
      if (homeRecentAllowedNum < awayRecentAllowedNum) homeEdge++;
    }

    if (awayB2B.isB2B && !homeB2B.isB2B) homeEdge++;
    if (homeB2B.isB2B && !awayB2B.isB2B) awayEdge++;

    let edgeText = "Matchup equilibrado";
    if (awayEdge > homeEdge) edgeText = `Ventaja ${awayName}`;
    if (homeEdge > awayEdge) edgeText = `Ventaja ${homeName}`;

    let autoNote = "La forma reciente no marca una diferencia fuerte todavía.";
    if (awayEdge >= 3) {
      autoNote = `${awayName} llega mejor en producción reciente y contexto pregame.`;
    } else if (homeEdge >= 3) {
      autoNote = `${homeName} llega mejor en producción reciente y contexto pregame.`;
    } else if (awayB2B.isB2B || homeB2B.isB2B) {
      autoNote = "El descanso puede influir bastante en este partido por situación de back-to-back.";
    }

    const recordCompare = compareNumbersHigherBetter(
      awayRecordParsed?.pct ?? null,
      homeRecordParsed?.pct ?? null
    );

    const recentScoredCompare = compareNumbersHigherBetter(
      awayRecentScoredNum,
      homeRecentScoredNum
    );

    const recentAllowedCompare = compareNumbersLowerBetter(
      awayRecentAllowedNum,
      homeRecentAllowedNum
    );

    const recentDiffCompare = compareNumbersHigherBetter(
      awayRecentDiffNum,
      homeRecentDiffNum
    );

    analysisPanel.innerHTML = `
      <div class="analysis-box">
        <div class="analysis-header">
          <h3>${escapeHtml(awayName)} vs ${escapeHtml(homeName)}</h3>
          <p class="analysis-subtitle">Análisis pregame NBA</p>
          <p class="analysis-date">${escapeHtml(gameDate)}</p>
        </div>

        <div class="betting-notes">
          <h4>${escapeHtml(edgeText)}</h4>
          <p>${escapeHtml(autoNote)}</p>
        </div>

        <div class="pregame-compare">
          <div class="pregame-row pregame-head">
            <div>${escapeHtml(awayName)}</div>
            <div>Métrica</div>
            <div>${escapeHtml(homeName)}</div>
          </div>

          ${buildStatRow(
            escapeHtml(awayStats.conference),
            "Conferencia",
            escapeHtml(homeStats.conference)
          )}

          ${buildStatRow(
            escapeHtml(`${awayStats.record} · ${awayStats.position}º`),
            "Récord / Posición",
            escapeHtml(`${homeStats.record} · ${homeStats.position}º`),
            recordCompare.away,
            recordCompare.home
          )}

          ${buildStatRow(
            awayStats.recentFormHtml,
            "Últimos 5",
            homeStats.recentFormHtml
          )}

          ${buildStatRow(
            escapeHtml(awayStats.pointsScoredRecent),
            "Puntos anotados recientes",
            escapeHtml(homeStats.pointsScoredRecent),
            recentScoredCompare.away,
            recentScoredCompare.home
          )}

          ${buildStatRow(
            escapeHtml(awayStats.pointsAllowedRecent),
            "Puntos recibidos recientes",
            escapeHtml(homeStats.pointsAllowedRecent),
            recentAllowedCompare.away,
            recentAllowedCompare.home
          )}

          ${buildStatRow(
            escapeHtml(awayStats.diffRecent),
            "Diferencial reciente",
            escapeHtml(homeStats.diffRecent),
            recentDiffCompare.away,
            recentDiffCompare.home
          )}

          ${buildStatRow(
            escapeHtml(awayStats.b2b),
            "Back to Back",
            escapeHtml(homeStats.b2b)
          )}
        </div>
      </div>
    `;
  } catch (error) {
    console.error("ERROR ANALYSIS:", error);
    analysisPanel.innerHTML = "<p>No se pudo cargar el análisis pregame del partido.</p>";
  }
}

gamesContainer?.addEventListener("click", (e) => {
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
