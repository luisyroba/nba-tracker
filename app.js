/* NBA Pregame Scout · app.js — v5
   Fixes:
   1. Estadísticas reales de últimos partidos (pts anotados/recibidos)
   2. Pick recomendado con cuota real desde The Odds API
   3. UI panel pregame en cuadros ordenados, logos correctos
*/

const statusEl       = document.getElementById('status');
const gamesContainer = document.getElementById('games');
const analysisPanel  = document.getElementById('analysis-panel');
const modal          = document.getElementById('game-modal');
const modalCloseBtn  = document.getElementById('modal-close');
const modalCloseBg   = document.getElementById('modal-close-bg');
const modalTeamsHdr  = document.getElementById('modal-teams-header');

/* ── CONFIG ── */
const ODDS_API_KEY       = '987635aba320e6bdebcf265db26707ae';
/* Ampliamos bookmakers para no quedarnos sin cuotas */
const BOOKMAKER_PRIORITY = ['bet365','betsson','stake','draftkings','fanduel','williamhill','pinnacle','bovada','mybookieag','betonlineag','betus','lowvig'];

let oddsCache = null, oddsCacheTime = 0, scoreboardCache = [];

/* ── Modal open/close ── */
function openModal()  { modal?.classList.remove('hidden'); modal?.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
function closeModal() { modal?.classList.add('hidden');    modal?.setAttribute('aria-hidden','true');  document.body.style.overflow=''; }
modalCloseBtn?.addEventListener('click', closeModal);
modalCloseBg?.addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });

/* ── Utils ── */
function escapeHtml(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function toNumber(v){ if(v===null||v===undefined) return null; if(typeof v==='number') return Number.isNaN(v)?null:v; const n=Number(String(v).replace(/[^\d.-]/g,'')); return Number.isNaN(n)?null:n; }
function parseRecord(t){ if(!t||typeof t!=='string') return null; const p=t.split('-'); if(p.length<2) return null; const w=Number(p[0]),l=Number(p[1]); return (Number.isNaN(w)||Number.isNaN(l))?null:{wins:w,losses:l,pct:w/(w+l)}; }
function average(arr){ const f=arr.filter(v=>v!==null&&v!==undefined&&!Number.isNaN(v)); if(!f.length) return null; return f.reduce((s,v)=>s+v,0)/f.length; }
function fmt1(v){ if(v===null||v===undefined||Number.isNaN(v)) return '—'; return Number(v).toFixed(1); }
function fmtPct(v){ if(v===null||v===undefined||Number.isNaN(v)) return '—'; return `${(Number(v)*100).toFixed(1)}%`; }
function fmtOdds(v){ if(v===null||v===undefined||Number.isNaN(v)) return '—'; return Number(v).toFixed(2); }
function normTeam(n){ return String(n||'').toLowerCase().replace(/\s+/g,' ').trim(); }
function compareHigher(a,b){ if(a===null||b===null) return {away:'',home:''}; if(Number(a)>Number(b)) return {away:'edge',home:''}; if(Number(b)>Number(a)) return {away:'',home:'edge'}; return {away:'',home:''}; }
function compareLower(a,b){ if(a===null||b===null) return {away:'',home:''}; if(Number(a)<Number(b)) return {away:'edge',home:''}; if(Number(b)<Number(a)) return {away:'',home:'edge'}; return {away:'',home:''}; }
function impliedProb(v){ return (!v||v<=1)?null:1/v; }
function espnLogo(abbr){ return abbr?`https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png`:''; }
function formatGameTime(d){ try{ return new Date(d).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}); }catch{ return ''; } }
function formatStatusText(s){ const m={'Final':'Finalizado','In Progress':'En progreso','Scheduled':'Programado','Halftime':'Medio tiempo'}; return m[s]||s||'Sin estado'; }
function getConferenceLabel(n){ if(!n) return 'NBA'; const l=n.toLowerCase(); return l.includes('east')?'Este':l.includes('west')?'Oeste':n; }
function getContextLabel(pos,clincher){
  if(clincher==='e') return {label:'Eliminado',cls:'out'};
  if(clincher==='x') return {label:'Clasificado',cls:'playoffs'};
  if(clincher==='y') return {label:'Líder División',cls:'playoffs'};
  if(clincher==='z') return {label:'Mejor Récord',cls:'playoffs'};
  if(!pos) return {label:'—',cls:'neutral'};
  const p=Number(pos);
  if(p<=6) return {label:`#${p} Playoffs`,cls:'playoffs'};
  if(p<=10) return {label:`#${p} Play-In`,cls:'playin'};
  return {label:`#${p} Fuera`,cls:'out'};
}
function rivalStrengthLabel(pct){ if(pct===null) return '—'; if(pct>=0.60) return 'Rivales fuertes'; if(pct>=0.50) return 'Rivales medios'; if(pct>=0.40) return 'Rivales mixtos'; return 'Rivales débiles'; }

/* ── Fetch helpers ── */
async function fetchJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function fetchStandings(){ return fetchJSON('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2025&seasontype=2&type=0&level=3'); }
async function fetchTeamSchedule(tid){ return tid?fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${tid}/schedule?season=2025`):null; }
async function fetchGameSummary(gid){ return fetchJSON(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gid}`); }
async function fetchInjuries(){ return fetchJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries'); }
async function fetchTeamRoster(tid){ return tid?fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${tid}/roster`):null; }

/* ── Standings lookup ── */
function buildStandingsLookup(data){
  const lk={byId:{},byAbbr:{},byName:{}};
  if(!data?.children) return lk;
  for(const conf of data.children){
    const confName=getConferenceLabel(conf?.name||'');
    for(const div of (conf.children||[])){
      for(const entry of (div.standings?.entries||[])){
        const team=entry.team||{};
        const tid=String(team.id||''), abbr=(team.abbreviation||'').toLowerCase(), name=team.displayName||'';
        const record=entry.stats?.find(s=>s.name==='overall')?.displayValue||'—';
        const pos=entry.stats?.find(s=>s.name==='playoffSeed')?.value??null;
        const clincher=entry.stats?.find(s=>s.name==='clincher')?.displayValue??null;
        const ptsFor=toNumber(entry.stats?.find(s=>s.name==='avgPointsFor')?.value);
        const ptsAgainst=toNumber(entry.stats?.find(s=>s.name==='avgPointsAgainst')?.value);
        const obj={tid,abbr,name,conference:confName,pos,clincher,record,ptsFor,ptsAgainst};
        if(tid) lk.byId[tid]=obj;
        if(abbr) lk.byAbbr[abbr]=obj;
        if(name) lk.byName[name]=obj;
      }
    }
  }
  return lk;
}

/* ── Recent games from schedule ── */
function extractRecentGames(scheduleData, teamId, gameDate, count=5){
  const events = scheduleData?.events||[];
  const gd = gameDate ? new Date(gameDate) : new Date();
  const tid = String(teamId);
  const past = events.filter(ev=>{
    const s = ev.competitions?.[0]?.status?.type?.state;
    const d = new Date(ev.date||'');
    return s==='post' && d < gd;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,count);

  return past.map(ev=>{
    const comp = ev.competitions?.[0]||{};
    const comps = comp.competitors||[];
    const myTeam = comps.find(c=>String(c.team?.id||c.id||'')===tid)||comps.find(c=>String(c.id||'')===tid);
    const oppTeam = comps.find(c=>c!==myTeam);
    const myScore = toNumber(typeof myTeam?.score==='object'?myTeam?.score?.value:myTeam?.score);
    const oppScore = toNumber(typeof oppTeam?.score==='object'?oppTeam?.score?.value:oppTeam?.score);
    const result = (myScore!==null&&oppScore!==null) ? (myScore>oppScore?'W':'L') : null;
    const oppRecord = parseRecord(oppTeam?.records?.[0]?.summary||oppTeam?.record?.items?.[0]?.summary||'');
    return { result, ptsScored:myScore, ptsAllowed:oppScore, oppWinPct:oppRecord?.pct??null, isHome: myTeam?.homeAway==='home' };
  }).filter(g=>g.result!==null);
}

function getB2BStatus(scheduleData, teamId, gameDate){
  const events = scheduleData?.events||[];
  const gd = gameDate ? new Date(gameDate) : new Date();
  const yesterday = new Date(gd); yesterday.setDate(yesterday.getDate()-1);
  const prev = events.find(ev=>{
    const s = ev.competitions?.[0]?.status?.type?.state;
    const d = new Date(ev.date||'');
    return s==='post' && d>=new Date(yesterday.toDateString()) && d<new Date(gd.toDateString());
  });
  return prev ? {isB2B:true,label:'Back-to-back'} : {isB2B:false,label:'Descansado'};
}

/* ── Build team stats ── */
async function buildTeamStats(teamId, teamAbbr, gameDate, standingsLookup){
  const standing = standingsLookup.byId[String(teamId)] || standingsLookup.byAbbr[teamAbbr?.toLowerCase()] || null;

  let schedule = null;
  try { schedule = await fetchTeamSchedule(teamId); } catch(e){}

  const recentGames = schedule ? extractRecentGames(schedule, teamId, gameDate, 7) : [];
  const last5 = recentGames.slice(0,5);
  const last7 = recentGames.slice(0,7);

  const ptsScored = last5.map(g=>g.ptsScored).filter(v=>v!==null);
  const ptsAllowed = last5.map(g=>g.ptsAllowed).filter(v=>v!==null);
  const avgScored = average(ptsScored);
  const avgAllowed = average(ptsAllowed);
  const diffs = last5.map(g=>(g.ptsScored!==null&&g.ptsAllowed!==null)?g.ptsScored-g.ptsAllowed:null).filter(v=>v!==null);
  const avgDiff = average(diffs);

  /* Calidad de rivales: win% promedio de rivales en últimos 7 */
  const oppPcts = last7.map(g=>g.oppWinPct).filter(v=>v!==null);
  const rivalQualityPct = average(oppPcts);

  /* Split: rendimiento de local vs visita en últimos 7 */
  const homeGames = last7.filter(g=>g.isHome);
  const awayGames = last7.filter(g=>!g.isHome);
  const homeWins = homeGames.filter(g=>g.result==='W').length;
  const awayWins = awayGames.filter(g=>g.result==='W').length;
  const venueSplit = homeGames.length||awayGames.length
    ? `Local ${homeWins}/${homeGames.length} · Visita ${awayWins}/${awayGames.length}`
    : '—';

  /* Diferencial ajustado por rival */
  const adjDiffs = last5.map(g=>{
    if(g.ptsScored===null||g.ptsAllowed===null) return null;
    const base = g.ptsScored - g.ptsAllowed;
    const adj = g.oppWinPct!==null ? base * (1 + (g.oppWinPct-0.5)*0.3) : base;
    return adj;
  }).filter(v=>v!==null);
  const adjustedDiff = average(adjDiffs);

  /* B2B */
  const b2b = schedule ? getB2BStatus(schedule, teamId, gameDate) : {isB2B:false,label:'Descansado'};

  /* Perfil ofensivo/defensivo usando season stats */
  const seasonPtsFor = standing?.ptsFor ?? null;
  const seasonPtsAgainst = standing?.ptsAgainst ?? null;
  let teamStyle = '—';
  if(seasonPtsFor!==null&&seasonPtsAgainst!==null){
    const off = seasonPtsFor>=115?'Ataque alto':seasonPtsFor>=110?'Ataque medio':'Ataque bajo';
    const def = seasonPtsAgainst<=110?'Def. sólida':seasonPtsAgainst<=115?'Def. media':'Def. débil';
    teamStyle = `${off} · ${def}`;
  } else if(avgScored!==null&&avgAllowed!==null){
    const off = avgScored>=115?'Ataque alto':avgScored>=108?'Ataque medio':'Ataque bajo';
    const def = avgAllowed<=110?'Def. sólida':avgAllowed<=116?'Def. media':'Def. débil';
    teamStyle = `${off} · ${def}`;
  }

  /* Forma visual */
  const formHtml = last5.length
    ? `<div class="form-chips">${last5.map(g=>`<span class="form-chip ${g.result==='W'?'win':'loss'}">${g.result}</span>`).join('')}</div>`
    : '<span style="font-size:12px;color:#94a3b8">Sin datos</span>';

  /* venueDiff: para comparar entre equipos */
  const venueDiff = adjustedDiff ?? avgDiff ?? 0;

  return {
    record: standing?.record||'—',
    conference: standing?.conference||'NBA',
    position: standing?.pos||'—',
    clincher: standing?.clincher||null,
    recentFormHtml: formHtml,
    formGames: last5,
    pointsScoredRecent: avgScored!==null?fmt1(avgScored):'—',
    pointsAllowedRecent: avgAllowed!==null?fmt1(avgAllowed):'—',
    adjustedDiffRecent: adjustedDiff!==null?fmt1(adjustedDiff):(avgDiff!==null?fmt1(avgDiff):'—'),
    rivalQuality: rivalStrengthLabel(rivalQualityPct),
    venueSplit,
    venueDiff,
    teamStyle,
    b2b: b2b.isB2B?`⚠️ ${b2b.label}`:b2b.label,
    isB2B: b2b.isB2B,
    seasonPtsFor,
    seasonPtsAgainst,
    avgScored,
    avgAllowed,
    avgDiff
  };
}

/* ── Odds API ── */
async function fetchOddsEvents(){
  const now = Date.now();
  if(oddsCache && now-oddsCacheTime<3600000) return oddsCache;
  try{
    /* Intentamos The Odds API oficial */
    const r = await fetch(`https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${ODDS_API_KEY}&regions=eu,us&markets=h2h,spreads,totals&oddsFormat=decimal`);
    if(r.ok){
      const json = await r.json();
      if(Array.isArray(json)&&json.length){
        oddsCache = json;
        oddsCacheTime = now;
        return oddsCache;
      }
    }
  }catch(e){}
  /* Fallback: sportsgameodds */
  try{
    const json = await fetchJSON(`https://api.sportsgameodds.com/v2/events?leagueID=NBA&oddsAvailable=true&apiKey=${ODDS_API_KEY}`);
    if(json?.success&&Array.isArray(json?.data)){
      oddsCache = json.data.map(ev=>{
        const homeTeam=ev.teams?.home?.names?.long||'', awayTeam=ev.teams?.away?.names?.long||'';
        const odds=ev.odds||{}; const bmMap={};
        function addOdd(oddID,mkey,oname){
          const oddData=odds[oddID]; if(!oddData?.byBookmaker) return;
          for(const [bmKey,bmData] of Object.entries(oddData.byBookmaker)){
            if(!bmData?.available) continue;
            const raw=Number(bmData.odds); if(!raw||Number.isNaN(raw)) continue;
            let price=raw>0?raw/100+1:raw<0?100/Math.abs(raw)+1:null; if(!price) continue;
            if(!bmMap[bmKey]) bmMap[bmKey]={key:bmKey.toLowerCase(),title:bmKey,markets:{}};
            if(!bmMap[bmKey].markets[mkey]) bmMap[bmKey].markets[mkey]={key:mkey,outcomes:[]};
            const out={name:oname,price};
            if(mkey==='spreads'){ const pt=bmData.spread??oddData.bookSpread??null; if(pt!==null) out.point=Number(pt); }
            if(mkey==='totals'){ const pt=bmData.overUnder??oddData.bookOverUnder??null; if(pt!==null) out.point=Number(pt); }
            bmMap[bmKey].markets[mkey].outcomes.push(out);
          }
        }
        addOdd('points-home-game-ml-home','h2h',homeTeam);
        addOdd('points-away-game-ml-away','h2h',awayTeam);
        addOdd('points-home-game-sp-home','spreads',homeTeam);
        addOdd('points-away-game-sp-away','spreads',awayTeam);
        addOdd('points-all-game-ou-over','totals','over');
        addOdd('points-all-game-ou-under','totals','under');
        return {id:ev.eventID,home_team:homeTeam,away_team:awayTeam,commence_time:ev.status?.startsAt,
          bookmakers:Object.values(bmMap).map(bm=>({key:bm.key,title:bm.title,markets:Object.values(bm.markets)}))};
      });
      oddsCacheTime = now;
      return oddsCache;
    }
  }catch(e){}
  return [];
}

function findOddsEvent(events, homeName, awayName){
  const h=normTeam(homeName), a=normTeam(awayName);
  return events.find(ev=>normTeam(ev.home_team)===h&&normTeam(ev.away_team)===a)
      || events.find(ev=>normTeam(ev.home_team).includes(h.split(' ').pop())&&normTeam(ev.away_team).includes(a.split(' ').pop()))
      || null;
}

function normBmKey(k){ return String(k||'').toLowerCase(); }
function bmDisplayName(key,title){ const n={'bet365':'Bet365','betsson':'Betsson','stake':'Stake','draftkings':'DraftKings','fanduel':'FanDuel','williamhill':'William Hill','pinnacle':'Pinnacle','bovada':'Bovada','mybookieag':'MyBookie','betonlineag':'BetOnline','betus':'BetUS','lowvig':'LowVig'}; return n[normBmKey(key)]||title||key||'—'; }
function sortBms(bms){ return [...bms].sort((a,b)=>{ const ai=BOOKMAKER_PRIORITY.indexOf(normBmKey(a.key)), bi=BOOKMAKER_PRIORITY.indexOf(normBmKey(b.key)); return (ai===-1?999:ai)-(bi===-1?999:bi); }); }
function findOutcome(outcomes,teamName){ const t=normTeam(teamName); return outcomes.find(o=>normTeam(o.name)===t)||outcomes.find(o=>t.includes(normTeam(o.name).split(' ').pop())||normTeam(o.name).includes(t.split(' ').pop()))||null; }

/* ── Best odds from all bookmakers ── */
function getBestOddsForTeam(bookmakers, teamName, market='h2h'){
  let best = null, bestBm = null;
  for(const bm of bookmakers){
    const mkt = bm.markets?.find(m=>m.key===market);
    if(!mkt) continue;
    const out = findOutcome(mkt.outcomes||[], teamName);
    if(!out) continue;
    const price = toNumber(out.price);
    if(!price||price<1.01) continue;
    if(best===null||price>best){ best=price; bestBm=bm; }
  }
  return best ? {price:best,bm:bestBm} : null;
}

function getBestSpreadForTeam(bookmakers, teamName){
  let best = null, bestBm = null, bestLine = null;
  for(const bm of bookmakers){
    const mkt = bm.markets?.find(m=>m.key==='spreads');
    if(!mkt) continue;
    const out = findOutcome(mkt.outcomes||[], teamName);
    if(!out) continue;
    const price = toNumber(out.price), point = toNumber(out.point);
    if(!price||price<1.01||point===null) continue;
    if(best===null||price>best){ best=price; bestBm=bm; bestLine=point; }
  }
  return best ? {price:best,line:bestLine,bm:bestBm} : null;
}

function getBestTotal(bookmakers, direction){
  let best = null, bestBm = null, bestLine = null;
  for(const bm of bookmakers){
    const mkt = bm.markets?.find(m=>m.key==='totals');
    if(!mkt) continue;
    const out = (mkt.outcomes||[]).find(o=>o.name?.toLowerCase()===direction.toLowerCase());
    if(!out) continue;
    const price = toNumber(out.price), point = toNumber(out.point);
    if(!price||price<1.01||point===null) continue;
    if(best===null||price>best){ best=price; bestBm=bm; bestLine=point; }
  }
  return best ? {price:best,line:bestLine,bm:bestBm} : null;
}

/* ── Pick recommendation engine ── */
function buildPickRecommendation({oddsEvent, awayName, homeName, awayStats, homeStats, injuryPenaltyAway, injuryPenaltyHome}){
  if(!oddsEvent?.bookmakers?.length) return {nobet:true, reason:'Sin cuotas disponibles para este partido.'};

  const bms = oddsEvent.bookmakers;

  /* Score base usando múltiples señales */
  let awayScore = 0, homeScore = 0;

  /* 1. Diferencial reciente */
  const awayDiff = toNumber(awayStats.avgDiff);
  const homeDiff = toNumber(homeStats.avgDiff);
  if(awayDiff!==null&&homeDiff!==null){
    awayScore += awayDiff * 0.4;
    homeScore += homeDiff * 0.4;
  }

  /* 2. Forma reciente (W=1, L=-1) */
  (awayStats.formGames||[]).forEach((g,i)=>{ awayScore += (g.result==='W'?1:-1)*(5-i)*0.3; });
  (homeStats.formGames||[]).forEach((g,i)=>{ homeScore += (g.result==='W'?1:-1)*(5-i)*0.3; });

  /* 3. Split cancha: home team ventaja local */
  homeScore += 2.5; /* ventaja local base NBA */

  /* 4. B2B penalización */
  if(awayStats.isB2B) awayScore -= 3;
  if(homeStats.isB2B) homeScore -= 3;

  /* 5. Injury penalty */
  awayScore -= (injuryPenaltyAway||0);
  homeScore -= (injuryPenaltyHome||0);

  /* 6. Pts anotados vs permitidos últimos 5 */
  if(awayStats.avgScored!==null&&homeStats.avgAllowed!==null) awayScore += (awayStats.avgScored - homeStats.avgAllowed)*0.1;
  if(homeStats.avgScored!==null&&awayStats.avgAllowed!==null) homeScore += (homeStats.avgScored - awayStats.avgAllowed)*0.1;

  const scoreDiff = awayScore - homeScore; /* positivo = away mejor */
  const favSide = scoreDiff > 0 ? awayName : scoreDiff < 0 ? homeName : null;
  const edgeAbs = Math.abs(scoreDiff);

  if(!favSide || edgeAbs < 1.5) return {nobet:true, reason:'No hay edge estadístico suficiente. Partido parejo — sin apuesta recomendada.'};

  /* Projected total */
  const projTotal = (awayStats.avgScored!==null&&homeStats.avgScored!==null&&awayStats.avgAllowed!==null&&homeStats.avgAllowed!==null)
    ? ((awayStats.avgScored+homeStats.avgAllowed)/2 + (homeStats.avgScored+awayStats.avgAllowed)/2)
    : null;

  /* Elegir mercado */
  let selection = null;
  const estMargin = edgeAbs * 2;

  if(edgeAbs >= 3){
    /* Intenta spread primero */
    const sp = getBestSpreadForTeam(bms, favSide);
    if(sp && sp.price>=1.65){
      const spLine = sp.line;
      const reasonable = spLine>0 || Math.abs(spLine)<=Math.max(1.5,estMargin-2);
      if(reasonable) selection={type:'spread',side:favSide,line:spLine,odds:sp.price,bm:sp.bm,label:`${favSide} ${spLine>0?'+'+spLine:spLine}`};
    }
    if(!selection){
      const ml = getBestOddsForTeam(bms, favSide);
      if(ml&&ml.price>=1.45) selection={type:'moneyline',side:favSide,odds:ml.price,bm:ml.bm,label:`${favSide} ML`};
    }
  } else if(edgeAbs >= 2){
    const ml = getBestOddsForTeam(bms, favSide);
    if(ml&&ml.price>=1.50) selection={type:'moneyline',side:favSide,odds:ml.price,bm:ml.bm,label:`${favSide} ML`};
  }

  /* Si no hay side, busca total */
  if(!selection && projTotal!==null){
    const totBm = getBestTotal(bms, projTotal>222?'over':'under');
    if(totBm && Math.abs(projTotal-(totBm.line||0))>=4){
      selection={type:'total',direction:projTotal>222?'over':'under',side:null,odds:totBm.price,bm:totBm.bm,line:totBm.line,label:`${projTotal>222?'Más de':'Menos de'} ${totBm.line} pts`};
    }
  }

  if(!selection) return {nobet:true, reason:'Edge estadístico presente pero no se encontró cuota con valor suficiente.'};

  const implied = impliedProb(selection.odds);
  const modelProb = favSide ? (edgeAbs>=5?0.68:edgeAbs>=3?0.62:edgeAbs>=2?0.57:0.52) : 0.5;
  const edgePct = implied!==null ? modelProb - implied : null;

  let strength='Débil', stake='0.5u', badgeCls='weak';
  if(edgeAbs>=4&&selection.odds>=1.70){ strength='Fuerte'; stake='2u'; badgeCls='strong'; }
  else if(edgeAbs>=2.5&&selection.odds>=1.60){ strength='Medio'; stake='1u'; badgeCls='medium'; }

  const reasons=[];
  if(awayStats.isB2B) reasons.push(`${awayName} en back-to-back`);
  if(homeStats.isB2B) reasons.push(`${homeName} en back-to-back`);
  if(injuryPenaltyAway>0) reasons.push(`Bajas clave en ${awayName}`);
  if(injuryPenaltyHome>0) reasons.push(`Bajas clave en ${homeName}`);

  return {
    nobet:false, selection, strength, stake, badgeCls,
    favSide, edgeAbs, modelProb, implied, edgePct,
    reason:`Edge: ${fmt1(edgeAbs)} pts · ${selection.type==='spread'?'Spread':selection.type==='total'?'Total':'Moneyline'} · ${bmDisplayName(selection.bm?.key,selection.bm?.title)}`,
    contextNotes: reasons
  };
}

/* ── Injury calc ── */
function calcInjuryPenalty(injuriesData, teamName, roster){
  const keyNames=roster.slice(0,6).map(p=>normTeam(p.displayName||''));
  let penalty=0; const outPlayers=[];
  const teamInj=injuriesData?.find?.(t=>normTeam(t.team?.displayName||'').includes(normTeam(teamName).split(' ').pop()));
  if(!teamInj) return {penalty:0,outPlayers:[]};
  for(const inj of (teamInj.injuries||[])){
    const pName=normTeam(inj.athlete?.displayName||''), status=(inj.status||'').toLowerCase();
    const isKey=keyNames.some(k=>k.includes(pName.split(' ').pop())||pName.includes(k.split(' ').pop()));
    if(!isKey) continue;
    if(status.includes('out')){penalty+=2.5;outPlayers.push({name:inj.athlete?.displayName,status:'Out'});}
    else if(status.includes('day')){penalty+=0.8;outPlayers.push({name:inj.athlete?.displayName,status:'Day-to-day'});}
    else if(status.includes('quest')){penalty+=0.4;outPlayers.push({name:inj.athlete?.displayName,status:'Questionable'});}
  }
  return {penalty,outPlayers};
}

/* ── RENDER: pick card ── */
function renderPickCard(rec, awayName, homeName){
  if(rec.nobet){
    return `<div class="pick-card no-pick">
      <div class="pick-card-header">
        <span class="pick-badge nobet">Sin apuesta</span>
      </div>
      <p class="pick-nobet-text">${escapeHtml(rec.reason||'Sin pick recomendado.')}</p>
    </div>`;
  }
  const impStr = rec.implied!==null?`Prob. implícita: ${fmtPct(rec.implied)}`:'' ;
  const edgeStr = rec.edgePct!==null?` · Edge estimado: ${fmtPct(rec.edgePct)}`:'';
  const notesHtml = rec.contextNotes?.length?`<p class="pick-reason" style="margin-top:8px;color:#92400e">⚠️ ${rec.contextNotes.join(' · ')}</p>`:'';
  return `<div class="pick-card has-pick">
    <div class="pick-card-header">
      <span class="pick-badge ${rec.badgeCls}">${rec.strength==='Fuerte'?'🔥 Fuerte':rec.strength==='Medio'?'✅ Medio':'⚡ Débil'} · ${escapeHtml(rec.stake)}</span>
    </div>
    <div class="pick-main">
      <span class="pick-selection">${escapeHtml(rec.selection.label)}</span>
      <span class="pick-odds">@${fmtOdds(rec.selection.odds)}</span>
      <span class="pick-stake">${escapeHtml(rec.stake)}</span>
    </div>
    <p class="pick-reason">${escapeHtml(rec.reason)}</p>
    ${impStr?`<p class="pick-implied">${escapeHtml(impStr+edgeStr)}</p>`:''}
    ${notesHtml}
  </div>`;
}

/* ── RENDER: context strip ── */
function renderContextStrip(awayStats, homeStats, awayName, homeName, awayAbbr, homeAbbr){
  const awayCtx = getContextLabel(awayStats.position, awayStats.clincher);
  const homeCtx = getContextLabel(homeStats.position, homeStats.clincher);
  return `<div class="section-block">
    <div class="section-title">🏆 Contexto clasificatorio</div>
    <div class="context-grid">
      <div class="context-team">
        <div class="context-team-header">
          <img class="context-team-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}" loading="lazy">
          <span class="context-team-name">${escapeHtml(awayName)}</span>
        </div>
        <span class="context-pill ${awayCtx.cls}">${escapeHtml(awayCtx.label)}</span>
        <span class="context-pill neutral">${escapeHtml(awayStats.conference)}</span>
        <span class="context-pill neutral">${escapeHtml(awayStats.record)}</span>
        ${awayStats.isB2B?`<span class="context-pill b2b">Back-to-back</span>`:''}
      </div>
      <div class="context-team">
        <div class="context-team-header">
          <img class="context-team-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}" loading="lazy">
          <span class="context-team-name">${escapeHtml(homeName)}</span>
        </div>
        <span class="context-pill ${homeCtx.cls}">${escapeHtml(homeCtx.label)}</span>
        <span class="context-pill neutral">${escapeHtml(homeStats.conference)}</span>
        <span class="context-pill neutral">${escapeHtml(homeStats.record)}</span>
        ${homeStats.isB2B?`<span class="context-pill b2b">Back-to-back</span>`:''}
      </div>
    </div>
  </div>`;
}

/* ── RENDER: stats grid ── */
function statRow(awayVal, label, homeVal, awayEdge='', homeEdge=''){
  return `<div class="pregame-row">
    <div class="away ${awayEdge}">${awayVal}</div>
    <div class="metric">${escapeHtml(label)}</div>
    <div class="home ${homeEdge}">${homeVal}</div>
  </div>`;
}

function renderStatsGrid(awayStats, homeStats, awayName, homeName){
  const rs  = compareHigher(parseRecord(awayStats.record)?.pct, parseRecord(homeStats.record)?.pct);
  const sc  = compareHigher(toNumber(awayStats.avgScored),  toNumber(homeStats.avgScored));
  const al  = compareLower(toNumber(awayStats.avgAllowed), toNumber(homeStats.avgAllowed));
  const df  = compareHigher(awayStats.avgDiff, homeStats.avgDiff);
  const adf = compareHigher(toNumber(awayStats.adjustedDiffRecent), toNumber(homeStats.adjustedDiffRecent));

  return `<div class="section-block">
    <div class="section-title">📊 Comparativa estadística (últimos 5 partidos)</div>
    <div class="pregame-shell"><div class="pregame-compare">
      <div class="pregame-row pregame-head">
        <div>${escapeHtml(awayName)}</div><div>Métrica</div><div>${escapeHtml(homeName)}</div>
      </div>
      ${statRow(awayStats.recentFormHtml, 'Forma reciente', homeStats.recentFormHtml)}
      ${statRow(escapeHtml(awayStats.record), 'Récord', escapeHtml(homeStats.record), rs.away, rs.home)}
      ${statRow(escapeHtml(awayStats.pointsScoredRecent)+' pts', 'Pts anotados promedio', escapeHtml(homeStats.pointsScoredRecent)+' pts', sc.away, sc.home)}
      ${statRow(escapeHtml(awayStats.pointsAllowedRecent)+' pts', 'Pts recibidos promedio', escapeHtml(homeStats.pointsAllowedRecent)+' pts', al.away, al.home)}
      ${statRow(escapeHtml(awayStats.adjustedDiffRecent), 'Diferencial ajustado', escapeHtml(homeStats.adjustedDiffRecent), adf.away, adf.home)}
      ${statRow(escapeHtml(awayStats.rivalQuality), 'Calidad de rivales', escapeHtml(homeStats.rivalQuality))}
      ${statRow(escapeHtml(awayStats.venueSplit), 'Split cancha (últ.7)', escapeHtml(homeStats.venueSplit))}
      ${statRow(escapeHtml(awayStats.teamStyle), 'Perfil ataque/defensa', escapeHtml(homeStats.teamStyle))}
      ${statRow(escapeHtml(awayStats.b2b), 'Back-to-back', escapeHtml(homeStats.b2b))}
    </div></div>
  </div>`;
}

/* ── RENDER: odds block ── */
function renderOddsBlock(oddsEvent, awayName, homeName){
  if(!oddsEvent?.bookmakers?.length) return `<div class="section-block"><div class="section-title">💰 Cuotas</div><div class="no-odds">No se encontraron cuotas para este partido.</div></div>`;
  const bms = sortBms(oddsEvent.bookmakers).slice(0,4);
  let h2hRows='', spRows='', totRows='';
  for(const bm of bms){
    const bmTag=`<span class="odds-bm-tag">${escapeHtml(bmDisplayName(bm.key,bm.title))}</span>`;
    const h2h=bm.markets?.find(m=>m.key==='h2h'), sp=bm.markets?.find(m=>m.key==='spreads'), tot=bm.markets?.find(m=>m.key==='totals');
    if(h2h?.outcomes?.length){
      const aw=findOutcome(h2h.outcomes,awayName), hm=findOutcome(h2h.outcomes,homeName);
      h2hRows+=`<tr><td>${bmTag}</td><td class="odds-val">${fmtOdds(toNumber(aw?.price))}</td><td class="odds-val">${fmtOdds(toNumber(hm?.price))}</td></tr>`;
    }
    if(sp?.outcomes?.length){
      const aw=findOutcome(sp.outcomes,awayName), hm=findOutcome(sp.outcomes,homeName);
      spRows+=`<tr><td>${bmTag}</td><td>${aw?.point!==undefined?`<span class="odds-line">${aw.point>0?'+'+aw.point:aw.point}</span> <span class="odds-val">${fmtOdds(toNumber(aw.price))}</span>`:'—'}</td><td>${hm?.point!==undefined?`<span class="odds-line">${hm.point>0?'+'+hm.point:hm.point}</span> <span class="odds-val">${fmtOdds(toNumber(hm.price))}</span>`:'—'}</td></tr>`;
    }
    if(tot?.outcomes?.length){
      const ov=(tot.outcomes||[]).find(o=>o.name==='over'), un=(tot.outcomes||[]).find(o=>o.name==='under');
      totRows+=`<tr><td>${bmTag}</td><td>⬆️ <span class="odds-line">${ov?.point||'—'}</span> <span class="odds-val">${fmtOdds(toNumber(ov?.price))}</span></td><td>⬇️ <span class="odds-line">${un?.point||'—'}</span> <span class="odds-val">${fmtOdds(toNumber(un?.price))}</span></td></tr>`;
    }
  }
  const mkGroup=(title,rows,h1,h2)=>rows?`<div class="odds-market-group"><div class="odds-market-label">${title}</div><table class="odds-table"><thead><tr><th>Casa</th><th>${escapeHtml(h1)}</th><th>${escapeHtml(h2)}</th></tr></thead><tbody>${rows}</tbody></table></div>`:'';
  return `<div class="section-block"><div class="section-title">💰 Cuotas en vivo</div><div class="odds-block">
    ${mkGroup('Moneyline',h2hRows,awayName,homeName)}
    ${mkGroup('Spread (hándicap)',spRows,awayName,homeName)}
    ${mkGroup('Total puntos',totRows,'Over','Under')}
  </div></div>`;
}

/* ── RENDER: roster / lineup ── */
function renderRoster(awayRoster, homeRoster, awayAbbr, homeAbbr, awayName, homeName, injuriesData){
  function buildInjMap(teamName){
    const map={};
    const teamInj = injuriesData?.find?.(t=>normTeam(t.team?.displayName||'').includes(normTeam(teamName).split(' ').pop()));
    if(!teamInj) return map;
    for(const inj of (teamInj.injuries||[])){ map[normTeam(inj.athlete?.displayName||'')]=inj.status||'Active'; }
    return map;
  }
  function playerRows(roster, injMap){
    if(!roster?.length) return '<div class="section-empty">Sin datos de roster</div>';
    return roster.slice(0,12).map(p=>{
      const pName=normTeam(p.displayName||'');
      const rawStatus=injMap[pName]||'';
      const sc=rawStatus.toLowerCase().replace(/\s+/g,'-');
      const bc=sc.includes('out')?'out':sc.includes('day')?'day-to-day':sc.includes('quest')?'questionable':'';
      return `<div class="player-row">
        <span class="player-jersey">${escapeHtml(p.jersey||'#')}</span>
        <span class="player-name">${escapeHtml(p.displayName||'')}</span>
        <span class="player-pos">${escapeHtml(p.position?.abbreviation||'')}</span>
        ${bc?`<span class="injury-badge ${bc}">${escapeHtml(rawStatus)}</span>`:''}
      </div>`;
    }).join('');
  }
  const awayInjMap=buildInjMap(awayName), homeInjMap=buildInjMap(homeName);
  return `<div class="section-block">
    <div class="section-title">🏀 Roster & Lesionados</div>
    <div class="lineup-grid">
      <div class="lineup-col">
        <div class="lineup-col-title">
          <img class="lineup-col-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}" loading="lazy" width="20" height="20">
          <span>${escapeHtml(awayName)}</span>
        </div>
        ${playerRows(awayRoster,awayInjMap)}
      </div>
      <div class="lineup-col">
        <div class="lineup-col-title">
          <img class="lineup-col-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}" loading="lazy" width="20" height="20">
          <span>${escapeHtml(homeName)}</span>
        </div>
        ${playerRows(homeRoster,homeInjMap)}
      </div>
    </div>
  </div>`;
}

/* ── Scoreboard helpers ── */
function findGameInScoreboardCache(gameId){ return scoreboardCache.find(ev=>String(ev.id)===String(gameId))||null; }
function getTeamIdFromCompetitor(c){ return String(c?.team?.id||c?.id||''); }
function getCompetitorsFromEventLike(data){
  return data?.header?.competitions?.[0]?.competitors||data?.competitions?.[0]?.competitors||data?.competitors||[];
}
function buildFallbackFromScoreboardEvent(ev){
  if(!ev) return null;
  return {header:{competitions:[{competitors:ev.competitions?.[0]?.competitors||[],date:ev.date}]}};
}

/* ── Load scoreboard ── */
async function loadNBAGames(){
  statusEl.textContent='Cargando partidos NBA...';
  try{
    const data = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    const events = data?.events||[];
    scoreboardCache = events;
    if(!events.length){ statusEl.textContent='Sin partidos disponibles hoy.'; gamesContainer.innerHTML='<div class="empty-state"><p>No hay juegos NBA hoy.</p></div>'; return; }
    statusEl.textContent=`${events.length} partidos NBA cargados`;
    gamesContainer.innerHTML='';
    for(const event of events){
      const comp=event.competitions?.[0]||null;
      const comps=comp?.competitors||[];
      const home=comps.find(t=>t.homeAway==='home'), away=comps.find(t=>t.homeAway==='away');
      const homeName=home?.team?.displayName||'Local', awayName=away?.team?.displayName||'Visitante';
      const homeAbbr=home?.team?.abbreviation||'', awayAbbr=away?.team?.abbreviation||'';
      const homeScore=typeof home?.score==='object'?home.score?.displayValue??'—':home?.score??'—';
      const awayScore=typeof away?.score==='object'?away.score?.displayValue??'—':away?.score??'—';
      const rawStatus=event.status?.type?.description||'Sin estado', gameStatus=formatStatusText(rawStatus);
      const state=event.status?.type?.state||'', period=event.status?.period||null, clock=event.status?.displayClock||'';
      const isFinal=state==='post', isLive=state==='in';
      let badgeText='', badgeClass='is-scheduled';
      if(isFinal){badgeText='Finalizado';badgeClass='is-final';}
      else if(isLive){badgeText=`En progreso · Q${period||'—'} · ${clock}`;badgeClass='';}
      else{badgeText=`Programado · ${formatGameTime(event.date)}`;}
      const card=document.createElement('article');
      card.className='game-card';
      card.innerHTML=`
        <div class="game-top">
          <span class="game-status">${isLive?'🔴 EN VIVO':'📅 NBA'}</span>
          <span class="game-date">${new Date(event.date).toLocaleDateString('es-CL',{weekday:'short',month:'short',day:'numeric'})}</span>
        </div>
        <div class="teams">
          <div class="team-row">
            <div class="team-row-left"><img class="team-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}" loading="lazy" width="30" height="30"><span class="team-name">${escapeHtml(awayName)}</span></div>
            ${(isFinal||isLive)?`<span class="team-score">${escapeHtml(String(awayScore))}</span>`:''}
          </div>
          <div class="team-row">
            <div class="team-row-left"><img class="team-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}" loading="lazy" width="30" height="30"><span class="team-name">${escapeHtml(homeName)}</span></div>
            ${(isFinal||isLive)?`<span class="team-score">${escapeHtml(String(homeScore))}</span>`:''}
          </div>
        </div>
        <span class="live-extra ${badgeClass}">${escapeHtml(badgeText)}</span>
        <div class="game-actions">
          <button class="analyze-btn" data-game-id="${escapeHtml(String(event.id))}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            Analizar partido
          </button>
        </div>`;
      gamesContainer.appendChild(card);
    }
  }catch(err){ console.error(err); statusEl.textContent='Error al cargar partidos'; gamesContainer.innerHTML='<div class="empty-state"><p>No se pudo cargar la API de ESPN.</p></div>'; }
}

/* ── Analyze game ── */
async function analyzeGame(gameId){
  if(!analysisPanel) return;
  openModal();
  analysisPanel.innerHTML=`<div class="loading-state"><div class="loading-spinner"></div><p>Cargando análisis pregame...</p></div>`;
  if(modalTeamsHdr) modalTeamsHdr.innerHTML='<span>Análisis Pregame</span>';
  try{
    /* 1. Summary */
    let summaryData = null;
    try{ summaryData=await fetchGameSummary(gameId); }catch(e){}
    const scoreboardEvent = findGameInScoreboardCache(gameId);
    if(!summaryData) summaryData=buildFallbackFromScoreboardEvent(scoreboardEvent);

    const competitors = getCompetitorsFromEventLike(summaryData);
    if(!competitors.length){ analysisPanel.innerHTML='<div class="loading-state"><p>No se pudo abrir el pregame.</p></div>'; return; }

    const comp = summaryData?.header?.competitions?.[0]||scoreboardEvent?.competitions?.[0]||{};
    const home = competitors.find(t=>t.homeAway==='home');
    const away = competitors.find(t=>t.homeAway==='away');
    if(!home||!away){ analysisPanel.innerHTML='<div class="loading-state"><p>No se pudo identificar local y visitante.</p></div>'; return; }

    const homeName=home?.team?.displayName||'Local';
    const awayName=away?.team?.displayName||'Visitante';
    const homeAbbr=home?.team?.abbreviation||'';
    const awayAbbr=away?.team?.abbreviation||'';
    const homeTeamId=getTeamIdFromCompetitor(home);
    const awayTeamId=getTeamIdFromCompetitor(away);
    const gameDate=comp?.date||null;
    const gameTime=gameDate?formatGameTime(gameDate):'';

    /* Header modal */
    if(modalTeamsHdr) modalTeamsHdr.innerHTML=`
      <div class="modal-header-team"><img class="modal-header-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}" loading="lazy"><span>${escapeHtml(awayName)}</span></div>
      <span class="modal-header-vs">vs</span>
      <div class="modal-header-team"><img class="modal-header-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}" loading="lazy"><span>${escapeHtml(homeName)}</span></div>
      ${gameTime?`<span class="modal-header-time">${escapeHtml(gameTime)}</span>`:''}`;

    /* 2. Fetch todo en paralelo */
    const [standingsRaw, injuriesRaw, awayRosterRaw, homeRosterRaw, oddsEvents] = await Promise.allSettled([
      fetchStandings(),
      fetchInjuries(),
      fetchTeamRoster(awayTeamId),
      fetchTeamRoster(homeTeamId),
      fetchOddsEvents()
    ]);

    const standingsLookup = (standingsRaw.status==='fulfilled'&&standingsRaw.value)
      ? buildStandingsLookup(standingsRaw.value) : {byId:{},byAbbr:{},byName:{}};
    const injuriesData = injuriesRaw.status==='fulfilled'?injuriesRaw.value?.injuries||injuriesRaw.value||[]:[];
    const awayRosterFull = awayRosterRaw.status==='fulfilled'?awayRosterRaw.value?.athletes||[]:[];
    const homeRosterFull = homeRosterRaw.status==='fulfilled'?homeRosterRaw.value?.athletes||[]:[];
    const awayRoster = awayRosterFull.flatMap(g=>g.items||g.athletes||[g]).filter(p=>p?.displayName);
    const homeRoster = homeRosterFull.flatMap(g=>g.items||g.athletes||[g]).filter(p=>p?.displayName);
    const oddsEventsArr = oddsEvents.status==='fulfilled'?oddsEvents.value:[];

    /* 3. Build stats */
    const [awayStats, homeStats] = await Promise.all([
      buildTeamStats(awayTeamId, awayAbbr, gameDate, standingsLookup),
      buildTeamStats(homeTeamId, homeAbbr, gameDate, standingsLookup)
    ]);

    /* 4. Injury penalties */
    const injAway = calcInjuryPenalty(injuriesData, awayName, awayRoster);
    const injHome = calcInjuryPenalty(injuriesData, homeName, homeRoster);

    /* 5. Edge scores para pick */
    const matchingOddsEvent = findOddsEvent(oddsEventsArr, homeName, awayName);

    const pick = buildPickRecommendation({
      oddsEvent: matchingOddsEvent,
      awayName, homeName,
      awayStats, homeStats,
      injuryPenaltyAway: injAway.penalty,
      injuryPenaltyHome: injHome.penalty
    });

    /* 6. Injury alert */
    let injAlertHtml='';
    const allOut=[...injAway.outPlayers.map(p=>({...p,team:awayName})),...injHome.outPlayers.map(p=>({...p,team:homeName}))].filter(p=>p.status==='Out');
    if(allOut.length) injAlertHtml=`<div class="injury-alert">⚠️ <span>Bajas confirmadas: ${allOut.map(p=>`<strong>${escapeHtml(p.name)}</strong> (${escapeHtml(p.team)})`).join(', ')}</span></div>`;

    /* 7. Render */
    analysisPanel.innerHTML=`
      ${renderPickCard(pick, awayName, homeName)}
      ${injAlertHtml}
      ${renderContextStrip(awayStats, homeStats, awayName, homeName, awayAbbr, homeAbbr)}
      ${renderStatsGrid(awayStats, homeStats, awayName, homeName)}
      ${renderOddsBlock(matchingOddsEvent, awayName, homeName)}
      ${renderRoster(awayRoster, homeRoster, awayAbbr, homeAbbr, awayName, homeName, injuriesData)}
    `;
  }catch(err){
    console.error(err);
    analysisPanel.innerHTML=`<div class="loading-state"><p>Error al cargar el análisis: ${escapeHtml(err.message)}</p></div>`;
  }
}

/* ── Init ── */
gamesContainer?.addEventListener('click', ev=>{
  const btn=ev.target.closest('.analyze-btn');
  if(!btn) return;
  const id=btn.dataset.gameId;
  if(id) analyzeGame(id);
});

loadNBAGames();
