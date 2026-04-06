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
  const targetDateKey = getGameCalendarKey(gameDate);
  const previousDateKey = getPreviousCalendarKey(gameDate);

  if (!targetDateKey || !previousDateKey) {
    return {
      isB2B: false,
      label: "No",
      detail: "Sin dato"
    };
  }

  const completedGames = events
    .map(event => getTeamGameInfo(event, teamId))
    .filter(Boolean)
    .filter(game => game.completed);

  const previousDayGame = completedGames.find(game => game.dateKey === previousDateKey);

  if (!previousDayGame) {
    return {
      isB2B: false,
      label: "No",
      detail: "Descanso normal"
    };
  }

  if (previousDayGame.homeAway === "home") {
    return {
      isB2B: true,
      label: "Sí",
      detail: "B2B en casa"
    };
  }

  if (previousDayGame.homeAway === "away") {
    return {
      isB2B: true,
      label: "Sí",
      detail: "B2B con viaje"
    };
  }

  return {
    isB2B: true,
    label: "Sí",
    detail: 
