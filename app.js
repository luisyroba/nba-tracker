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
      <div class="away ${awayClass}">${escapeHtml(awayValue)}</div>
      <div class="metric">${escapeHtml(label)}</div>
      <div class="home ${homeClass}">${escapeHtml(homeValue)}</div>
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
      const date = event.date
        ? new Date(event.date).toLocaleString("es-CL")
        : "Sin fecha";
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
            <strong class="team-score">${escapeHtml(awayScore)}</strong>
          </div>

          <div class="team-row">
            <span class="team-name">${escapeHtml(homeName)}</span>
            <strong class="team-score">${escapeHtml(homeScore)}</strong>
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

    const gameDate = comp?.date
      ? new Date(comp.date).toLocaleString("es-CL")
      : "Pendiente";

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

    const awayEntry = findTeamEntry(awayAbbr, awayName);
    const homeEntry = findTeamEntry(homeAbbr, homeName);

    const awayStats = {
      conference: awayEntry?.conference || "Pendiente",
      position: awayEntry?.conferencePosition || "-",
      record: getStatValue(awayEntry, ["overall", "wins"]),
      last10: getStatValue(awayEntry, ["lastTen", "last_ten"]),
      streak: getStatValue(awayEntry, ["streak", "strk"]),
      ppg: getStatValue(awayEntry, ["pointsFor", "avgPointsFor", "ppg"]),
      oppPpg: getStatValue(awayEntry, ["pointsAgainst", "avgPointsAgainst", "oppPoints", "oppPpg"]),
      diff: getStatValue(awayEntry, ["pointDifferential", "differential", "diff"])
    };

    const homeStats = {
      conference: homeEntry?.conference || "Pendiente",
      position: homeEntry?.conferencePosition || "-",
      record: getStatValue(homeEntry, ["overall", "wins"]),
      last10: getStatValue(homeEntry, ["lastTen", "last_ten"]),
      streak: getStatValue(homeEntry, ["streak", "strk"]),
      ppg: getStatValue(homeEntry, ["pointsFor", "avgPointsFor", "ppg"]),
      oppPpg: getStatValue(homeEntry, ["pointsAgainst", "avgPointsAgainst", "oppPoints", "oppPpg"]),
      diff: getStatValue(homeEntry, ["pointDifferential", "differential", "diff"])
    };

    const awayRecordParsed = parseRecord(awayStats.record);
    const homeRecordParsed = parseRecord(homeStats.record);
    const awayLast10Parsed = parseLast10(awayStats.last10);
    const homeLast10Parsed = parseLast10(homeStats.last10);
    const awayStreakParsed = parseStreak(awayStats.streak);
    const homeStreakParsed = parseStreak(homeStats.streak);
    const awayPpgNum = toNumber(awayStats.ppg);
    const homePpgNum = toNumber(homeStats.ppg);
    const awayOppPpgNum = toNumber(awayStats.oppPpg);
    const homeOppPpgNum = toNumber(homeStats.oppPpg);
    const awayDiffNum = toNumber(awayStats.diff);
    const homeDiffNum = toNumber(homeStats.diff);

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

    if (awayPpgNum !== null && homePpgNum !== null) {
      if (awayPpgNum > homePpgNum) awayEdge++;
      if (homePpgNum > awayPpgNum) homeEdge++;
    }

    if (awayOppPpgNum !== null && homeOppPpgNum !== null) {
      if (awayOppPpgNum < homeOppPpgNum) awayEdge++;
      if (homeOppPpgNum < awayOppPpgNum) homeEdge++;
    }

    if (awayDiffNum !== null && homeDiffNum !== null) {
      if (awayDiffNum > homeDiffNum) awayEdge++;
      if (homeDiffNum > awayDiffNum) homeEdge++;
    }

    let edgeText = "Matchup equilibrado";
    if (awayEdge > homeEdge) edgeText = `Ventaja ${awayName}`;
    if (homeEdge > awayEdge) edgeText = `Ventaja ${homeName}`;

    let autoNote = "Comparación base sin señal fuerte; conviene revisar mercado, descanso y bajas.";
    if (awayEdge >= 4) {
      autoNote = `${awayName} domina varias métricas base del matchup y llega mejor posicionado en esta lectura pregame.`;
    } else if (homeEdge >= 4) {
      autoNote = `${homeName} domina varias métricas base del matchup y llega mejor posicionado en esta lectura pregame.`;
    } else if (awayEdge > homeEdge) {
      autoNote = `${awayName} muestra ligera ventaja estadística, pero no necesariamente una señal suficiente por sí sola.`;
    } else if (homeEdge > awayEdge) {
      autoNote = `${homeName} muestra ligera ventaja estadística, pero no necesariamente una señal suficiente por sí sola.`;
    }

    const conferenceCompare = compareNumbersLowerBetter(
      toNumber(awayStats.position),
      toNumber(homeStats.position)
    );
    const recordCompare = compareNumbersHigherBetter(
      awayRecordParsed?.pct ?? null,
      homeRecordParsed?.pct ?? null
    );
    const last10Compare = compareNumbersHigherBetter(
      awayLast10Parsed?.wins ?? null,
      homeLast10Parsed?.wins ?? null
    );
    const streakCompare = compareNumbersHigherBetter(
      awayStreakParsed,
      homeStreakParsed
    );
    const ppgCompare = compareNumbersHigherBetter(awayPpgNum, homePpgNum);
    const oppCompare = compareNumbersLowerBetter(awayOppPpgNum, homeOppPpgNum);
    const diffCompare = compareNumbersHigherBetter(awayDiffNum, homeDiffNum);

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
            awayStats.conference,
            "Conferencia",
            homeStats.conference
          )}

          ${buildStatRow(
            `${awayStats.record} · ${awayStats.position}º`,
            "Récord / Posición",
            `${homeStats.record} · ${homeStats.position}º`,
            recordCompare.away || conferenceCompare.away,
            recordCompare.home || conferenceCompare.home
          )}

          ${buildStatRow(
            awayStats.last10,
            "Últimos 10",
            homeStats.last10,
            last10Compare.away,
            last10Compare.home
          )}

          ${buildStatRow(
            awayStats.streak,
            "Racha",
            homeStats.streak,
            streakCompare.away,
            streakCompare.home
          )}

          ${buildStatRow(
            awayStats.ppg,
            "PPG",
            homeStats.ppg,
            ppgCompare.away,
            ppgCompare.home
          )}

          ${buildStatRow(
            awayStats.oppPpg,
            "OPP PPG",
            homeStats.oppPpg,
            oppCompare.away,
            oppCompare.home
          )}

          ${buildStatRow(
            awayStats.diff,
            "Diferencial",
            homeStats.diff,
            diffCompare.away,
            diffCompare.home
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
