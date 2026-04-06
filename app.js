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
const BOOKMAKER_PRIORITY = [
  "betano",
  "novibet",
  "bet365",
  "bet365_uk"
];

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
  if (value > 0) return `+${value.toFixed(1)}`;
  return value.toFixed(1);
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

function buildSingleColumnRow(label, value) {
  return `
    <div class="pregame-single-row">
      <div class="metric">${escapeHtml(label)}</div>
      <div class="single-value">${value}</div>
    </div>
  `;
}

function getTeamIdFromCompetitor(competitor) {
  return competitor?.team?.id || competitor?.id || null;
}

function normalizeGamesFromSchedule(data) {
  if (Array.isArray(data?.events)) return data.events;
  return [];
}

function getOpponentStrengthLabel(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "Pendiente";
  if (pct >= 0.60) return "Rivales fuertes";
  if (pct >= 0.45) return "Rivales medios";
  return "Rivales débiles";
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
          title="${escapeHtml(`${game.won ? "Ganó" : "Perdió"} vs ${game.opponentName} (${game.teamScore}-${game.opponentScore})`)}"
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
    if (previousGame.homeAway === "home") {
      return { isB2B: true, label: "Sí", detail: "B2B en casa" };
    }
    if (previousGame.homeAway === "away") {
      return { isB2B: true, label: "Sí", detail: "B2B con viaje" };
    }
    return { isB2B: true, label: "Sí", detail: "B2B" };
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

      const noteText =
        typeof entry?.note === "string"
          ? entry.note
          : JSON.stringify(entry?.note || "");

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
    .replace(/[\u0300-\u036f]/g, "")
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
    if (Array.isArray(category?.stats)) {
      raw.push(...category.stats);
    }
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
    if (exactMatch) {
      return stat?.displayValue ?? stat?.value ?? null;
    }
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

    if (partialMatch) {
      return stat?.displayValue ?? stat?.value ?? null;
    }
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
      [
        "pointspergame",
        "points per game",
        "avgpoints",
        "avg points",
        "ppg"
      ],
      [
        "points per game",
        "avg points",
        "ppg"
      ]
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
  return {
    header: {
      competitions: event?.competitions || []
    }
  };
}

function createEmptyStandingsLookup() {
  return { entries: [], byTeamId: {}, byAbbr: {}, byName: {} };
}

function normalizeString(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function impliedProbabilityFromDecimal(decimalOdds) {
  const odds = Number(decimalOdds);
  if (!odds || Number.isNaN(odds) || odds <= 1) return null;
  return 1 / odds;
}

function getStakeLabelByStrength(strength) {
  if (strength === "Fuerte") return "10% del bank";
  if (strength === "Medio") return "7% del bank";
  if (strength === "Leve") return "5% del bank";
  return "0%";
}

function getBookmakerPriorityIndex(key) {
  const idx = BOOKMAKER_PRIORITY.indexOf(String(key || "").toLowerCase());
  return idx === -1 ? 999 : idx;
}

function findOutcomeByTeamName(outcomes, teamName) {
  const target = normalizeString(teamName);
  return (outcomes || []).find(outcome => normalizeString(outcome?.name) === target) || null;
}

function buildOddsApiEventMatchScore(oddsEvent, homeName, awayName) {
  const oddsHome = normalizeString(oddsEvent?.home_team);
  const oddsAway = normalizeString(oddsEvent?.away_team);
  const targetHome = normalizeString(homeName);
  const targetAway = normalizeString(awayName);

  let score = 0;
  if (oddsHome === targetHome) score += 2;
  if (oddsAway === targetAway) score += 2;
  if (normalizeString(oddsEvent?.sport_key) === ODDS_API_SPORT) score += 1;

  return score;
}

function findMatchingOddsEvent(oddsEvents, homeName, awayName, commenceTime = null) {
  if (!Array.isArray(oddsEvents) || !oddsEvents.length) return null;

  const scored = oddsEvents
    .map(event => ({
      event,
      score: buildOddsApiEventMatchScore(event, homeName, awayName)
    }))
    .filter(item => item.score >= 4)
    .sort((a, b) => b.score - a.score);

  if (scored.length) return scored[0].event;

  if (!commenceTime) return null;
  const targetTs = new Date(commenceTime).getTime();

  const nearTime = oddsEvents
    .map(event => ({
      event,
      diff: Math.abs(new Date(event?.commence_time || 0).getTime() - targetTs)
    }))
    .sort((a, b) => a.diff - b.diff);

  return nearTime[0]?.event || null;
}

async function fetchOddsApiEvents() {
  const url = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/odds?apiKey=${encodeURIComponent(ODDS_API_KEY)}&regions=${encodeURIComponent(ODDS_API_REGIONS)}&markets=${encodeURIComponent(ODDS_API_MARKETS)}&oddsFormat=decimal&dateFormat=iso`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Odds API HTTP ${res.status}`);
  }

  return res.json();
}

function normalizeBookmakers(bookmakers) {
  return (bookmakers || []).map(bookmaker => ({
    ...bookmaker,
    key: String(bookmaker?.key || "").toLowerCase(),
    title: bookmaker?.title || bookmaker?.key || "Casa"
  }));
}

function selectPreferredBookmakers(bookmakers) {
  const normalized = normalizeBookmakers(bookmakers);

  return [...normalized].sort((a, b) => {
    const priorityDiff = getBookmakerPriorityIndex(a.key) - getBookmakerPriorityIndex(b.key);
    if (priorityDiff !== 0) return priorityDiff;
    return String(a.title).localeCompare(String(b.title));
  });
}

function buildMoneylineCandidate(bookmaker, homeName, awayName, awayLean, homeLean) {
  const market = bookmaker?.markets?.find(m => m?.key === "h2h");
  if (!market?.outcomes?.length) return null;

  if (awayLean > homeLean) {
    const awayOutcome = findOutcomeByTeamName(market.outcomes, awayName);
    const price = Number(awayOutcome?.price);
    if (!awayOutcome || !price || price < 1.5) return null;

    return {
      type: "moneyline",
      marketKey: "h2h",
      bookmakerKey: bookmaker.key,
      bookmakerTitle: bookmaker.title,
      line: null,
      side: awayName,
      label: `${awayName} gana`,
      odds: price,
      impliedProbability: impliedProbabilityFromDecimal(price)
    };
  }

  if (homeLean > awayLean) {
    const homeOutcome = findOutcomeByTeamName(market.outcomes, homeName);
    const price = Number(homeOutcome?.price);
    if (!homeOutcome || !price || price < 1.5) return null;

    return {
      type: "moneyline",
      marketKey: "h2h",
      bookmakerKey: bookmaker.key,
      bookmakerTitle: bookmaker.title,
      line: null,
      side: homeName,
      label: `${homeName} gana`,
      odds: price,
      impliedProbability: impliedProbabilityFromDecimal(price)
    };
  }

  return null;
}

function buildSpreadCandidates(bookmaker, homeName, awayName, awayLean, homeLean) {
  const market = bookmaker?.markets?.find(m => m?.key === "spreads");
  if (!market?.outcomes?.length) return [];

  const candidates = [];

  if (awayLean > homeLean) {
    const awayOutcome = findOutcomeByTeamName(market.outcomes, awayName);
    const price = Number(awayOutcome?.price);
    const point = Number(awayOutcome?.point);
    if (awayOutcome && !Number.isNaN(point) && price >= 1.5) {
      candidates.push({
        type: "spread",
        marketKey: "spreads",
        bookmakerKey: bookmaker.key,
        bookmakerTitle: bookmaker.title,
        line: point,
        side: awayName,
        label: `${awayName} ${point > 0 ? `+${point}` : point}`,
        odds: price,
        impliedProbability: impliedProbabilityFromDecimal(price)
      });
    }
  }

  if (homeLean > awayLean) {
    const homeOutcome = findOutcomeByTeamName(market.outcomes, homeName);
    const price = Number(homeOutcome?.price);
    const point = Number(homeOutcome?.point);
    if (homeOutcome && !Number.isNaN(point) && price >= 1.5) {
      candidates.push({
        type: "spread",
        marketKey: "spreads",
        bookmakerKey: bookmaker.key,
        bookmakerTitle: bookmaker.title,
        line: point,
        side: homeName,
        label: `${homeName} ${point > 0 ? `+${point}` : point}`,
        odds: price,
        impliedProbability: impliedProbabilityFromDecimal(price)
      });
    }
  }

  return candidates;
}

function buildTotalCandidates(bookmaker, projectedTotal, projectedDiff, homeName, awayName) {
  const market = bookmaker?.markets?.find(m => m?.key === "totals");
  if (!market?.outcomes?.length) return [];

  const outcomes = market.outcomes;
  const over = outcomes.find(outcome => normalizeString(outcome?.name) === "over");
  const under = outcomes.find(outcome => normalizeString(outcome?.name) === "under");
  if (!over || !under) return [];

  const candidates = [];

  const overPoint = Number(over?.point);
  const underPoint = Number(under?.point);
  const overPrice = Number(over?.price);
  const underPrice = Number(under?.price);

  if (!Number.isNaN(overPoint) && overPrice >= 1.5 && projectedTotal !== null && projectedTotal >= overPoint + 4) {
    candidates.push({
      type: "total",
      marketKey: "totals",
      bookmakerKey: bookmaker.key,
      bookmakerTitle: bookmaker.title,
      line: overPoint,
      side: "Over",
      label: `Más de ${overPoint}`,
      odds: overPrice,
      impliedProbability: impliedProbabilityFromDecimal(overPrice)
    });
  }

  if (!Number.isNaN(underPoint) && underPrice >= 1.5 && projectedTotal !== null && projectedTotal <= underPoint - 4) {
    candidates.push({
      type: "total",
      marketKey: "totals",
      bookmakerKey: bookmaker.key,
      bookmakerTitle: bookmaker.title,
      line: underPoint,
      side: "Under",
      label: `Menos de ${underPoint}`,
      odds: underPrice,
      impliedProbability: impliedProbabilityFromDecimal(underPrice)
    });
  }

  if (Math.abs(projectedDiff) < 2 && projectedTotal !== null) {
    return candidates;
  }

  return candidates;
}

function scoreCandidate(candidate, modelEdgeAbs, sourcePriorityIndex) {
  let score = 0;

  if (candidate.type === "moneyline") score += 24;
  if (candidate.type === "spread") score += 18;
  if (candidate.type === "total") score += 16;

  score += Math.min(modelEdgeAbs * 2, 18);

  if (candidate.odds >= 1.5 && candidate.odds < 1.7) score += 3;
  if (candidate.odds >= 1.7 && candidate.odds <= 2.15) score += 5;
  if (candidate.odds > 2.15) score += 2;

  score -= Math.min(sourcePriorityIndex, 20);

  return score;
}

function chooseBestBetCandidate(candidates, modelEdgeAbs) {
  if (!candidates.length) return null;

  const scored = candidates
    .map(candidate => ({
      ...candidate,
      score: scoreCandidate(candidate, modelEdgeAbs, getBookmakerPriorityIndex(candidate.bookmakerKey))
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (getBookmakerPriorityIndex(a.bookmakerKey) !== getBookmakerPriorityIndex(b.bookmakerKey)) {
        return getBookmakerPriorityIndex(a.bookmakerKey) - getBookmakerPriorityIndex(b.bookmakerKey);
      }
      return b.odds - a.odds;
    });

  return scored[0];
}

function classifyBetStrength(edgeGap, candidateOdds, candidateType) {
  if (edgeGap >= 5 && candidateOdds >= 1.5) {
    return { level: "Fuerte", stake: "10% del bank" };
  }

  if (edgeGap >= 3 && candidateOdds >= 1.5) {
    return { level: "Medio", stake: "7% del bank" };
  }

  if (edgeGap >= 2 && candidateOdds >= 1.5) {
    return { level: "Leve", stake: "5% del bank" };
  }

  return { level: "No bet", stake: "0%" };
}

function buildFallbackNoBet(reason) {
  return {
    selection: null,
    strength: { level: "No bet", stake: "0%" },
    reason
  };
}

function getBookmakerDisplayName(key, title) {
  const normalized = String(key || "").toLowerCase();
  if (normalized === "bet365_uk") return "bet365";
  return title || key || "Casa";
}

function renderBetRecommendationBlock(recommendation) {
  if (!recommendation?.selection) {
    return `
      <div class="betting-notes">
        <h4>No bet</h4>
        <p>${escapeHtml(recommendation?.reason || "No se encontró una cuota válida con el filtro actual.")}</p>
      </div>
    `;
  }

  const selection = recommendation.selection;
  const strength = recommendation.strength || { level: "No bet", stake: "0%" };

  return `
    <div class="betting-notes">
      <h4>Pick recomendado: ${escapeHtml(selection.label)}</h4>
      <p>Mercado: ${escapeHtml(selection.type.toUpperCase())} · Casa: ${escapeHtml(getBookmakerDisplayName(selection.bookmakerKey, selection.bookmakerTitle))}</p>
      <p>Cuota: <strong>${escapeHtml(formatOddsDecimal(selection.odds))}</strong> · Prob. implícita: ${escapeHtml(formatPercent(selection.impliedProbability))}</p>
      <p>Fuerza: ${escapeHtml(strength.level)} · Stake: ${escapeHtml(strength.stake)}</p>
      <p style="margin-top:10px;">${escapeHtml(recommendation.reason || "")}</p>
    </div>
  `;
}

function buildRecommendationReason(selection, awayName, homeName, awayEdge, homeEdge) {
  const edgeGap = Math.abs(awayEdge - homeEdge);

  if (!selection) {
    return "La ventaja estadística no encontró una cuota mínima de 1.50 que valga la pena jugar.";
  }

  if (selection.type === "moneyline") {
    return `${selection.side} es el lado con mejor respaldo estadístico y la cuota todavía entra en el rango jugable. Diferencial del modelo: ${edgeGap} puntos de ventaja.`;
  }

  if (selection.type === "spread") {
    return `El lado favorito por el modelo no paga suficiente en ML o rinde mejor en línea. Se propone spread para capturar valor sin salir del sesgo estadístico principal.`;
  }

  if (selection.type === "total") {
    return `El cruce deja una lectura más clara en ritmo y producción esperada que en ganador directo, por eso el valor aparece en el total.`;
  }

  return "Recomendación generada con base en señal estadística y validación de cuota.";
}

function buildOddsRecommendation({
  oddsEvent,
  homeName,
  awayName,
  awayEdge,
  homeEdge,
  projectedAwayScore,
  projectedHomeScore
}) {
  if (!oddsEvent?.bookmakers?.length) {
    return buildFallbackNoBet("No se encontraron cuotas disponibles para este partido en The Odds API.");
  }

  const sortedBookmakers = selectPreferredBookmakers(oddsEvent.bookmakers);
  const projectedTotal =
    projectedAwayScore !== null && projectedHomeScore !== null
      ? projectedAwayScore + projectedHomeScore
      : null;

  const projectedDiff =
    projectedAwayScore !== null && projectedHomeScore !== null
      ? projectedAwayScore - projectedHomeScore
      : awayEdge - homeEdge;

  const candidates = [];

  for (const bookmaker of sortedBookmakers) {
    const moneylineCandidate = buildMoneylineCandidate(bookmaker, homeName, awayName, awayEdge, homeEdge);
    if (moneylineCandidate) candidates.push(moneylineCandidate);

    const spreadCandidates = buildSpreadCandidates(bookmaker, homeName, awayName, awayEdge, homeEdge);
    if (spreadCandidates.length) candidates.push(...spreadCandidates);

    const totalCandidates = buildTotalCandidates(bookmaker, projectedTotal, projectedDiff, homeName, awayName);
    if (totalCandidates.length) candidates.push(...totalCandidates);
  }

  const bestSelection = chooseBestBetCandidate(candidates, Math.abs(awayEdge - homeEdge));

  if (!bestSelection) {
    return buildFallbackNoBet("No apareció una cuota válida de 1.50 o más en Betano, Novibet, bet365 ni en el resto de casas disponibles.");
  }

  const strength = classifyBetStrength(Math.abs(awayEdge - homeEdge), bestSelection.odds, bestSelection.type);
  if (strength.level === "No bet") {
    return buildFallbackNoBet("La ventaja estadística existe, pero no alcanza para recomendar apuesta con el filtro actual.");
  }

  return {
    selection: bestSelection,
    strength,
    reason: buildRecommendationReason(bestSelection, awayName, homeName, awayEdge, homeEdge)
  };
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
    scoreboardCache = events;

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

      const homeScoreRaw = home?.score ?? "-";
      const awayScoreRaw = away?.score ?? "-";

      const homeScore =
        typeof homeScoreRaw === "object"
          ? homeScoreRaw?.displayValue ?? "-"
          : homeScoreRaw;

      const awayScore =
        typeof awayScoreRaw === "object"
          ? awayScoreRaw?.displayValue ?? "-"
          : awayScoreRaw;

      const rawStatus = event.status?.type?.description || "Sin estado";
      const gameStatus = formatStatusText(rawStatus);
      const period = event.status?.period || null;
      const clock = event.status?.displayClock || "";
      const statusState = event.status?.type?.state || "";

      const isFinal = statusState === "post" || gameStatus === "Finalizado";
      const isLive = statusState === "in" || gameStatus === "En progreso";
      const isScheduled = !isFinal && !isLive;

      let badgeText = "Programado";
      if (isFinal) {
        badgeText = "Finalizado";
      } else if (isLive) {
        badgeText = `En progreso · Q${period || "-"} · ${clock || ""}`.trim();
      } else {
        badgeText = `Programado · ${formatGameTime(event.date)}`;
      }

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

        <div class="live-extra ${isFinal ? "is-final" : isScheduled ? "is-scheduled" : ""}">
          ${escapeHtml(badgeText)}
        </div>

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
    const summaryResult = await fetchGameSummary(gameId);
    const scoreboardEvent = findGameInScoreboardCache(gameId);
    const summaryData = summaryResult || buildFallbackSummaryFromScoreboardEvent(scoreboardEvent);

    const competitors = getCompetitorsFromEventLike(summaryData);
    if (!competitors.length) {
      analysisPanel.innerHTML = "<p>No se pudo abrir el pregame de este partido.</p>";
      return;
    }

    const comp =
      summaryData?.header?.competitions?.[0] ||
      scoreboardEvent?.competitions?.[0] ||
      {};

    const home = competitors.find(team => team.homeAway === "home");
    const away = competitors.find(team => team.homeAway === "away");

    if (!home || !away) {
      analysisPanel.innerHTML = "<p>No se pudo identificar local y visitante en este partido.</p>";
      return;
    }

    const homeName = home?.team?.displayName || "Local";
    const awayName = away?.team?.displayName || "Visitante";
    const homeAbbr = home?.team?.abbreviation || "";
    const awayAbbr = away?.team?.abbreviation || "";
    const homeTeamId = getTeamIdFromCompetitor(home);
    const awayTeamId = getTeamIdFromCompetitor(away);

    const gameDate = comp?.date
      ? new Date(comp.date).toLocaleString("es-CL")
      : "Pendiente";

    const [
      standingsRes,
      awayScheduleRes,
      homeScheduleRes,
      oddsRes
    ] = await Promise.allSettled([
      fetchConferenceStandingsSorted(),
      fetchTeamSchedule(awayTeamId),
      fetchTeamSchedule(homeTeamId),
      fetchOddsApiEvents()
    ]);

    const standingsData =
      standingsRes.status === "fulfilled" ? standingsRes.value : null;

    const standingsLookup = standingsData
      ? buildStandingsLookup(standingsData)
      : createEmptyStandingsLookup();

    let leagueProfilesMap = {};
    try {
      leagueProfilesMap = standingsData ? await getLeagueProfilesMap(standingsData) : {};
    } catch (error) {
      console.warn("League profiles failed:", error);
      leagueProfilesMap = {};
    }

    const awaySchedule =
      awayScheduleRes.status === "fulfilled" ? awayScheduleRes.value : null;

    const homeSchedule =
      homeScheduleRes.status === "fulfilled" ? homeScheduleRes.value : null;

    const awayEntry =
      standingsLookup.byTeamId[String(awayTeamId)] ||
      standingsLookup.byAbbr[awayAbbr] ||
      standingsLookup.byName[awayName] ||
      null;

    const homeEntry =
      standingsLookup.byTeamId[String(homeTeamId)] ||
      standingsLookup.byAbbr[homeAbbr] ||
      standingsLookup.byName[homeName] ||
      null;

    const awayRecent5 = getRecentFormFromSchedule(awaySchedule, awayTeamId, comp?.date, 5, standingsLookup);
    const homeRecent5 = getRecentFormFromSchedule(homeSchedule, homeTeamId, comp?.date, 5, standingsLookup);

    const awayVenueSplit = getVenueSplitForm(awaySchedule, awayTeamId, comp?.date, "away", 5);
    const homeVenueSplit = getVenueSplitForm(homeSchedule, homeTeamId, comp?.date, "home", 5);

    const awayB2B = getB2BStatus(awaySchedule, awayTeamId, comp?.date);
    const homeB2B = getB2BStatus(homeSchedule, homeTeamId, comp?.date);

    const awayContext = getContextFromConferencePosition(
      awayEntry?.conferencePosition,
      awayEntry?.clincher || null
    );

    const homeContext = getContextFromConferencePosition(
      homeEntry?.conferencePosition,
      homeEntry?.clincher || null
    );

    const awayProfileRanked = leagueProfilesMap[String(awayTeamId)] || {
      offenseRank: null,
      defenseRank: null,
      label: "Ataque medio | Defensa media"
    };

    const homeProfileRanked = leagueProfilesMap[String(homeTeamId)] || {
      offenseRank: null,
      defenseRank: null,
      label: "Ataque medio | Defensa media"
    };

    const awayStats = {
      conference: awayEntry?.conference || "Pendiente",
      position: awayEntry?.conferencePosition || "-",
      context: awayContext,
      record: awayEntry?.record || "Pendiente",
      recentFormHtml: renderFormChips(awayRecent5.games),
      pointsScoredRecent: formatOneDecimal(awayRecent5.scoredAvg),
      pointsAllowedRecent: formatOneDecimal(awayRecent5.allowedAvg),
      adjustedDiffRecent: formatSignedOneDecimal(awayRecent5.adjustedDiffAvg),
      rivalQuality: getOpponentStrengthLabel(awayRecent5.opponentPctAvg),
      venueSplit: `Fuera: ${awayVenueSplit.record}, margen ${formatSignedOneDecimal(awayVenueSplit.diffAvg)}`,
      teamStyle: awayProfileRanked.label,
      b2b: `${awayB2B.label} · ${awayB2B.detail}`
    };

    const homeStats = {
      conference: homeEntry?.conference || "Pendiente",
      position: homeEntry?.conferencePosition || "-",
      context: homeContext,
      record: homeEntry?.record || "Pendiente",
      recentFormHtml: renderFormChips(homeRecent5.games),
      pointsScoredRecent: formatOneDecimal(homeRecent5.scoredAvg),
      pointsAllowedRecent: formatOneDecimal(homeRecent5.allowedAvg),
      adjustedDiffRecent: formatSignedOneDecimal(homeRecent5.adjustedDiffAvg),
      rivalQuality: getOpponentStrengthLabel(homeRecent5.opponentPctAvg),
      venueSplit: `Casa: ${homeVenueSplit.record}, margen ${formatSignedOneDecimal(homeVenueSplit.diffAvg)}`,
      teamStyle: homeProfileRanked.label,
      b2b: `${homeB2B.label} · ${homeB2B.detail}`
    };

    const awayRecordParsed = parseRecord(awayStats.record);
    const homeRecordParsed = parseRecord(homeStats.record);

    const awayRecentScoredNum = toNumber(awayStats.pointsScoredRecent);
    const homeRecentScoredNum = toNumber(homeStats.pointsScoredRecent);

    const awayRecentAllowedNum = toNumber(awayStats.pointsAllowedRecent);
    const homeRecentAllowedNum = toNumber(homeStats.pointsAllowedRecent);

    const awayAdjustedDiffNum = toNumber(awayStats.adjustedDiffRecent);
    const homeAdjustedDiffNum = toNumber(homeStats.adjustedDiffRecent);

    const awayVenueDiffNum = awayVenueSplit.diffAvg;
    const homeVenueDiffNum = homeVenueSplit.diffAvg;

    let awayEdge = 0;
    let homeEdge = 0;

    if (awayRecordParsed && homeRecordParsed) {
      if (awayRecordParsed.pct > homeRecordParsed.pct) awayEdge += 2;
      if (homeRecordParsed.pct > awayRecordParsed.pct) homeEdge += 2;
    }

    if (awayEntry?.conferencePosition && homeEntry?.conferencePosition) {
      const awayPos = Number(awayEntry.conferencePosition);
      const homePos = Number(homeEntry.conferencePosition);
      if (!Number.isNaN(awayPos) && !Number.isNaN(homePos)) {
        if (awayPos < homePos) awayEdge += 1;
        if (homePos < awayPos) homeEdge += 1;
      }
    }

    if (awayAdjustedDiffNum !== null && homeAdjustedDiffNum !== null) {
      if (awayAdjustedDiffNum > homeAdjustedDiffNum) awayEdge += 2;
      if (homeAdjustedDiffNum > awayAdjustedDiffNum) homeEdge += 2;
    }

    if (awayRecentAllowedNum !== null && homeRecentAllowedNum !== null) {
      if (awayRecentAllowedNum < homeRecentAllowedNum) awayEdge += 1;
      if (homeRecentAllowedNum < awayRecentAllowedNum) homeEdge += 1;
    }

    if (awayRecentScoredNum !== null && homeRecentScoredNum !== null) {
      if (awayRecentScoredNum > homeRecentScoredNum) awayEdge += 1;
      if (homeRecentScoredNum > awayRecentScoredNum) homeEdge += 1;
    }

    if (awayVenueDiffNum !== null && homeVenueDiffNum !== null) {
      if (awayVenueDiffNum > homeVenueDiffNum) awayEdge += 1;
      if (homeVenueDiffNum > awayVenueDiffNum) homeEdge += 1;
    }

    if (awayB2B.isB2B && !homeB2B.isB2B) homeEdge += 1;
    if (homeB2B.isB2B && !awayB2B.isB2B) awayEdge += 1;

    let edgeText = "Matchup equilibrado";
    let leanText = "No bet";

    if (awayEdge >= homeEdge + 2) {
      edgeText = `Ventaja ${awayName}`;
      leanText = `Lean visitante: ${awayName}`;
    } else if (homeEdge >= awayEdge + 2) {
      edgeText = `Ventaja ${homeName}`;
      leanText = `Lean local: ${homeName}`;
    }

    const awayWeakScheduleRecent = awayRecent5.opponentPctAvg !== null && awayRecent5.opponentPctAvg < 0.45;
    const homeWeakScheduleRecent = homeRecent5.opponentPctAvg !== null && homeRecent5.opponentPctAvg < 0.45;
    const awayStrongScheduleRecent = awayRecent5.opponentPctAvg !== null && awayRecent5.opponentPctAvg >= 0.60;
    const homeStrongScheduleRecent = homeRecent5.opponentPctAvg !== null && homeRecent5.opponentPctAvg >= 0.60;

    let autoNote = "La comparación es competitiva y no deja una ventaja contundente.";
    if (awayEdge > homeEdge) {
      autoNote = `${awayName} llega mejor por perfil global, forma ajustada y rendimiento reciente como visitante.`;
      if (awayWeakScheduleRecent) {
        autoNote = `${awayName} llega mejor, pero parte de su forma reciente fue ante rivales más débiles.`;
      }
      if (homeStrongScheduleRecent && awayEdge - homeEdge <= 2) {
        autoNote = `${awayName} tiene números favorables, aunque ${homeName} enfrentó rivales más fuertes últimamente.`;
      }
    } else if (homeEdge > awayEdge) {
      autoNote = `${homeName} llega mejor por perfil global, forma ajustada y rendimiento reciente como local.`;
      if (homeWeakScheduleRecent) {
        autoNote = `${homeName} llega mejor, pero parte de su forma reciente fue ante rivales más débiles.`;
      }
      if (awayStrongScheduleRecent && homeEdge - awayEdge <= 2) {
        autoNote = `${homeName} tiene mejores señales globales, pero ${awayName} viene de enfrentar rivales más fuertes últimamente.`;
      }
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

    const adjustedDiffCompare = compareNumbersHigherBetter(
      awayAdjustedDiffNum,
      homeAdjustedDiffNum
    );

    const venueCompare = compareNumbersHigherBetter(
      awayVenueDiffNum,
      homeVenueDiffNum
    );

    const projectedAwayScore =
      awayRecentScoredNum !== null && homeRecentAllowedNum !== null
        ? (awayRecentScoredNum + homeRecentAllowedNum) / 2
        : awayRecentScoredNum;

    const projectedHomeScore =
      homeRecentScoredNum !== null && awayRecentAllowedNum !== null
        ? (homeRecentScoredNum + awayRecentAllowedNum) / 2
        : homeRecentScoredNum;

    const oddsEvents =
      oddsRes.status === "fulfilled" && Array.isArray(oddsRes.value)
        ? oddsRes.value
        : [];

    const matchingOddsEvent = findMatchingOddsEvent(oddsEvents, homeName, awayName, comp?.date);

    const betRecommendation = buildOddsRecommendation({
      oddsEvent: matchingOddsEvent,
      homeName,
      awayName,
      awayEdge,
      homeEdge,
      projectedAwayScore,
      projectedHomeScore
    });

    const projectedTotal =
      projectedAwayScore !== null && projectedHomeScore !== null
        ? projectedAwayScore + projectedHomeScore
        : null;

    const projectedMargin =
      projectedAwayScore !== null && projectedHomeScore !== null
        ? projectedAwayScore - projectedHomeScore
        : null;

    analysisPanel.innerHTML = `
      <div class="analysis-box">
        <div class="analysis-header">
          <h3>${escapeHtml(awayName)} vs ${escapeHtml(homeName)}</h3>
          <p class="analysis-subtitle">Análisis pregame NBA</p>
          <p class="analysis-date">${escapeHtml(gameDate)}</p>
        </div>

        ${renderBetRecommendationBlock(betRecommendation)}

        <div class="pregame-shell">
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
              escapeHtml(awayStats.context),
              "Contexto",
              escapeHtml(homeStats.context)
            )}

            ${buildStatRow(
              awayStats.recentFormHtml,
              "Últimos 5",
              homeStats.recentFormHtml
            )}

            ${buildStatRow(
              escapeHtml(awayStats.rivalQuality),
              "Calidad rival",
              escapeHtml(homeStats.rivalQuality)
            )}

            ${buildStatRow(
              escapeHtml(awayStats.venueSplit),
              "Forma fuera/casa",
              escapeHtml(homeStats.venueSplit),
              venueCompare.away,
              venueCompare.home
            )}

            ${buildStatRow(
              escapeHtml(awayStats.teamStyle),
              "Perfil actual",
              escapeHtml(homeStats.teamStyle)
            )}

            ${buildStatRow(
              escapeHtml(awayStats.pointsScoredRecent),
              "Puntos anotados",
              escapeHtml(homeStats.pointsScoredRecent),
              recentScoredCompare.away,
              recentScoredCompare.home
            )}

            ${buildStatRow(
              escapeHtml(awayStats.pointsAllowedRecent),
              "Puntos recibidos",
              escapeHtml(homeStats.pointsAllowedRecent),
              recentAllowedCompare.away,
              recentAllowedCompare.home
            )}

            ${buildStatRow(
              escapeHtml(awayStats.adjustedDiffRecent),
              "Margen ajustado",
              escapeHtml(homeStats.adjustedDiffRecent),
              adjustedDiffCompare.away,
              adjustedDiffCompare.home
            )}

            ${buildStatRow(
              escapeHtml(awayStats.b2b),
              "B2B",
              escapeHtml(homeStats.b2b)
            )}
          </div>

          <div class="pregame-summary">
            ${buildSingleColumnRow("Lectura del matchup", escapeHtml(edgeText))}
            ${buildSingleColumnRow("Lean estadístico", escapeHtml(leanText))}
            ${buildSingleColumnRow("Nota automática", escapeHtml(autoNote))}
            ${buildSingleColumnRow("Proyección visitante", escapeHtml(formatOneDecimal(projectedAwayScore)))}
            ${buildSingleColumnRow("Proyección local", escapeHtml(formatOneDecimal(projectedHomeScore)))}
            ${buildSingleColumnRow("Total proyectado", escapeHtml(formatOneDecimal(projectedTotal)))}
            ${buildSingleColumnRow("Margen proyectado", escapeHtml(formatSignedOneDecimal(projectedMargin)))}
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Pregame error:", error);
    analysisPanel.innerHTML = "<p>No se pudo cargar el análisis pregame.</p>";
  }
}

if (gamesContainer) {
  gamesContainer.addEventListener("click", event => {
    const button = event.target.closest(".analyze-btn");
    if (!button) return;
    const gameId = button.dataset.gameId;
    if (!gameId) return;
    analyzeGame(gameId);
  });
}

if (modalCloseBtn) {
  modalCloseBtn.addEventListener("click", closeModal);
}

if (modalCloseBg) {
  modalCloseBg.addEventListener("click", closeModal);
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeModal();
  }
});

loadNBAGames();
