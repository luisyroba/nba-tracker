const statusEl = document.getElementById("status");
const gamesContainer = document.getElementById("games");
const analysisPanel = document.getElementById("analysis-panel");

const modal = document.getElementById("game-modal");
const modalCloseBtn = document.getElementById("modal-close");
const modalCloseBg = document.getElementById("modal-close-bg");

const ODDS_API_KEY = "8a61d585e42c3c2ae6cd592a78c41019";
const ODDS_API_SPORT = "basketball_nba";
const ODDS_API_REGIONS = "eu,uk,us";
const ODDS_API_MARKETS = "h2h,spreads,totals";
const BOOKMAKER_PRIORITY = ["betano", "novibet", "bet365", "bet365_uk"];

let leagueProfilesCache = null;
let scoreboardCache = [];

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
  return { wins, losses, pct: wins / (wins + losses) };
}

function getStatValue(entry, statNames) {
  if (!entry?.stats) return "Pendiente";
  const names = Array.isArray(statNames) ? statNames : [statNames];

  for (const name of names) {
    const stat = entry.stats.find(
      s => String(s?.name || "").toLowerCase() === String(name).toLowerCase()
    );
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
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function formatOddsDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Pendiente";
  return Number(value).toFixed(2);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Pendiente";
  return `${(value * 100).toFixed(1)}%`;
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

function buildStatRow(awayValue, label, homeValue, awayClass = "", homeClass = "") {
  return `
    <div class="pregame-row">
      <div class="away ${awayClass}">${awayValue}</div>
      <div class="metric">${escapeHtml(label)}</div>
      <div class="home ${homeClass}">${homeValue}</div>
    </div>
  `;
}

function getTeamIdFromCompetitor(competitor) {
  return competitor?.team?.id || competitor?.id || null;
}

function normalizeGamesFromSchedule(data) {
  return Array.isArray(data?.events) ? data.events : [];
}

function getOpponentStrengthLabel(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "Pendiente";
  if (pct >= 0.60) return "Rivales fuertes";
  if (pct >= 0.45) return "Rivales medios";
  return "Rivales dÃ©biles";
}

function getOpponentWeight(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 1;
  if (pct >= 0.60) return 1.25;
  if (pct >= 0.45) return 1.0;
  return 0.75;
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
          title="${escapeHtml(`${game.won ? "GanÃ³" : "PerdiÃ³"} vs ${game.opponentName} (${game.teamScore}-${game.opponentScore})`)}"
        >
          ${game.won ? "G" : "P"}
        </span>
      `).join("")}
    </div>
  `;
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
    completed,
    homeAway: team?.homeAway || "unknown",
    teamScore,
    opponentScore,
    won: teamScore !== null && opponentScore !== null ? teamScore > opponentScore : null,
    opponentName: opponent?.team?.displayName || "Rival",
    opponentAbbr: opponent?.team?.abbreviation || "",
    opponentId: opponent?.team?.id || opponent?.id || null
  };
}

function getRecentFormFromSchedule(data, teamId, gameDate, sampleSize, standingsLookup) {
  const safeLookup = standingsLookup || { byTeamId: {}, byAbbr: {} };
  const events = normalizeGamesFromSchedule(data);
  const targetTime = gameDate ? new Date(gameDate).getTime() : Date.now();

  const recentGames = events
    .map(event => getTeamGameInfo(event, teamId))
    .filter(Boolean)
    .filter(game => game.completed)
    .filter(game => game.date && new Date(game.date).getTime() < targetTime)
    .filter(game => game.teamScore !== null && game.opponentScore !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, sampleSize)
    .map(game => {
      const opponentEntry =
        safeLookup.byTeamId?.[String(game.opponentId)] ||
        safeLookup.byAbbr?.[game.opponentAbbr] ||
        null;

      const opponentRecord = parseRecord(opponentEntry?.record || "");
      const opponentPct = opponentRecord?.pct ?? null;
      const opponentWeight = getOpponentWeight(opponentPct);

      return {
        ...game,
        opponentPct,
        opponentWeight,
        rawDiff: game.teamScore - game.opponentScore,
        weightedDiff: (game.teamScore - game.opponentScore) * opponentWeight
      };
    });

  const wins = recentGames.filter(game => game.won === true).length;
  const losses = recentGames.filter(game => game.won === false).length;

  const scored = recentGames.map(game => game.teamScore);
  const allowed = recentGames.map(game => game.opponentScore);

  const weightedDiffAvg = average(recentGames.map(game => game.weightedDiff));
  const opponentPctAvg = average(recentGames.map(game => game.opponentPct).filter(v => v !== null));

  return {
    games: recentGames,
    record: recentGames.length ? `${wins}-${losses}` : "Pendiente",
    scoredAvg: average(scored),
    allowedAvg: average(allowed),
    adjustedDiffAvg: weightedDiffAvg,
    opponentPctAvg
  };
}

function getVenueSplitForm(scheduleData, teamId, gameDate, venueType, sampleSize = 5) {
  const events = normalizeGamesFromSchedule(scheduleData);
  const targetTime = gameDate ? new Date(gameDate).getTime() : Date.now();

  const filtered = events
    .map(event => getTeamGameInfo(event, teamId))
    .filter(Boolean)
    .filter(game => game.completed)
    .filter(game => game.date && new Date(game.date).getTime() < targetTime)
    .filter(game => game.teamScore !== null && game.opponentScore !== null)
    .filter(game => game.homeAway === venueType)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, sampleSize);

  const wins = filtered.filter(game => game.won === true).length;
  const losses = filtered.filter(game => game.won === false).length;

  return {
    games: filtered,
    record: filtered.length ? `${wins}-${losses}` : "Pendiente",
    diffAvg: average(filtered.map(game => game.teamScore - game.opponentScore))
  };
}

function getB2BStatus(data, teamId, gameDate) {
  const events = normalizeGamesFromSchedule(data);
  const targetTime = gameDate ? new Date(gameDate).getTime() : null;

  if (!targetTime) {
    return { isB2B: false, label: "No", detail: "Sin dato" };
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
    return { isB2B: false, label: "No", detail: "Descanso normal" };
  }

  const previousTime = new Date(previousGame.date).getTime();
  const diffHours = (targetTime - previousTime) / (1000 * 60 * 60);

  if (diffHours > 48) {
    return { isB2B: false, label: "No", detail: "Descanso normal" };
  }

  if (diffHours <= 30) {
    if (previousGame.homeAway === "home") return { isB2B: true, label: "SÃ­", detail: "B2B en casa" };
    if (previousGame.homeAway === "away") return { isB2B: true, label: "SÃ­", detail: "B2B con viaje" };
    return { isB2B: true, label: "SÃ­", detail: "B2B" };
  }

  return { isB2B: false, label: "No", detail: "Descanso normal" };
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
      if (Array.isArray(data?.events)) return data;
    } catch (error) {
      console.warn("Schedule fetch failed:", url, error);
    }
  }

  return null;
}

function detectClincherFromText(text) {
  const t = String(text || "").toLowerCase();

  if (t.includes("eliminated") || t.includes("e --")) return "Eliminado";
  if (t.includes("clinched play-in") || t.includes("pb --")) return "Play-in asegurado";
  if (
    t.includes("clinched playoff") ||
    t.includes("clinched playoff berth") ||
    t.includes("x --") ||
    t.includes("y --") ||
    t.includes("z --")
  ) return "Clasificado a playoffs";

  return null;
}

function getContextFromConferencePosition(position, clincher = null) {
  if (clincher) return clincher;

  const pos = Number(position);
  if (Number.isNaN(pos)) return "Pendiente";

  if (pos >= 1 && pos <= 6) return "Zona de playoffs";
  if (pos >= 7 && pos <= 10) return "Zona de play-in";
  return "Fuera de postemporada";
}

async function fetchConferenceStandingsSorted() {
  const urls = [
    "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?type=0&level=2&sort=playoffseed:asc",
    "https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?type=0&level=2&sort=playoffseed:asc"
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.children?.length) return data;
    } catch (error) {
      console.warn("Standings fetch failed:", url, error);
    }
  }

  return null;
}

function buildStandingsLookup(standingsData) {
  const groups = standingsData?.children || [];

  const entries = groups.flatMap(group => {
    const conference = getConferenceLabel(group?.name || "NBA");
    const standingsEntries = group?.standings?.entries || [];

    return standingsEntries.map((entry, index) => {
      const team = entry?.team || {};
      const record = getStatValue(entry, ["overall", "wins"]);
      const teamId = String(team?.id || "");
      const abbr = team?.abbreviation || "";
      const name = team?.displayName || "";

      const statsText = (entry?.stats || [])
        .map(stat => `${stat?.name || ""} ${stat?.displayValue || ""} ${stat?.description || ""}`)
        .join(" ");

      const noteText = typeof entry?.note === "string" ? entry.note : JSON.stringify(entry?.note || "");
      const combinedText = `${statsText} ${noteText} ${abbr} ${name}`;
      const clincher = detectClincherFromText(combinedText);

      return {
        rawEntry: entry,
        teamId,
        abbr,
        name,
        conference,
        conferencePosition: index + 1,
        record,
        clincher
      };
    });
  });

  const byTeamId = {};
  const byAbbr = {};
  const byName = {};

  for (const entry of entries) {
    if (entry.teamId) byTeamId[entry.teamId] = entry;
    if (entry.abbr) byAbbr[entry.abbr] = entry;
    if (entry.name) byName[entry.name] = entry;
  }

  return { entries, byTeamId, byAbbr, byName };
}

function formatStatusText(status) {
  const lower = String(status || "").toLowerCase();
  if (lower.includes("final")) return "Finalizado";
  if (lower.includes("in progress")) return "En progreso";
  if (lower.includes("scheduled")) return "Programado";
  if (lower.includes("halftime")) return "Descanso";
  return status || "Sin estado";
}

function formatGameTime(dateString) {
  if (!dateString) return "Sin hora";
  const date = new Date(dateString);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function fetchTeamSeasonStats(teamId) {
  if (!teamId) return null;

  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/statistics`,
    `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/statistics`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data) return data;
    } catch (error) {
      console.warn("Team stats fetch failed:", url, error);
    }
  }

  return null;
}

function normalizeStatLabel(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[Ì€-Í¯]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collectAllTeamStats(statsData) {
  const raw = [];

  const categoryGroups = [
    ...(statsData?.results?.stats?.categories || []),
    ...(statsData?.statistics?.splits?.categories || []),
    ...(statsData?.splits?.categories || [])
  ];

  for (const category of categoryGroups) {
    if (Array.isArray(category?.stats)) raw.push(...category.stats);
  }

  const directArrays = [
    ...(Array.isArray(statsData?.results?.stats) ? statsData.results.stats : []),
    ...(Array.isArray(statsData?.statistics?.splits?.stats) ? statsData.statistics.splits.stats : []),
    ...(Array.isArray(statsData?.splits?.stats) ? statsData.splits.stats : [])
  ];

  raw.push(...directArrays);
  return raw.filter(Boolean);
}

function findStatValue(allStats, aliases, containsAliases = []) {
  if (!Array.isArray(allStats) || !allStats.length) return null;

  const normalizedAliases = aliases.map(normalizeStatLabel);
  const normalizedContains = containsAliases.map(normalizeStatLabel);

  for (const stat of allStats) {
    const candidates = [
      stat?.name,
      stat?.displayName,
      stat?.shortDisplayName,
      stat?.abbreviation,
      stat?.description
    ].map(normalizeStatLabel).filter(Boolean);

    const exactMatch = candidates.some(candidate => normalizedAliases.includes(candidate));
    if (exactMatch) return stat?.displayValue ?? stat?.value ?? null;
  }

  for (const stat of allStats) {
    const candidates = [
      stat?.name,
      stat?.displayName,
      stat?.shortDisplayName,
      stat?.abbreviation,
      stat?.description
    ].map(normalizeStatLabel).filter(Boolean);

    const partialMatch = candidates.some(candidate =>
      normalizedContains.some(alias => candidate.includes(alias))
    );

    if (partialMatch) return stat?.displayValue ?? stat?.value ?? null;
  }

  return null;
}

function getSeasonAllowedAverageFromSchedule(scheduleData, teamId) {
  const events = normalizeGamesFromSchedule(scheduleData);

  const completedGames = events
    .map(event => getTeamGameInfo(event, teamId))
    .filter(Boolean)
    .filter(game => game.completed)
    .filter(game => game.teamScore !== null && game.opponentScore !== null);

  if (!completedGames.length) return null;
  return average(completedGames.map(game => game.opponentScore));
}

function getSeasonScoredAverageFromSchedule(scheduleData, teamId) {
  const events = normalizeGamesFromSchedule(scheduleData);

  const completedGames = events
    .map(event => getTeamGameInfo(event, teamId))
    .filter(Boolean)
    .filter(game => game.completed)
    .filter(game => game.teamScore !== null && game.opponentScore !== null);

  if (!completedGames.length) return null;
  return average(completedGames.map(game => game.teamScore));
}

function extractTeamProfile(statsData, fallbackScheduleData = null, teamId = null) {
  const allStats = collectAllTeamStats(statsData);

  let ppg = toNumber(
    findStatValue(
      allStats,
      ["pointspergame", "points per game", "avgpoints", "avg points", "ppg"],
      ["points per game", "avg points", "ppg"]
    )
  );

  let oppPpg = toNumber(
    findStatValue(
      allStats,
      [
        "pointsallowedpergame",
        "points allowed per game",
        "opppointspergame",
        "opp points per game",
        "avgpointsallowed",
        "papg",
        "points allowed"
      ],
      [
        "points allowed per game",
        "opp points per game",
        "points allowed",
        "avg points allowed",
        "opponent points"
      ]
    )
  );

  if (ppg === null && fallbackScheduleData && teamId) {
    ppg = getSeasonScoredAverageFromSchedule(fallbackScheduleData, teamId);
  }

  if (oppPpg === null && fallbackScheduleData && teamId) {
    oppPpg = getSeasonAllowedAverageFromSchedule(fallbackScheduleData, teamId);
  }

  return { ppg, oppPpg };
}

function getRankFromValue(value, values, higherBetter = true) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;

  const cleaned = (Array.isArray(values) ? values : [])
    .filter(v => v !== null && v !== undefined && !Number.isNaN(v))
    .map(v => Number(v));

  if (!cleaned.length) return null;

  const sorted = [...cleaned].sort((a, b) => (higherBetter ? b - a : a - b));
  const index = sorted.findIndex(v => Number(v) === Number(value));

  return index >= 0 ? index + 1 : null;
}

function rankTierLabel(rank, totalTeams = 30) {
  const num = Number(rank);
  if (Number.isNaN(num) || num <= 0) return "media";

  const topCut = Math.ceil(totalTeams / 3);
  const midCut = Math.ceil((totalTeams * 2) / 3);

  if (num <= topCut) return "fuerte";
  if (num <= midCut) return "media";
  return "mala";
}

function buildLeagueProfilesMap(teamProfiles) {
  const validProfiles = teamProfiles.filter(team =>
    team?.profile &&
    team.profile.ppg !== null &&
    team.profile.oppPpg !== null
  );

  const offenseValues = validProfiles
    .map(team => team.profile.ppg)
    .filter(v => v !== null && !Number.isNaN(v));

  const defenseValues = validProfiles
    .map(team => team.profile.oppPpg)
    .filter(v => v !== null && !Number.isNaN(v));

  const totalOffenseTeams = offenseValues.length || 30;
  const totalDefenseTeams = defenseValues.length || 30;

  const result = {};

  for (const team of teamProfiles) {
    const offenseRank = getRankFromValue(team.profile?.ppg ?? null, offenseValues, true);
    const defenseRank = getRankFromValue(team.profile?.oppPpg ?? null, defenseValues, false);

    let offenseLabel = rankTierLabel(offenseRank, totalOffenseTeams);
    let defenseLabel = rankTierLabel(defenseRank, totalDefenseTeams);

    if (team.profile?.ppg === null) offenseLabel = "media";
    if (team.profile?.oppPpg === null) defenseLabel = "media";

    result[String(team.teamId)] = {
      offenseRank,
      defenseRank,
      label: `Ataque ${offenseLabel} | Defensa ${defenseLabel}`
    };
  }

  return result;
}

async function getLeagueProfilesMap(standingsData) {
  if (leagueProfilesCache) return leagueProfilesCache;
  if (!standingsData?.children?.length) return {};

  const leagueTeamIds = standingsData.children
    .flatMap(group => group?.standings?.entries || [])
    .map(entry => String(entry?.team?.id || ""))
    .filter(Boolean);

  const leagueProfilesRaw = await Promise.all(
    leagueTeamIds.map(async (teamId) => {
      const [stats, schedule] = await Promise.all([
        fetchTeamSeasonStats(teamId),
        fetchTeamSchedule(teamId)
      ]);

      return {
        teamId,
        profile: extractTeamProfile(stats, schedule, teamId)
      };
    })
  );

  leagueProfilesCache = buildLeagueProfilesMap(leagueProfilesRaw);
  return leagueProfilesCache;
}

function getCompetitorsFromEventLike(eventLike) {
  return eventLike?.competitions?.[0]?.competitors || eventLike?.header?.competitions?.[0]?.competitors || [];
}

function findGameInScoreboardCache(gameId) {
  return scoreboardCache.find(event => String(event?.id || "") === String(gameId)) || null;
}

async function fetchGameSummary(gameId) {
  const urls = [
    `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`,
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const competitors = data?.header?.competitions?.[0]?.competitors || [];
      if (competitors.length >= 2) return data;
    } catch (error) {
      console.warn("Summary fetch failed:", url, error);
    }
  }

  return null;
}

function buildFallbackSummaryFromScoreboardEvent(event) {
  if (!event) return null;
  return { header: { competitions: event?.competitions || [] } };
}

function createEmptyStandingsLookup() {
  return { entries: [], byTeamId: {}, byAbbr: {}, byName: {} };
}

function normalizeString(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[Ì€-Í¯]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function impliedProbabilityFromDecimal(decimalOdds) {
  const odds = Number(decimalOdds);
  if (!odds || Number.isNaN(odds) || odds <= 1) return null;
  return 1 / odds;
}

function decimalFromImpliedProbability(probability) {
  const p = Number(probability);
  if (!p || Number.isNaN(p) || p <= 0 || p >= 1) return null;
  return 1 / p;
}

function getBookmakerPriorityIndex(key) {
  const idx = BOOKMAKER_PRIORITY.indexOf(String(key || "").toLowerCase());
  return idx === -1 ? 999 : idx;
}

function getBookmakerDisplayName(key, title) {
  const normalized = String(key || "").toLowerCase();
  if (normalized === "bet365_uk") return "bet365";
  return title || key || "Casa";
}

async function fetchOddsApiEvents() {
  const url = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/odds?apiKey=${encodeURIComponent(ODDS_API_KEY)}&regions=${encodeURIComponent(ODDS_API_REGIONS)}&markets=${encodeURIComponent(ODDS_API_MARKETS)}&oddsFormat=decimal&dateFormat=iso`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API HTTP ${res.status}`);
  return res.json();
}

function buildOddsApiEventMatchScore(oddsEvent, homeName, awayName, commenceTime = null) {
  const oddsHome = normalizeString(oddsEvent?.home_team);
  const oddsAway = normalizeString(oddsEvent?.away_team);
  const targetHome = normalizeString(homeName);
  const targetAway = normalizeString(awayName);

  let score = 0;

  if (oddsHome === targetHome) score += 6;
  else if (oddsHome.includes(targetHome) || targetHome.includes(oddsHome)) score += 3;

  if (oddsAway === targetAway) score += 6;
  else if (oddsAway.includes(targetAway) || targetAway.includes(oddsAway)) score += 3;

  if (commenceTime && oddsEvent?.commence_time) {
    const diff = Math.abs(new Date(oddsEvent.commence_time).getTime() - new Date(commenceTime).getTime());
    if (diff <= 1000 * 60 * 180) score += 2;
    else if (diff <= 1000 * 60 * 360) score += 1;
  }

  return score;
}

function findMatchingOddsEvent(oddsEvents, homeName, awayName, commenceTime = null) {
  if (!Array.isArray(oddsEvents) || !oddsEvents.length) return null;

  const scored = oddsEvents
    .map(event => ({
      event,
      score: buildOddsApiEventMatchScore(event, homeName, awayName, commenceTime)
    }))
    .filter(item => item.score >= 7)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.event || null;
}

function normalizeBookmakers(bookmakers) {
  return (bookmakers || []).map(bookmaker => ({
    ...bookmaker,
    key: String(bookmaker?.key || "").toLowerCase(),
    title: bookmaker?.title || bookmaker?.key || "Casa"
  }));
}

function sortBookmakersByPriority(bookmakers) {
  return [...normalizeBookmakers(bookmakers)].sort((a, b) => {
    const priorityDiff = getBookmakerPriorityIndex(a.key) - getBookmakerPriorityIndex(b.key);
    if (priorityDiff !== 0) return priorityDiff;
    return String(a.title).localeCompare(String(b.title));
  });
}

function findOutcomeByTeamName(outcomes, teamName) {
  const target = normalizeString(teamName);
  return (outcomes || []).find(outcome => normalizeString(outcome?.name) === target) || null;
}

function classifyBetStrength(edgeGap, odds, contextPenalty = 0) {
  const adjustedGap = Math.max(0, edgeGap - contextPenalty);

  if (adjustedGap >= 4 && odds >= 1.45) {
    return { level: "Fuerte", stake: "1.0u" };
  }

  if (adjustedGap >= 2.5 && odds >= 1.40) {
    return { level: "Media", stake: "0.75u" };
  }

  if (adjustedGap >= 1.25 && odds >= 1.35) {
    return { level: "Leve", stake: "0.5u" };
  }

  return { level: "No bet", stake: "0u" };
}

function makeNoBet(reason) {
  return {
    selection: null,
    strength: { level: "No bet", stake: "0u" },
    reason
  };
}

function estimateAdjustedOdds(basePoint, baseOdds, targetPoint, factorPerPoint = 0.022) {
  const baseProb = impliedProbabilityFromDecimal(baseOdds);
  if (baseProb === null) return null;

  const moveTowardBettor = Math.abs(basePoint) - Math.abs(targetPoint);
  if (moveTowardBettor <= 0) return null;

  const addedProb = moveTowardBettor * factorPerPoint;
  const estimatedProb = Math.min(0.92, baseProb + addedProb);
  const estimatedOdds = decimalFromImpliedProbability(estimatedProb);
  if (estimatedOdds === null) return null;
  return Number(estimatedOdds.toFixed(2));
}

function getSuggestedAlternateSpread(mainSpreadPoint, modelMarginAbs) {
  const spreadAbs = Math.abs(mainSpreadPoint);
  const modelAbs = Math.abs(modelMarginAbs);
  if (Number.isNaN(spreadAbs) || Number.isNaN(modelAbs)) return null;

  const safeAbs = Math.max(1.5, Math.floor((Math.max(modelAbs - 1.5, 1.5)) * 2) / 2);
  if (safeAbs >= spreadAbs) return null;

  return mainSpreadPoint < 0 ? -safeAbs : safeAbs;
}

function getSuggestedAlternateTotal(mainTotalPoint, projectedTotal, side = "over") {
  if (mainTotalPoint === null || projectedTotal === null) return null;

  const gap = Math.abs(projectedTotal - mainTotalPoint);
  if (gap < 3.5) return null;

  if (side === "over") {
    const target = Math.floor((mainTotalPoint - 4.5) * 2) / 2;
    return target < mainTotalPoint ? target : null;
  }

  const target = Math.ceil((mainTotalPoint + 4.5) * 2) / 2;
  return target > mainTotalPoint ? target : null;
}

function deriveInjurySeverity(statusText) {
  const text = normalizeString(statusText);
  if (!text) return 0;
  if (text.includes("out")) return 1.4;
  if (text.includes("doubt")) return 1.0;
  if (text.includes("question")) return 0.6;
  if (text.includes("game time")) return 0.5;
  if (text.includes("day to day")) return 0.35;
  if (text.includes("probable")) return 0.15;
  return 0.2;
}

function isKeyPlayerName(playerName) {
  const words = normalizeString(playerName).split(" ").filter(Boolean);
  return words.length >= 2;
}

function summarizeAvailability(availability) {
  if (!availability) {
    return {
      display: "Sin datos",
      scorePenalty: 0,
      lineupLabel: "Sin confirmar",
      injuryCount: 0
    };
  }

  const confirmedBonus = availability.lineupConfirmed ? 0.35 : 0;
  const expectedBonus = availability.lineupExpected && !availability.lineupConfirmed ? 0.15 : 0;

  const injuryPenalty = (availability.injuries || []).reduce((sum, item) => {
    const weight = isKeyPlayerName(item.player) ? 1 : 0.6;
    return sum + deriveInjurySeverity(item.status) * weight;
  }, 0);

  const scorePenalty = Math.max(0, injuryPenalty - confirmedBonus - expectedBonus);

  const lineupLabel = availability.lineupConfirmed
    ? "Confirmado"
    : availability.lineupExpected
      ? "Probable"
      : "Sin confirmar";

  const parts = [];
  parts.push(`Lineup ${lineupLabel}`);
  if (availability.injuries?.length) {
    parts.push(`${availability.injuries.length} bajas/dudas`);
  }

  return {
    display: parts.join(" Â· "),
    scorePenalty: Number(scorePenalty.toFixed(2)),
    lineupLabel,
    injuryCount: availability.injuries?.length || 0
  };
}

async function fetchEspnInjuriesPage(teamAbbr = "") {
  if (!teamAbbr) return "";
  const urls = [
    `https://www.espn.com/nba/injuries/_/team/${teamAbbr.toLowerCase()}`,
    "https://www.espn.com/nba/injuries"
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      if (text) return text;
    } catch (error) {
      console.warn("Injuries fetch failed:", url, error);
    }
  }

  return "";
}

function extractEspnTeamInjuries(html) {
  const text = String(html || "");
  if (!text) return [];

  const rows = [];
  const nameRegex = /"fullName":"([^"]+)"/g;
  let match;

  while ((match = nameRegex.exec(text)) !== null) {
    const start = match.index;
    const chunk = text.slice(start, start + 500);
    const player = match[1];

    const statusMatch =
      chunk.match(/"status":"([^"]+)"/i) ||
      chunk.match(/"comment":"([^"]+)"/i);

    const positionMatch =
      chunk.match(/"position":"([^"]+)"/i) ||
      chunk.match(/"displayPosition":"([^"]+)"/i);

    rows.push({
      player,
      position: positionMatch?.[1] || "",
      status: statusMatch?.[1] || "Pendiente"
    });
  }

  return rows
    .filter(item => item.player && item.status)
    .filter((item, index, arr) =>
      arr.findIndex(x => normalizeString(x.player) === normalizeString(item.player)) === index
    )
    .slice(0, 8);
}

async function fetchRotowireLineupsHtml(dateMode = "today") {
  const url = dateMode === "tomorrow"
    ? "https://www.rotowire.com/basketball/nba-lineups.php?date=tomorrow"
    : "https://www.rotowire.com/basketball/nba-lineups.php";

  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    return await res.text();
  } catch (error) {
    console.warn("RotoWire fetch failed:", url, error);
    return "";
  }
}

function extractTeamLineupInfoFromHtml(html, teamName, teamAbbr) {
  const safeHtml = String(html || "");
  const normalizedTeamName = normalizeString(teamName);
  const normalizedTeamAbbr = normalizeString(teamAbbr);

  const emptyResult = {
    lineupConfirmed: false,
    lineupExpected: false,
    starters: [],
    injuries: []
  };

  if (!safeHtml || (!normalizedTeamName && !normalizedTeamAbbr)) {
    return emptyResult;
  }

  const cleanText = safeHtml
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(div|section|article|li|p|tr|td|h1|h2|h3|h4|h5|h6|span)>/gi, "
")
    .replace(/<br\s*\/?>/gi, "
")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ 	]+/g, " ")
    .replace(/
{2,}/g, "
");

  const lines = cleanText
    .split("
")
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return emptyResult;

  const teamIndexes = lines
    .map((line, idx) => ({ idx, normalized: normalizeString(line) }))
    .filter(item => {
      if (normalizedTeamName && item.normalized.includes(normalizedTeamName)) return true;
      if (normalizedTeamAbbr && item.normalized.includes(normalizedTeamAbbr)) return true;
      return false;
    })
    .map(item => item.idx);

  if (!teamIndexes.length) {
    return emptyResult;
  }

  const starters = [];
  const injuries = [];
  let lineupConfirmed = false;
  let lineupExpected = false;

  for (const idx of teamIndexes.slice(0, 4)) {
    const block = lines.slice(Math.max(0, idx - 10), Math.min(lines.length, idx + 55));
    const blockText = normalizeString(block.join(" "));

    if (blockText.includes("confirmed lineup")) lineupConfirmed = true;
    if (blockText.includes("expected lineup") || blockText.includes("projected lineup")) lineupExpected = true;

    for (let i = 0; i < block.length - 1; i++) {
      const pos = normalizeString(block[i]);
      const next = String(block[i + 1] || "").trim();

      if (["pg", "sg", "sf", "pf", "c"].includes(pos)) {
        if (/^[A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+)+$/.test(next)) {
          const dedupeKey = `${pos}-${normalizeString(next)}`;
          const exists = starters.some(item => `${normalizeString(item.position)}-${normalizeString(item.player)}` === dedupeKey);
          if (!exists) {
            starters.push({ position: block[i].toUpperCase(), player: next });
          }
        }
      }
    }

    const injuryRegex = /([A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+)+)\s+(Out|Questionable|Doubtful|Probable|Game Time Decision|Day-To-Day|GTD)/g;
    const joinedBlock = block.join(" ");
    let injuryMatch;

    while ((injuryMatch = injuryRegex.exec(joinedBlock)) !== null) {
      const exists = injuries.some(item => normalizeString(item.player) === normalizeString(injuryMatch[1]));
      if (!exists) {
        injuries.push({
          player: injuryMatch[1],
          status: injuryMatch[2]
        });
      }
    }

    if (starters.length >= 5) break;
  }

  return {
    lineupConfirmed,
    lineupExpected: lineupExpected || lineupConfirmed,
    starters: starters.slice(0, 5),
    injuries: injuries.slice(0, 8)
  };
}

async function getTeamAvailability(teamName, teamAbbr) {
  const [espnHtml, rwTodayHtml, rwTomorrowHtml] = await Promise.all([
    fetchEspnInjuriesPage(teamAbbr),
    fetchRotowireLineupsHtml("today"),
    fetchRotowireLineupsHtml("tomorrow")
  ]);

  const espnInjuries = extractEspnTeamInjuries(espnHtml);
  const rwToday = extractTeamLineupInfoFromHtml(rwTodayHtml, teamName, teamAbbr);
  const rwTomorrow = extractTeamLineupInfoFromHtml(rwTomorrowHtml, teamName, teamAbbr);

  const lineupSource = rwToday.lineupExpected || rwToday.lineupConfirmed || rwToday.starters.length
    ? rwToday
    : rwTomorrow;

  const mergedInjuries = [...(lineupSource.injuries || [])];

  for (const item of espnInjuries) {
    const exists = mergedInjuries.some(existing => normalizeString(existing.player) === normalizeString(item.player));
    if (!exists) {
      mergedInjuries.push({
        player: item.player,
        position: item.position || "",
        status: item.status
      });
    }
  }

  return {
    lineupConfirmed: Boolean(lineupSource.lineupConfirmed),
    lineupExpected: Boolean(lineupSource.lineupExpected),
    starters: lineupSource.starters || [],
    injuries: mergedInjuries.slice(0, 8)
  };
}

function renderAvailabilityInfo(summary) {
  if (!summary) return "Sin datos";
  return `${summary.display}`;
}

function renderTeamAvailabilityCard(teamName, availability) {
  const starters = Array.isArray(availability?.starters) ? availability.starters : [];
  const injuries = Array.isArray(availability?.injuries) ? availability.injuries : [];

  return `
    <div class="availability-card-lite">
      <p style="margin:0 0 8px 0;"><strong>${escapeHtml(teamName)}</strong></p>
      <p style="margin:0 0 8px 0; color:#475569;">
        Estado lineup:
        <strong>${
          availability?.lineupConfirmed
            ? "Confirmado"
            : availability?.lineupExpected
              ? "Probable"
              : "Sin confirmar"
        }</strong>
      </p>

      <div style="margin-top:8px;">
        <p style="margin:0 0 6px 0;"><strong>Quinteto esperado</strong></p>
        ${
          starters.length
            ? starters.map(item => `
                <p style="margin:0 0 4px 0; color:#334155;">${escapeHtml(item.position)} Â· ${escapeHtml(item.player)}</p>
              `).join("")
            : `<p style="margin:0; color:#64748b;">No detectado.</p>`
        }
      </div>

      <div style="margin-top:10px;">
        <p style="margin:0 0 6px 0;"><strong>Bajas / dudas</strong></p>
        ${
          injuries.length
            ? injuries.slice(0, 6).map(item => `
                <p style="margin:0 0 4px 0; color:#334155;">${escapeHtml(item.player)}: ${escapeHtml(item.status || "Pendiente")}</p>
              `).join("")
            : `<p style="margin:0; color:#64748b;">Sin bajas relevantes detectadas.</p>`
        }
      </div>
    </div>
  `;
}

function renderBetRecommendationBlock(
  recommendation,
  edgeText,
  autoNote,
  leanText,
  availabilityNote = "",
  awayAvailability = null,
  awayName = "",
  homeAvailability = null,
  homeName = ""
) {
  const isNoBet = recommendation?.strength?.level === "No bet" || !recommendation?.selection;
  const toneClass = isNoBet ? "is-neutral" : "is-positive";

  return `
    <div class="bet-recommendation-card ${toneClass}">
      <div class="bet-recommendation-top">
        <p class="bet-kicker">${escapeHtml(edgeText)}</p>
        <h4>${isNoBet ? "Lectura del partido" : "RecomendaciÃ³n de apuesta"}</h4>
        <p class="bet-note">${escapeHtml(autoNote)}</p>
        <p class="bet-lean"><strong>${escapeHtml(leanText)}</strong></p>
        ${availabilityNote ? `<p class="bet-availability">${escapeHtml(availabilityNote)}</p>` : ""}
      </div>

      ${
        recommendation?.selection
          ? `
            <div class="bet-pick">
              <p><strong>Pick recomendado:</strong> ${escapeHtml(recommendation.selection.label)}</p>
              <p><strong>Mercado:</strong> ${escapeHtml(recommendation.selection.marketLabel || recommendation.selection.type?.toUpperCase?.() || "Pendiente")}</p>
              <p><strong>Casa:</strong> ${escapeHtml(getBookmakerDisplayName(recommendation.selection.bookmakerKey, recommendation.selection.bookmakerTitle))}</p>
              <p><strong>Cuota:</strong> ${escapeHtml(formatOddsDecimal(recommendation.selection.odds))}</p>
              <p><strong>Prob. implÃ­cita:</strong> ${escapeHtml(formatPercent(recommendation.selection.impliedProbability))}</p>
              ${recommendation.selection.isEstimated ? `<p>LÃ­nea estimada basada en mercado principal (${escapeHtml(recommendation.selection.derivedFromLabel || "referencia")}).</p>` : ""}
              <p><strong>Fuerza:</strong> ${escapeHtml(recommendation.strength.level)} | <strong>Stake:</strong> ${escapeHtml(recommendation.strength.stake)}</p>
              <p>${escapeHtml(recommendation.reason || "")}</p>
            </div>
          `
          : `
            <div class="bet-pick no-bet-copy">
              <p><strong>Pick recomendado:</strong> No bet</p>
              <p>${escapeHtml(recommendation?.reason || "No hay una cuota jugable alineada con la lectura estadÃ­stica.")}</p>
            </div>
          `
      }

      <div class="team-availability-grid">
        ${renderTeamAvailabilityCard(awayName, awayAvailability)}
        ${renderTeamAvailabilityCard(homeName, homeAvailability)}
      </div>
    </div>
  `;
}

function selectSideRecommendation(bookmakers, preferredSideName, modelMarginAbs = null) {
  const ordered = sortBookmakersByPriority(bookmakers);

  for (const bookmaker of ordered) {
    const h2h = bookmaker?.markets?.find(m => m?.key === "h2h");
    const spreads = bookmaker?.markets?.find(m => m?.key === "spreads");

    const spreadOutcome = findOutcomeByTeamName(spreads?.outcomes || [], preferredSideName);
    const spreadPrice = Number(spreadOutcome?.price);
    const spreadPoint = Number(spreadOutcome?.point);

    const hasSpread = spreadOutcome && !Number.isNaN(spreadPrice) && spreadPrice >= 1.2 && !Number.isNaN(spreadPoint);
    const spreadAbs = Math.abs(spreadPoint);
    const modelAbs = Number(modelMarginAbs);

    if (hasSpread && modelAbs !== null && !Number.isNaN(modelAbs)) {
      const spreadIsPlayable = spreadPoint < 0 ? spreadAbs <= Math.max(5.5, modelAbs - 1) : true;

      if (spreadIsPlayable && modelAbs >= 3) {
        return {
          type: "spread",
          marketLabel: "SPREAD",
          bookmakerKey: bookmaker.key,
          bookmakerTitle: bookmaker.title,
          side: preferredSideName,
          line: spreadPoint,
          label: `${preferredSideName} ${spreadPoint > 0 ? `+${spreadPoint}` : spreadPoint}`,
          odds: spreadPrice,
          impliedProbability: impliedProbabilityFromDecimal(spreadPrice),
          isEstimated: false
        };
      }

      const altPoint = getSuggestedAlternateSpread(spreadPoint, modelAbs);
      const altOdds = altPoint !== null ? estimateAdjustedOdds(spreadPoint, spreadPrice, altPoint, 0.022) : null;

      if (altPoint !== null && altOdds !== null && altOdds >= 1.15 && modelAbs >= 3) {
        return {
          type: "alternate-spread-estimated",
          marketLabel: "SPREAD ALTERNATIVO ESTIMADO",
          bookmakerKey: bookmaker.key,
          bookmakerTitle: bookmaker.title,
          side: preferredSideName,
          line: altPoint,
          label: `${preferredSideName} ${altPoint > 0 ? `+${altPoint}` : altPoint}`,
          odds: altOdds,
          impliedProbability: impliedProbabilityFromDecimal(altOdds),
          isEstimated: true,
          derivedFromLabel: `${preferredSideName} ${spreadPoint > 0 ? `+${spreadPoint}` : spreadPoint} @ ${formatOddsDecimal(spreadPrice)}`
        };
      }
    }

    const mlOutcome = findOutcomeByTeamName(h2h?.outcomes || [], preferredSideName);
    const mlPrice = Number(mlOutcome?.price);

    if (mlOutcome && !Number.isNaN(mlPrice) && mlPrice >= 1.2) {
      return {
        type: "moneyline",
        marketLabel: "MONEYLINE",
        bookmakerKey: bookmaker.key,
        bookmakerTitle: bookmaker.title,
        side: preferredSideName,
        label: `${preferredSideName} gana`,
        odds: mlPrice,
        impliedProbability: impliedProbabilityFromDecimal(mlPrice),
        isEstimated: false
      };
    }

    if (hasSpread) {
      return {
        type: "spread",
        marketLabel: "SPREAD",
        bookmakerKey: bookmaker.key,
        bookmakerTitle: bookmaker.title,
        side: preferredSideName,
        line: spreadPoint,
        label: `${preferredSideName} ${spreadPoint > 0 ? `+${spreadPoint}` : spreadPoint}`,
        odds: spreadPrice,
        impliedProbability: impliedProbabilityFromDecimal(spreadPrice),
        isEstimated: false
      };
    }
  }

  return null;
}

function selectTotalRecommendation(bookmakers, projectedTotal) {
  if (projectedTotal === null) return null;

  const ordered = sortBookmakersByPriority(bookmakers);

  for (const bookmaker of ordered) {
    const totals = bookmaker?.markets?.find(m => m?.key === "totals");
    const over = (totals?.outcomes || []).find(o => normalizeString(o?.name) === "over");
    const under = (totals?.outcomes || []).find(o => normalizeString(o?.name) === "under");

    const overPoint = Number(over?.point);
    const underPoint = Number(under?.point);
    const overPrice = Number(over?.price);
    const underPrice = Number(under?.price);

    if (!Number.isNaN(overPoint) && !Number.isNaN(overPrice) && overPrice >= 1.2) {
      if (projectedTotal >= overPoint + 3.5) {
        return {
          type: "total",
          marketLabel: "TOTAL",
          bookmakerKey: bookmaker.key,
          bookmakerTitle: bookmaker.title,
          side: "Over",
          line: overPoint,
          label: `MÃ¡s de ${overPoint}`,
          odds: overPrice,
          impliedProbability: impliedProbabilityFromDecimal(overPrice),
          isEstimated: false
        };
      }
    }

    if (!Number.isNaN(underPoint) && !Number.isNaN(underPrice) && underPrice >= 1.2) {
      if (projectedTotal <= underPoint - 3.5) {
        return {
          type: "total",
          marketLabel: "TOTAL",
          bookmakerKey: bookmaker.key,
          bookmakerTitle: bookmaker.title,
          side: "Under",
          line: underPoint,
          label: `Menos de ${underPoint}`,
          odds: underPrice,
          impliedProbability: impliedProbabilityFromDecimal(underPrice),
          isEstimated: false
        };
      }
    }
  }

  return null;
}

function buildOddsRecommendation({
  oddsEvent,
  awayName,
  homeName,
  awayEdge,
  homeEdge,
  projectedTotal,
  projectedSpread,
  awayAvailabilityPenalty = 0,
  homeAvailabilityPenalty = 0
}) {
  if (!oddsEvent?.bookmakers?.length) {
    return makeNoBet("No se encontraron cuotas disponibles para este partido.");
  }

  const adjustedAwayEdge = awayEdge - awayAvailabilityPenalty;
  const adjustedHomeEdge = homeEdge - homeAvailabilityPenalty;
  const edgeGap = Math.abs(adjustedAwayEdge - adjustedHomeEdge);
  const contextPenalty = Math.max(awayAvailabilityPenalty, homeAvailabilityPenalty) >= 1.5 ? 1 : 0;

  if (adjustedAwayEdge >= adjustedHomeEdge + 1.0) {
    const selection = selectSideRecommendation(oddsEvent.bookmakers, awayName, Math.abs(projectedSpread));
    if (selection) {
      return {
        selection,
        strength: classifyBetStrength(edgeGap, selection.odds, contextPenalty),
        reason: `${awayName} es el lado que mejor respalda la lectura estadÃ­stica del matchup.`
      };
    }
  }

  if (adjustedHomeEdge >= adjustedAwayEdge + 1.0) {
    const selection = selectSideRecommendation(oddsEvent.bookmakers, homeName, Math.abs(projectedSpread));
    if (selection) {
      return {
        selection,
        strength: classifyBetStrength(edgeGap, selection.odds, contextPenalty),
        reason: `${homeName} es el lado que mejor respalda la lectura estadÃ­stica del matchup.`
      };
    }
  }

  const totalSelection = selectTotalRecommendation(oddsEvent.bookmakers, projectedTotal);
  if (totalSelection) {
    return {
      selection: totalSelection,
      strength: classifyBetStrength(1.75, totalSelection.odds, contextPenalty),
      reason: "Como el lado estÃ¡ equilibrado, el mejor Ã¡ngulo del matchup aparece en el total."
    };
  }

  const fallbackMoneyline =
    adjustedAwayEdge > adjustedHomeEdge
      ? selectSideRecommendation(oddsEvent.bookmakers, awayName, 0)
      : selectSideRecommendation(oddsEvent.bookmakers, homeName, 0);

  if (fallbackMoneyline) {
    return {
      selection: fallbackMoneyline,
      strength: classifyBetStrength(1.25, fallbackMoneyline.odds, contextPenalty),
      reason: "No hubo spread o total claro, pero sÃ­ una opciÃ³n utilizable para seguir el lean principal."
    };
  }

  return makeNoBet("La lectura es intermedia y no deja un pick claro que coincida con las estadÃ­sticas y la disponibilidad.");
}

document.addEventListener("click", (event) => {
  const analyzeBtn = event.target.closest(".analyze-btn");
  if (analyzeBtn) {
    const gameId = analyzeBtn.getAttribute("data-game-id");
    if (gameId) analyzeGame(gameId);
  }
});

if (modalCloseBtn) {
  modalCloseBtn.addEventListener("click", closeModal);
}

if (modalCloseBg) {
  modalCloseBg.addEventListener("click", closeModal);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

async function loadNBAGames() {
  if (!statusEl || !gamesContainer) return;
  statusEl.textContent = "Cargando partidos NBA reales...";
  gamesContainer.innerHTML = "";

  try {
    const todayDate = getLocalScoreboardDate(0);
    const tomorrowDate = getLocalScoreboardDate(1);

    let data = await fetchScoreboardByDate(todayDate);
    let events = data?.events || [];

    if (!events.length) {
      data = await fetchScoreboardByDate(tomorrowDate);
      events = data?.events || [];
    }

    scoreboardCache = events;

    if (!events.length) {
      statusEl.textContent = "No se encontraron partidos NBA";
      gamesContainer.innerHTML = "<p>No hay juegos disponibles.</p>";
      return;
    }

    statusEl.textContent = `Se cargaron ${events.length} partidos NBA`;
    gamesContainer.innerHTML = "";

    for (const event of events) {
      const comp = event.competitions?.[0] || null;
      const competitors = comp?.competitors || [];
      const home = competitors.find(t => t.homeAway === "home");
      const away = competitors.find(t => t.homeAway === "away");

      const homeName = home?.team?.displayName || "Local";
      const awayName = away?.team?.displayName || "Visitante";

      const homeScoreRaw = home?.score ?? "-";
      const awayScoreRaw = away?.score ?? "-";

      const homeScore = typeof homeScoreRaw === "object" ? homeScoreRaw?.displayValue ?? "-" : homeScoreRaw;
      const awayScore = typeof awayScoreRaw === "object" ? awayScoreRaw?.displayValue ?? "-" : awayScoreRaw;

      const rawStatus = event.status?.type?.description || "Sin estado";
      const gameStatus = formatStatusText(rawStatus);
      const period = event.status?.period ?? null;
      const clock = event.status?.displayClock || "";
      const statusState = event.status?.type?.state;

      const isFinal = statusState === "post" || gameStatus === "Finalizado";
      const isLive = statusState === "in" || gameStatus === "En progreso";
      const isScheduled = !isFinal && !isLive;

      let badgeText = "Programado";
      if (isFinal) badgeText = "Finalizado";
      else if (isLive) badgeText = `En progreso Â· Q${period} - ${clock}`.trim();
      else badgeText = `Programado Â· ${formatGameTime(event.date)}`;

      const card = document.createElement("article");
      card.className = "game-card";
      card.innerHTML = `
        <div class="game-top">
          <span class="game-status">${escapeHtml(gameStatus)}</span>
          <span class="game-date">${escapeHtml(formatGameTime(event.date))}</span>
        </div>

        <div class="teams">
          <div class="team-row">
            <span class="team-name">${escapeHtml(awayName)}</span>
            <strong class="team-score">${escapeHtml(awayScore)}</strong>
          </div>
          <div class="team-row">
            <span class="team-name">${escapeHtml(homeName)}</span>
            <strong class="team-score">${escapeHtml(homeScore)}</strong>
          </div>
        </div>

        <div class="live-extra ${isFinal ? "is-final" : isScheduled ? "is-scheduled" : ""}">${escapeHtml(badgeText)}</div>

        <div class="game-actions">
          <button class="analyze-btn" data-game-id="${escapeHtml(event.id)}">Analizar partido</button>
        </div>
      `;

      gamesContainer.appendChild(card);
    }
  } catch (error) {
    console.error("ERROR ESPN", error);
    statusEl.textContent = "Error al cargar ESPN";
    gamesContainer.innerHTML = "<p>No se pudo cargar la API de ESPN.</p>";
  }
}

function getLocalScoreboardDate(offsetDays = 0) {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const yyyy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function fetchScoreboardByDate(dateStr) {
  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`,
    `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data?.events)) return data;
    } catch (error) {
      console.warn("Scoreboard fetch failed:", url, error);
    }
  }

  return { events: [] };
}

async function analyzeGame(gameId) {
  if (!analysisPanel) return;

  openModal();
  analysisPanel.innerHTML = "<p>Cargando anÃ¡lisis pregame...</p>";

  try {
    const summaryResult = await fetchGameSummary(gameId);
    const scoreboardEvent = findGameInScoreboardCache(gameId);
    const summaryData = summaryResult || buildFallbackSummaryFromScoreboardEvent(scoreboardEvent);
    const competitors = getCompetitorsFromEventLike(summaryData);

    if (!competitors.length) {
      analysisPanel.innerHTML = "<p>No se pudo abrir el pregame de este partido.</p>";
      return;
    }

    const comp = summaryData?.header?.competitions?.[0] || scoreboardEvent?.competitions?.[0];
    const home = competitors.find(team => team.homeAway === "home");
    const away = competitors.find(team => team.homeAway === "away");

    if (!home || !away) {
      analysisPanel.innerHTML = "<p>No se pudo identificar local y visitante en este partido.</p>";
      return;
    }

    const gameDate = comp?.date || scoreboardEvent?.date || null;
    const homeId = getTeamIdFromCompetitor(home);
    const awayId = getTeamIdFromCompetitor(away);
    const homeName = home?.team?.displayName || "Local";
    const awayName = away?.team?.displayName || "Visitante";
    const homeAbbr = home?.team?.abbreviation || "";
    const awayAbbr = away?.team?.abbreviation || "";

    const [standingsData, oddsEvents, awaySchedule, homeSchedule, awayStats, homeStats, awayAvailability, homeAvailability] = await Promise.all([
      fetchConferenceStandingsSorted(),
      fetchOddsApiEvents().catch(() => []),
      fetchTeamSchedule(awayId),
      fetchTeamSchedule(homeId),
      fetchTeamSeasonStats(awayId),
      fetchTeamSeasonStats(homeId),
      getTeamAvailability(awayName, awayAbbr),
      getTeamAvailability(homeName, homeAbbr)
    ]);

    const standingsLookup = standingsData ? buildStandingsLookup(standingsData) : createEmptyStandingsLookup();
    const leagueProfilesMap = standingsData ? await getLeagueProfilesMap(standingsData) : {};

    const awayStanding = standingsLookup.byTeamId?.[String(awayId)] || standingsLookup.byAbbr?.[awayAbbr] || null;
    const homeStanding = standingsLookup.byTeamId?.[String(homeId)] || standingsLookup.byAbbr?.[homeAbbr] || null;

    const awayRecord = awayStanding?.record || "Pendiente";
    const homeRecord = homeStanding?.record || "Pendiente";

    const awayContext = getContextFromConferencePosition(awayStanding?.conferencePosition, awayStanding?.clincher);
    const homeContext = getContextFromConferencePosition(homeStanding?.conferencePosition, homeStanding?.clincher);

    const awayRecent = getRecentFormFromSchedule(awaySchedule, awayId, gameDate, 5, standingsLookup);
    const homeRecent = getRecentFormFromSchedule(homeSchedule, homeId, gameDate, 5, standingsLookup);

    const awayAwayForm = getVenueSplitForm(awaySchedule, awayId, gameDate, "away", 5);
    const homeHomeForm = getVenueSplitForm(homeSchedule, homeId, gameDate, "home", 5);

    const awayB2B = getB2BStatus(awaySchedule, awayId, gameDate);
    const homeB2B = getB2BStatus(homeSchedule, homeId, gameDate);

    const awayProfile = extractTeamProfile(awayStats, awaySchedule, awayId);
    const homeProfile = extractTeamProfile(homeStats, homeSchedule, homeId);

    const awayLeagueLabel = leagueProfilesMap?.[String(awayId)]?.label || "Ataque medio | Defensa media";
    const homeLeagueLabel = leagueProfilesMap?.[String(homeId)]?.label || "Ataque medio | Defensa media";

    const awayAvailabilitySummary = summarizeAvailability(awayAvailability);
    const homeAvailabilitySummary = summarizeAvailability(homeAvailability);

    const awayEdge =
      (awayRecent.adjustedDiffAvg || 0) +
      ((awayAwayForm.diffAvg || 0) * 0.45) -
      (awayB2B.isB2B ? 1.2 : 0) -
      awayAvailabilitySummary.scorePenalty;

    const homeEdge =
      (homeRecent.adjustedDiffAvg || 0) +
      ((homeHomeForm.diffAvg || 0) * 0.45) -
      (homeB2B.isB2B ? 1.2 : 0) -
      homeAvailabilitySummary.scorePenalty;

    const projectedSpread = Number((homeEdge - awayEdge).toFixed(1));
    const projectedTotal = Number((((awayRecent.scoredAvg || 110) + (homeRecent.scoredAvg || 110)) * 0.98).toFixed(1));

    let leanText = "Partido equilibrado";
    if (awayEdge >= homeEdge + 1.5) {
      leanText = `Lean: ${awayName}`;
    } else if (homeEdge >= awayEdge + 1.5) {
      leanText = `Lean: ${homeName}`;
    }

    const oddsMatch = findMatchingOddsEvent(oddsEvents, homeName, awayName, gameDate);
    const recommendation = buildOddsRecommendation({
      oddsEvent: oddsMatch,
      awayName,
      homeName,
      awayEdge,
      homeEdge,
      projectedTotal,
      projectedSpread,
      awayAvailabilityPenalty: awayAvailabilitySummary.scorePenalty,
      homeAvailabilityPenalty: homeAvailabilitySummary.scorePenalty
    });

    const edgeText = `Modelo: ${awayName} ${formatSignedOneDecimal(-projectedSpread)} | Total ${formatOneDecimal(projectedTotal)}`;
    const autoNote = `Edge visitante ${formatOneDecimal(awayEdge)} | Edge local ${formatOneDecimal(homeEdge)}`;
    const availabilityNote = `${awayName}: ${renderAvailabilityInfo(awayAvailabilitySummary)} | ${homeName}: ${renderAvailabilityInfo(homeAvailabilitySummary)}`;

    analysisPanel.innerHTML = `
      <div class="analysis-box">
        <div class="analysis-header">
          <h3>${escapeHtml(awayName)} vs ${escapeHtml(homeName)}</h3>
          <p class="analysis-subtitle">Pregame NBA en espaÃ±ol</p>
          <p class="analysis-date">${escapeHtml(gameDate ? new Date(gameDate).toLocaleString("es-CL") : "Sin fecha")}</p>
        </div>

        ${renderBetRecommendationBlock(
          recommendation,
          edgeText,
          autoNote,
          leanText,
          availabilityNote,
          awayAvailability,
          awayName,
          homeAvailability,
          homeName
        )}

        <div class="pregame-shell">
          <div class="pregame-row pregame-head">
            <div>${escapeHtml(awayName)}</div>
            <div>MÃ©trica</div>
            <div>${escapeHtml(homeName)}</div>
          </div>

          <div class="pregame-compare">
            ${buildStatRow(escapeHtml(awayStanding?.conference || "NBA"), "Conferencia", escapeHtml(homeStanding?.conference || "NBA"))}
            ${buildStatRow(escapeHtml(`${awayRecord} Â· #${awayStanding?.conferencePosition || "-"}`), "RÃ©cord / PosiciÃ³n", escapeHtml(`${homeRecord} Â· #${homeStanding?.conferencePosition || "-"}`))}
            ${buildStatRow(escapeHtml(awayContext), "Contexto", escapeHtml(homeContext))}
            ${buildStatRow(renderFormChips(awayRecent.games), "Ãšltimos 5", renderFormChips(homeRecent.games))}
            ${buildStatRow(escapeHtml(getOpponentStrengthLabel(awayRecent.opponentPctAvg)), "Calidad rival", escapeHtml(getOpponentStrengthLabel(homeRecent.opponentPctAvg)))}
            ${buildStatRow(escapeHtml(`${awayAwayForm.record} | ${formatSignedOneDecimal(awayAwayForm.diffAvg || 0)}`), "Forma fuera/casa", escapeHtml(`${homeHomeForm.record} | ${formatSignedOneDecimal(homeHomeForm.diffAvg || 0)}`))}
            ${buildStatRow(escapeHtml(awayB2B.detail), "B2B", escapeHtml(homeB2B.detail))}
            ${buildStatRow(escapeHtml(awayLeagueLabel), "Perfil actual", escapeHtml(homeLeagueLabel))}
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Error analizando partido", error);
    analysisPanel.innerHTML = "<p>No se pudo generar el anÃ¡lisis de este partido.</p>";
  }
}

loadNBAGames();
