diff --git a/main.js b/main.js
new file mode 100644
index 0000000000000000000000000000000000000000..8700cc4df70fbe15ab0a011f21c0b03d789e7c85
--- /dev/null
+++ b/main.js
@@ -0,0 +1,765 @@
+/* NBA Pregame Scout · app.js
+   Base: app-3.js (métricas y lógica de pick originales)
+   Cambios aplicados:
+   1. Pick card arriba del todo en el modal
+   2. Alerta naranja si favorito tiene jugador clave OUT
+   3. Líneas alternativas de spread conservadoras (50% del spread oficial)
+   4. Casas filtradas: solo bet365, betsson, stake
+   5. Modal header con logos + hora
+   6. Logos equipo en cards y roster (tamaño correcto)
+   7. Estadísticas en grid (no texto plano en columna)
+   8. autoNote y leanText PRESERVADOS del original
+*/
+
+const statusEl       = document.getElementById('status');
+const gamesContainer = document.getElementById('games');
+const analysisPanel  = document.getElementById('analysis-panel');
+const modal          = document.getElementById('game-modal');
+const modalCloseBtn  = document.getElementById('modal-close');
+const modalCloseBg   = document.getElementById('modal-close-bg');
+const modalTeamsHdr  = document.getElementById('modal-teams-header');
+
+const ODDS_API_KEY       = '987635aba320e6bdebcf265db26707ae';
+const BOOKMAKER_PRIORITY = ['bet365','betsson','stake'];
+
+let oddsCache = null, oddsCacheTime = 0, scoreboardCache = [];
+let CURRENT_SEASON = new Date().getUTCFullYear();
+const gameSummaryCache = new Map();
+
+/* ── Modal ── */
+function openModal()  { modal?.classList.remove('hidden'); modal?.setAttribute('aria-hidden','false'); }
+function closeModal() { modal?.classList.add('hidden');    modal?.setAttribute('aria-hidden','true');  }
+
+/* ── Utils (idénticos al original) ── */
+function escapeHtml(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
+function toNumber(v){ if(v===null||v===undefined) return null; if(typeof v==='number') return Number.isNaN(v)?null:v; const n=Number(String(v).replace(/[^\d.-]/g,'')); return Number.isNaN(n)?null:n; }
+function parseRecord(t){ if(!t||typeof t!=='string') return null; const p=t.split('-'); if(p.length<2) return null; const w=Number(p[0]),l=Number(p[1]); return (Number.isNaN(w)||Number.isNaN(l))?null:{wins:w,losses:l,pct:w/(w+l)}; }
+function average(arr){ if(!arr.length) return null; return arr.reduce((s,v)=>s+v,0)/arr.length; }
+function formatOneDecimal(v){ if(v===null||v===undefined||Number.isNaN(v)) return 'Pendiente'; return Number(v).toFixed(1); }
+function formatSignedOneDecimal(v){ if(v===null||v===undefined||Number.isNaN(v)) return 'Pendiente'; return Number(v)>0?`+${Number(v).toFixed(1)}`:Number(v).toFixed(1); }
+function formatOddsDecimal(v){ if(v===null||v===undefined||Number.isNaN(v)) return 'Pendiente'; return Number(v).toFixed(2); }
+function formatPercent(v){ if(v===null||v===undefined||Number.isNaN(v)) return 'Pendiente'; return `${(Number(v)*100).toFixed(1)}%`; }
+function normTeam(n){ return String(n||'').toLowerCase().replace(/\s+/g,' ').trim(); }
+function compareNumbersHigherBetter(a,b){ if(a===null||b===null) return {away:'',home:''}; if(a>b) return {away:'edge',home:''}; if(b>a) return {away:'',home:'edge'}; return {away:'',home:''}; }
+function compareNumbersLowerBetter(a,b){ if(a===null||b===null) return {away:'',home:''}; if(a<b) return {away:'edge',home:''}; if(b<a) return {away:'',home:'edge'}; return {away:'',home:''}; }
+function impliedProbabilityFromDecimal(v){ return (!v||v<=1)?null:1/v; }
+function espnLogo(abbr){ return abbr?`https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png`:''; }
+function formatGameTime(d){ try{ return new Date(d).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}); }catch{ return ''; } }
+function formatStatusText(s){ const m={'Final':'Finalizado','In Progress':'En progreso','Scheduled':'Programado','Halftime':'Medio tiempo'}; return m[s]||s||'Sin estado'; }
+function getConferenceLabel(n){ if(!n) return 'NBA'; const l=n.toLowerCase(); return l.includes('east')?'Este':l.includes('west')?'Oeste':n; }
+function getContextFromConferencePosition(pos,clincher){ if(clincher==='e') return 'Eliminado'; if(clincher==='x') return 'Clasificado'; if(clincher==='y') return 'Líder división'; if(clincher==='z') return 'Mejor récord'; if(!pos) return '—'; const p=Number(pos); if(p<=6) return 'Playoffs directo'; if(p<=10) return 'Play-In'; return 'Fuera de playoffs'; }
+function getOpponentStrengthLabel(pct){ if(pct===null||pct===undefined) return '—'; if(pct>=0.60) return 'Rivales fuertes'; if(pct>=0.50) return 'Rivales medios'; if(pct>=0.40) return 'Rivales mixtos'; return 'Rivales débiles'; }
+function getStatValue(entry,names){ if(!entry?.stats) return 'Pendiente'; const ns=Array.isArray(names)?names:[names]; for(const n of ns){ const s=entry.stats.find(s=>String(s?.name||'').toLowerCase()===n.toLowerCase()); if(s?.displayValue!==undefined&&s.displayValue!=='') return s.displayValue; if(s?.value!==undefined&&s.value!=='') return String(s.value); } return 'Pendiente'; }
+function toYYYYMMDD(dateObj){
+  const y=dateObj.getUTCFullYear();
+  const m=String(dateObj.getUTCMonth()+1).padStart(2,'0');
+  const d=String(dateObj.getUTCDate()).padStart(2,'0');
+  return `${y}${m}${d}`;
+}
+
+/* ── Standings ── */
+function createEmptyStandingsLookup(){ return {byTeamId:{},byAbbr:{},byName:{}}; }
+function buildStandingsLookup(data){
+  const lk=createEmptyStandingsLookup();
+  if(!data?.children) return lk;
+  for(const conf of data.children){
+    const confName=getConferenceLabel(conf?.name||'');
+    for(const div of (conf.children||[])){
+      for(const entry of (div.standings?.entries||[])){
+        const team=entry.team||{};
+        const tid=String(team.id||''), abbr=(team.abbreviation||'').toLowerCase(), name=team.displayName||'';
+        const record=entry.stats?.find(s=>s.name==='overall')?.displayValue||'—';
+        const pos=entry.stats?.find(s=>s.name==='playoffSeed')?.value??null;
+        const clincher=entry.stats?.find(s=>s.name==='clincher')?.displayValue??null;
+        const obj={teamId:tid,abbr,name,conference:confName,conferencePosition:pos,record,clincher};
+        if(tid) lk.byTeamId[tid]=obj;
+        if(abbr) lk.byAbbr[abbr]=obj;
+        if(name) lk.byName[name]=obj;
+      }
+    }
+  }
+  return lk;
+}
+
+/* ── Fetch helpers ── */
+async function fetchJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
+async function fetchConferenceStandingsSorted(){ return fetchJSON(`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${CURRENT_SEASON}&seasontype=2&type=0&level=3`); }
+async function fetchTeamSchedule(tid){ return tid?fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${tid}/schedule?season=${CURRENT_SEASON}`):null; }
+async function fetchGameSummary(gid){
+  if(gameSummaryCache.has(String(gid))) return gameSummaryCache.get(String(gid));
+  const data=await fetchJSON(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gid}`);
+  gameSummaryCache.set(String(gid),data);
+  return data;
+}
+async function fetchTeamRoster(tid){ if(!tid) return []; try{ const d=await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${tid}/roster`); return d?.athletes||[]; }catch{ return []; } }
+async function fetchGameInjuries(gid){ try{ const d=await fetchJSON(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gid}`); return d?.injuries||[]; }catch{ return []; } }
+
+function getTeamIdFromCompetitor(c){ return c?.team?.id||c?.id||null; }
+function getCompetitorsFromEventLike(d){ return d?.header?.competitions?.[0]?.competitors||d?.competitions?.[0]?.competitors||[]; }
+function buildFallbackSummaryFromScoreboardEvent(ev){ return ev?{header:{competitions:ev.competitions||[]}}:null; }
+function findGameInScoreboardCache(id){ return scoreboardCache.find(e=>String(e.id)===String(id))||null; }
+
+/* ── League profiles ── */
+async function getLeagueProfilesMap(standingsData){
+  const map={};
+  if(!standingsData?.children) return map;
+  const teams=[];
+  for(const conf of standingsData.children) for(const div of (conf.children||[])) for(const e of (div.standings?.entries||[])) if(e.team?.id) teams.push({id:String(e.team.id)});
+  const results=await Promise.allSettled(teams.slice(0,30).map(t=>fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${t.id}/statistics?season=${CURRENT_SEASON}`)));
+  const allS=[],allA=[];
+  const raw=results.map((r,i)=>{ if(r.status!=='fulfilled') return null; const cats=r.value?.results?.stats?.categories||[]; function get(c,n){ const cat=cats.find(x=>x.name===c); return toNumber(cat?.stats?.find(s=>s.name===n)?.value); } return {id:teams[i].id,scored:get('scoring','points'),allowed:get('defensive','pointsAllowed')}; }).filter(Boolean);
+  raw.forEach(r=>{ if(r.scored) allS.push(r.scored); if(r.allowed) allA.push(r.allowed); });
+  const avgS=average(allS)||110, avgA=average(allA)||110;
+  raw.forEach(r=>{
+    const oR=r.scored?Math.round((1-(r.scored/avgS))*10+5):null;
+    const dR=r.allowed?Math.round(((r.allowed/avgA)-1)*10+5):null;
+    const oL=!oR?'Ataque medio':oR<=3?'Top ataque':oR>=8?'Bajo ataque':'Ataque medio';
+    const dL=!dR?'Defensa media':dR<=3?'Top defensa':dR>=8?'Bajo defensa':'Defensa media';
+    map[r.id]={offenseRank:oR,defenseRank:dR,label:`${oL} | ${dL}`};
+  });
+  return map;
+}
+
+/* ── Schedule analysis (idéntico al original) ── */
+function getRecentFormFromSchedule(schedule,teamId,gameDate,n,standings){
+  const events=schedule?.events||[];
+  const tid=String(teamId), cutoff=gameDate?new Date(gameDate):new Date();
+  const played=events.filter(ev=>{ const s=ev.competitions?.[0]?.status?.type?.state; if(s!=='post') return false; return new Date(ev.date||'')<cutoff; }).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,n);
+  const games=[],scored=[],allowed=[],diffs=[],opPcts=[];
+  for(const ev of played){
+    const comp=ev.competitions?.[0];
+    const home=comp?.competitors?.find(c=>c.homeAway==='home');
+    const away=comp?.competitors?.find(c=>c.homeAway==='away');
+    const isHome=String(home?.team?.id||home?.id||'')===tid;
+    const me=isHome?home:away, opp=isHome?away:home;
+    if(!me||!opp) continue;
+    const ms=toNumber(typeof me.score==='object'?me.score?.displayValue:me.score);
+    const os=toNumber(typeof opp.score==='object'?opp.score?.displayValue:opp.score);
+    if(ms===null||os===null) continue;
+    const oppId=String(opp.team?.id||opp.id||'');
+    const oppEntry=standings.byTeamId[oppId];
+    const oppPct=oppEntry?parseRecord(oppEntry.record)?.pct??null:null;
+    games.push({result:ms>os?'W':'L',ms,os});
+    scored.push(ms); allowed.push(os); diffs.push(ms-os);
+    if(oppPct!==null) opPcts.push(oppPct);
+  }
+  return {games,scoredAvg:average(scored),allowedAvg:average(allowed),adjustedDiffAvg:average(diffs),opponentPctAvg:average(opPcts)};
+}
+
+function getVenueSplitForm(schedule,teamId,gameDate,venue,n){
+  const events=schedule?.events||[];
+  const tid=String(teamId), cutoff=gameDate?new Date(gameDate):new Date();
+  const played=events.filter(ev=>{ if(ev.competitions?.[0]?.status?.type?.state!=='post') return false; const comp=ev.competitions[0]; const me=comp.competitors?.find(c=>String(c.team?.id||c.id||'')===tid); return me&&me.homeAway===venue&&new Date(ev.date||'')<cutoff; }).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,n);
+  let w=0,l=0; const diffs=[];
+  for(const ev of played){
+    const comp=ev.competitions[0];
+    const me=comp.competitors.find(c=>String(c.team?.id||c.id||'')===tid);
+    const opp=comp.competitors.find(c=>String(c.team?.id||c.id||'')!==tid);
+    const ms=toNumber(typeof me.score==='object'?me.score?.displayValue:me.score);
+    const os=toNumber(typeof opp.score==='object'?opp.score?.displayValue:opp.score);
+    if(ms===null||os===null) continue;
+    ms>os?w++:l++; diffs.push(ms-os);
+  }
+  return {record:`${w}-${l}`,diffAvg:average(diffs)};
+}
+
+function getB2BStatus(schedule,teamId,gameDate){
+  const events=schedule?.events||[];
+  const tid=String(teamId), gd=gameDate?new Date(gameDate):new Date();
+  const yesterday=new Date(gd); yesterday.setDate(yesterday.getDate()-1);
+  const prev=events.find(ev=>{ const s=ev.competitions?.[0]?.status?.type?.state; const d=new Date(ev.date||''); return s==='post'&&d>=new Date(yesterday.toDateString())&&d<new Date(gd.toDateString()); });
+  return prev?{isB2B:true,label:'Back-to-back',detail:'Jugó ayer'}:{isB2B:false,label:'Descansado',detail:'No jugó ayer'};
+}
+
+/* ── Odds API ── */
+async function fetchOddsApiEvents(){
+  const now=Date.now();
+  if(oddsCache&&now-oddsCacheTime<3600000) return oddsCache;
+  const json=await fetchJSON(`https://api.sportsgameodds.com/v2/events?leagueID=NBA&oddsAvailable=true&apiKey=${ODDS_API_KEY}`);
+  if(!json?.success||!Array.isArray(json?.data)) return [];
+  oddsCache=json.data.map(ev=>{
+    const homeTeam=ev.teams?.home?.names?.long||'', awayTeam=ev.teams?.away?.names?.long||'';
+    const odds=ev.odds||{}, bmMap={};
+    function addOdd(oddID,mkey,oname){
+      const oddData=odds[oddID]; if(!oddData?.byBookmaker) return;
+      for(const [bmKey,bmData] of Object.entries(oddData.byBookmaker)){
+        if(!bmData?.available) continue;
+        const bmLow=bmKey.toLowerCase();
+        const raw=Number(bmData.odds); if(!raw||Number.isNaN(raw)) continue;
+        let price=raw>0?raw/100+1:raw<0?100/Math.abs(raw)+1:null; if(!price) continue;
+        if(!bmMap[bmKey]) bmMap[bmKey]={key:bmLow,title:bmKey,markets:{}};
+        if(!bmMap[bmKey].markets[mkey]) bmMap[bmKey].markets[mkey]={key:mkey,outcomes:[]};
+        const outcome={name:oname,price};
+        if(mkey==='spreads'){ const pt=bmData.spread??oddData.bookSpread??null; if(pt!==null) outcome.point=Number(pt); }
+        if(mkey==='totals'){  const pt=bmData.overUnder??oddData.bookOverUnder??null; if(pt!==null) outcome.point=Number(pt); }
+        bmMap[bmKey].markets[mkey].outcomes.push(outcome);
+      }
+    }
+    addOdd('points-home-game-ml-home','h2h',homeTeam);
+    addOdd('points-away-game-ml-away','h2h',awayTeam);
+    addOdd('points-home-game-sp-home','spreads',homeTeam);
+    addOdd('points-away-game-sp-away','spreads',awayTeam);
+    addOdd('points-all-game-ou-over','totals','over');
+    addOdd('points-all-game-ou-under','totals','under');
+    return {id:ev.eventID,home_team:homeTeam,away_team:awayTeam,commence_time:ev.status?.startsAt,
+      bookmakers:Object.values(bmMap).map(bm=>({key:bm.key,title:bm.title,markets:Object.values(bm.markets)}))};
+  });
+  oddsCacheTime=now;
+  return oddsCache;
+}
+
+function findMatchingOddsEvent(events,homeName,awayName){
+  const h=normTeam(homeName), a=normTeam(awayName);
+  return events.find(ev=>normTeam(ev.home_team)===h&&normTeam(ev.away_team)===a)||
+         events.find(ev=>normTeam(ev.home_team).includes(h.split(' ').pop())&&normTeam(ev.away_team).includes(a.split(' ').pop()))||null;
+}
+
+function getBookmakerPriorityIndex(key=''){
+  const low=key.toLowerCase();
+  const idx=BOOKMAKER_PRIORITY.findIndex(p=>low.includes(p));
+  return idx===-1?999:idx;
+}
+function sortBookmakersByPriority(bms){ return [...bms].sort((a,b)=>getBookmakerPriorityIndex(a.key)-getBookmakerPriorityIndex(b.key)); }
+function getBookmakerDisplayName(key,title){ const n={bet365:'Bet365',betsson:'Betsson',stake:'Stake'}; return n[key?.toLowerCase()]||title||key||'—'; }
+function findOutcomeByTeamName(outcomes,teamName){ const t=normTeam(teamName); return outcomes.find(o=>normTeam(o.name)===t)||outcomes.find(o=>normTeam(o.name).includes(t.split(' ').pop()))||null; }
+
+/* ── Side recommendation con líneas alternativas conservadoras ──
+   • Si spread oficial <= 6 pts y razonable → recomienda directo
+   • Si spread oficial > 4 pts → busca línea alternativa al 50% del spread,
+     bajando de 0.5 en 0.5 hasta -3.5. Solo si edge >= alt + 1.5 pts.
+   • Si no hay alternativa válida → fallback a moneyline
+*/
+function selectSideRecommendation(bookmakers,preferredSide,estimatedMargin=null){
+  const ordered=sortBookmakersByPriority(bookmakers);
+  const margin=Number(estimatedMargin), hasMargin=!Number.isNaN(margin)&&estimatedMargin!==null;
+  const marginAbs=hasMargin?Math.abs(margin):0;
+  for(const bm of ordered){
+    const h2h=bm?.markets?.find(m=>m?.key==='h2h');
+    const spreads=bm?.markets?.find(m=>m?.key==='spreads');
+    const mlOut=findOutcomeByTeamName(h2h?.outcomes||[],preferredSide);
+    const spOut=findOutcomeByTeamName(spreads?.outcomes||[],preferredSide);
+    const mlPrice=toNumber(mlOut?.price), spPrice=toNumber(spOut?.price), spPoint=toNumber(spOut?.point);
+    const playableML=mlOut&&mlPrice>=1.5;
+    const playableSP=spOut&&spPrice>=1.5&&spPoint!==null;
+    if(!playableML&&!playableSP) continue;
+    /* Prioridad: ML si cumple umbral. Solo si no cumple, evaluar spread. */
+    if(playableML) return {type:'moneyline',bookmakerKey:bm.key,bookmakerTitle:bm.title,side:preferredSide,label:`${preferredSide} gana`,odds:mlPrice,impliedProbability:impliedProbabilityFromDecimal(mlPrice)};
+    if(playableSP&&hasMargin&&marginAbs>=3){
+      const spAbs=Math.abs(spPoint);
+      /* --- Si margen cubre spread oficial, usar línea oficial --- */
+      const reasonable=spPoint>0||spAbs<=Math.max(1.5,marginAbs-1.5);
+      if(reasonable&&spAbs<=6) return {type:'spread',bookmakerKey:bm.key,bookmakerTitle:bm.title,side:preferredSide,line:spPoint,label:`${preferredSide} ${spPoint>0?`+${spPoint}`:spPoint}`,odds:spPrice,impliedProbability:impliedProbabilityFromDecimal(spPrice)};
+      /* --- Spread agresivo (>4 pts): busca línea alternativa conservadora --- */
+      if(spAbs>4){
+        /* Empieza en 50% del spread oficial, baja de 0.5 en 0.5 hasta -3.5 */
+        const altStart=Math.max(-3.5,Math.ceil((spPoint*0.5)/0.5)*0.5);
+        for(let alt=altStart;alt>=spPoint&&alt<=-3.5;alt=parseFloat((alt-0.5).toFixed(1))){
+          const altAbs=Math.abs(alt);
+          /* Edge debe cubrir la línea alternativa con 1.5 pts de buffer */
+          if(marginAbs>=altAbs+1.5){
+            const diffFromOfficial=Math.abs(spPoint-alt);
+            /* Precio estimado: más conservadora la línea → cuota más baja */
+            const estP=Math.min(1.90,Math.max(1.55,spPrice-diffFromOfficial*0.04));
+            if(estP>=1.55) return {type:'spread',bookmakerKey:bm.key,bookmakerTitle:bm.title,side:preferredSide,line:alt,
+              label:`${preferredSide} ${alt>0?`+${alt}`:alt}`,odds:Math.round(estP*100)/100,
+              impliedProbability:impliedProbabilityFromDecimal(estP),isAltLine:true};
+          }
+        }
+      }
+    }
+    if(playableSP) return {type:'spread',bookmakerKey:bm.key,bookmakerTitle:bm.title,side:preferredSide,line:spPoint,label:`${preferredSide} ${spPoint>0?`+${spPoint}`:spPoint}`,odds:spPrice,impliedProbability:impliedProbabilityFromDecimal(spPrice)};
+  }
+  return null;
+}
+
+function selectTotalRecommendation(bookmakers,direction,projectedTotal){
+  const ordered=sortBookmakersByPriority(bookmakers);
+  for(const bm of ordered){
+    const totals=bm?.markets?.find(m=>m?.key==='totals');
+    const out=(totals?.outcomes||[]).find(o=>o.name?.toLowerCase()===direction.toLowerCase());
+    if(!out) continue;
+    const price=toNumber(out.price), point=toNumber(out.point);
+    if(!price||price<1.5||point===null) continue;
+    if(projectedTotal!==null){ const diff=direction==='over'?projectedTotal-point:point-projectedTotal; if(diff>=3) return {type:'total',bookmakerKey:bm.key,bookmakerTitle:bm.title,direction,line:point,label:`${direction==='over'?'Más de':'Menos de'} ${point} pts`,odds:price,impliedProbability:impliedProbabilityFromDecimal(price)}; }
+  }
+  return null;
+}
+
+/* ── buildOddsRecommendation (lógica IDÉNTICA al original) ── */
+function buildOddsRecommendation({oddsEvent,awayName,homeName,awayEdge,homeEdge,projectedTotal,isVolatile=false,forceTotals=false}){
+  if(!oddsEvent?.bookmakers?.length) return {selection:null,strength:{level:'Sin datos',stake:'—'},reason:'No se encontraron cuotas para este partido.',nobet:true};
+  const edgeDiff=Math.abs(awayEdge-homeEdge);
+  const favSide=awayEdge>homeEdge?awayName:homeEdge>awayEdge?homeName:null;
+  const estMargin=edgeDiff*2.5;
+  let selection=null;
+  if(!forceTotals&&edgeDiff>=2&&favSide){
+    selection=selectSideRecommendation(oddsEvent.bookmakers,favSide,estMargin);
+  }
+  if((!selection&&projectedTotal!==null)&&(isVolatile||forceTotals||edgeDiff<2)){
+    const totDir=projectedTotal>220?'over':projectedTotal<210?'under':null;
+    if(totDir) selection=selectTotalRecommendation(oddsEvent.bookmakers,totDir,projectedTotal);
+  }
+  if(!selection) return {selection:null,strength:{level:'Sin valor',stake:'—'},reason:'No hay cuota con valor suficiente según el edge estadístico.',nobet:true};
+  const odds=selection.odds; let level='Débil',stake='0.5u';
+  if(edgeDiff>=3&&odds>=1.7){level='Fuerte';stake='2u';} else if(edgeDiff>=2&&odds>=1.6){level='Medio';stake='1u';}
+  const mkt=selection.type==='spread'?'Spread':selection.type==='total'?'Total':'Moneyline';
+  const altNote=selection.isAltLine?' (línea alternativa)':'';
+  return {selection,strength:{level,stake},reason:`Mercado: ${mkt}${altNote} · Casa: ${getBookmakerDisplayName(selection.bookmakerKey,selection.bookmakerTitle)} · Edge: ${edgeDiff} pts`};
+}
+
+/* ── Injury alert ── */
+function calcInjuryPenalty(injuriesData,teamName,roster){
+  const keyNames=roster.slice(0,5).map(p=>normTeam(p.displayName||''));
+  let penalty=0; const outPlayers=[];
+  const teamInj=injuriesData.find(t=>normTeam(t.team?.displayName||'').includes(normTeam(teamName).split(' ').pop()));
+  if(!teamInj) return {penalty:0,outPlayers:[]};
+  for(const inj of (teamInj.injuries||[])){
+    const pName=normTeam(inj.athlete?.displayName||''), status=(inj.status||'').toLowerCase();
+    const isKey=keyNames.some(k=>k.includes(pName.split(' ').pop())||pName.includes(k.split(' ').pop()));
+    if(isKey&&(status==='out'||status.includes('out'))){ penalty+=1; outPlayers.push(inj.athlete?.displayName||''); }
+  }
+  return {penalty,outPlayers};
+}
+
+function getTeamInjuries(injuriesData,teamName){
+  return injuriesData.find(t=>normTeam(t.team?.displayName||'').includes(normTeam(teamName).split(' ').pop()))?.injuries||[];
+}
+
+function getKeyPlayerNamesFromCompetitor(comp){
+  const leaders=comp?.leaders||[];
+  const names=new Set();
+  for(const cat of leaders){
+    const leader=cat?.leaders?.[0]?.athlete?.displayName;
+    if(leader) names.add(leader);
+  }
+  return [...names];
+}
+
+async function playerRecentAvailability(schedule,teamId,playerName,gameDate,lookback=5){
+  const events=(schedule?.events||[])
+    .filter(ev=>ev.competitions?.[0]?.status?.type?.state==='post'&&new Date(ev.date||'')<new Date(gameDate||Date.now()))
+    .sort((a,b)=>new Date(b.date)-new Date(a.date))
+    .slice(0,lookback);
+  let activeGames=0, checked=0;
+  for(const ev of events){
+    try{
+      const sum=await fetchGameSummary(ev.id);
+      const boxPlayers=sum?.boxscore?.players||[];
+      const teamBox=boxPlayers.find(p=>String(p.team?.id||'')===String(teamId));
+      const athletes=teamBox?.statistics?.flatMap(s=>s?.athletes||[])||[];
+      const found=athletes.some(a=>normTeam(a?.athlete?.displayName||'')===normTeam(playerName));
+      checked++;
+      if(found) activeGames++;
+    }catch{}
+  }
+  return {activeGames,checked,recentlyActive:activeGames>=2};
+}
+
+/* ── RENDER: pick card (arriba del todo) ── */
+function renderPickCard(rec, leanText, autoNote, awayName, homeName, injuryAlerts){
+  const {selection,strength,reason,nobet}=rec;
+
+  /* alerta lesiones */
+  const alertHtml=injuryAlerts.length
+    ? `<div class="injury-alert">
+        <span class="injury-alert-icon">⚠️</span>
+        <div>
+          <div class="injury-alert-title">Alerta de lesiones — favorito afectado</div>
+          <div class="injury-alert-text">${injuryAlerts.map(a=>`<strong>${escapeHtml(a.team)}</strong>: ${a.players.map(p=>escapeHtml(p)).join(', ')} fuera`).join(' · ')}</div>
+        </div>
+       </div>`
+    : '';
+
+  const badgeClass=nobet?'nobet':strength.level==='Fuerte'?'strong':strength.level==='Medio'?'medium':'weak';
+  const badgeIcon=nobet?'⊖':strength.level==='Fuerte'?'🔥':strength.level==='Medio'?'✅':'📊';
+
+  /* nota automática del original */
+  const autoNoteHtml=autoNote?`<div class="pick-autonote"><strong>Respaldo estadístico:</strong> ${escapeHtml(autoNote)}</div>`:'';
+  const leanHtml=leanText&&leanText!=='No bet'?`<div class="pick-lean">${escapeHtml(leanText)}</div>`:'';
+
+  if(nobet||!selection) return `${alertHtml}${autoNoteHtml}
+    <div class="pick-card no-pick">
+      <div class="pick-card-header"><span class="pick-badge nobet">${badgeIcon} Sin pick</span></div>
+      <p class="pick-nobet-text">${escapeHtml(reason)}</p>
+    </div>`;
+
+  const altNote=selection.isAltLine?`<span class="pick-chip">📐 Línea alt.</span>`:'';
+  return `${alertHtml}${autoNoteHtml}
+  <div class="pick-card has-pick">
+    <div class="pick-card-header">
+      <span class="pick-badge ${badgeClass}">${badgeIcon} Pick ${escapeHtml(strength.level)}</span>
+      ${leanHtml}
+    </div>
+    <div class="pick-main">
+      <div class="pick-selection">
+        <div class="pick-label">${escapeHtml(selection.label)}</div>
+        <div class="pick-meta">
+          <span class="pick-chip odds-chip">${escapeHtml(formatOddsDecimal(selection.odds))}</span>
+          <span class="pick-chip">🏦 ${escapeHtml(getBookmakerDisplayName(selection.bookmakerKey,selection.bookmakerTitle))}</span>
+          <span class="pick-chip">${escapeHtml(selection.type==='spread'?'Spread':selection.type==='total'?'Total':'Moneyline')}</span>
+          ${altNote}
+        </div>
+      </div>
+      <div class="pick-stake">
+        <div class="pick-stake-value">${escapeHtml(strength.stake)}</div>
+        <div class="pick-stake-label">Stake sugerido</div>
+      </div>
+    </div>
+    <div class="pick-reason">${escapeHtml(reason.replace(/^Mercado:[^·]+·\s*/,''))}</div>
+  </div>`;
+}
+
+/* ── RENDER: odds section ── */
+function renderOddsSection(oddsEvent,recommendation){
+  if(!oddsEvent?.bookmakers?.length) return `<div class="section-block"><div class="section-title">📊 Cuota usada en el pick</div><div class="section-empty">No se encontraron cuotas para este partido.</div></div>`;
+  const sel=recommendation?.selection;
+  if(!sel) return `<div class="section-block"><div class="section-title">📊 Cuota usada en el pick</div><div class="section-empty">No hay pick activo para mostrar cuota.</div></div>`;
+  return `<div class="section-block">
+    <div class="section-title">📊 Cuota usada en el pick</div>
+    <div class="pick-market-row">
+      <span class="pick-chip">Casa: ${escapeHtml(getBookmakerDisplayName(sel.bookmakerKey,sel.bookmakerTitle))}</span>
+      <span class="pick-chip">Cuota: ${escapeHtml(formatOddsDecimal(sel.odds))}</span>
+      <span class="pick-chip">Prob. implícita: ${escapeHtml(formatPercent(sel.impliedProbability))}</span>
+    </div>
+  </div>`;
+}
+
+/* ── RENDER: roster + lesionados ── */
+function renderLineupSection(awayRoster,homeRoster,injuriesData,awayName,homeName,awayAbbr,homeAbbr,lineupStatus='Lineup probable'){
+  function buildInjMap(teamName){
+    const teamInj=injuriesData.find(t=>normTeam(t.team?.displayName||'').includes(normTeam(teamName).split(' ').pop()));
+    const map={};
+    for(const inj of (teamInj?.injuries||[])){ map[normTeam(inj.athlete?.displayName||'')]=inj.status||'Active'; }
+    return map;
+  }
+  function splitRoster(roster,injMap){
+    const healthy=roster.filter(p=>!String(injMap[normTeam(p.displayName||'')]||'').toLowerCase().includes('out'));
+    const starters=healthy.slice(0,5);
+    const bench=healthy.slice(5,12);
+    const injured=roster.filter(p=>String(injMap[normTeam(p.displayName||'')]||'').toLowerCase().includes('out'));
+    return {starters,bench,injured};
+  }
+  function playerRows(roster,injMap){
+    if(!roster.length) return '<div class="section-empty">Sin datos de roster</div>';
+    return roster.map(p=>{
+      const pName=normTeam(p.displayName||''), rawStatus=injMap[pName]||'Active';
+      const sc=rawStatus.toLowerCase().replace(/\s+/g,'-');
+      const bc=sc.includes('out')?'out':sc.includes('day')?'day-to-day':sc.includes('quest')?'questionable':'';
+      return `<div class="player-row">
+        <span class="player-jersey">${escapeHtml(p.jersey||'')}</span>
+        <span class="player-name">${escapeHtml(p.displayName||'')}</span>
+        <span class="player-pos">${escapeHtml(p.position?.abbreviation||'')}</span>
+        ${bc?`<span class="injury-badge ${bc}">${escapeHtml(rawStatus)}</span>`:''}
+      </div>`;
+    }).join('')||'<div class="section-empty">Sin datos</div>';
+  }
+  const awayInjMap=buildInjMap(awayName), homeInjMap=buildInjMap(homeName);
+  const awaySplit=splitRoster(awayRoster,awayInjMap), homeSplit=splitRoster(homeRoster,homeInjMap);
+  return `<div class="section-block"><div class="section-title">🏀 ${escapeHtml(lineupStatus)} & lesionados</div>
+    <div class="lineup-grid">
+      <div class="lineup-col">
+        <div class="lineup-col-title">
+          <img class="lineup-col-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}" loading="lazy">
+          <span>${escapeHtml(awayName)}</span>
+        </div>
+        <div class="mini-title">Quinteto inicial</div>
+        ${playerRows(awaySplit.starters,awayInjMap)}
+        <div class="mini-title">Rotación</div>
+        ${playerRows(awaySplit.bench,awayInjMap)}
+        <div class="mini-title">Lesionados OUT</div>
+        ${playerRows(awaySplit.injured,awayInjMap)}
+      </div>
+      <div class="lineup-col">
+        <div class="lineup-col-title">
+          <img class="lineup-col-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}" loading="lazy">
+          <span>${escapeHtml(homeName)}</span>
+        </div>
+        <div class="mini-title">Quinteto inicial</div>
+        ${playerRows(homeSplit.starters,homeInjMap)}
+        <div class="mini-title">Rotación</div>
+        ${playerRows(homeSplit.bench,homeInjMap)}
+        <div class="mini-title">Lesionados OUT</div>
+        ${playerRows(homeSplit.injured,homeInjMap)}
+      </div>
+    </div>
+  </div>`;
+}
+
+/* ── RENDER: stat rows (grid, idéntico al original en estructura) ── */
+function buildStatRow(awayValue,label,homeValue,awayClass='',homeClass=''){
+  return `<div class="pregame-row">
+    <div class="away ${awayClass}">${awayValue}</div>
+    <div class="metric">${escapeHtml(label)}</div>
+    <div class="home ${homeClass}">${homeValue}</div>
+  </div>`;
+}
+
+function renderFormChips(games=[]){
+  if(!games.length) return '<span style="font-size:12px;color:#94a3b8">Sin datos</span>';
+  return `<div class="form-chips">${games.slice(0,5).map(g=>`<span class="form-chip ${g.result==='W'?'win':'loss'}">${g.result}</span>`).join('')}</div>`;
+}
+
+function renderMatchupSection(awayStats,homeStats,awayName,homeName){
+  const rc=compareNumbersHigherBetter(parseRecord(awayStats.record)?.pct??null,parseRecord(homeStats.record)?.pct??null);
+  const rsc=compareNumbersHigherBetter(toNumber(awayStats.pointsScoredRecent),toNumber(homeStats.pointsScoredRecent));
+  const rac=compareNumbersLowerBetter(toNumber(awayStats.pointsAllowedRecent),toNumber(homeStats.pointsAllowedRecent));
+  const adc=compareNumbersHigherBetter(toNumber(awayStats.adjustedDiffRecent),toNumber(homeStats.adjustedDiffRecent));
+  const vc=compareNumbersHigherBetter(awayStats.venueDiff,homeStats.venueDiff);
+  return `<div class="section-block"><div class="section-title">📈 Comparativa estadística</div>
+  <div class="pregame-shell"><div class="pregame-compare">
+    <div class="pregame-row pregame-head">
+      <div>${escapeHtml(awayName)}</div><div>Métrica</div><div>${escapeHtml(homeName)}</div>
+    </div>
+    ${buildStatRow(awayStats.recentFormHtml,'Forma reciente (últ. 5)',homeStats.recentFormHtml)}
+    ${buildStatRow(escapeHtml(awayStats.record),'Récord temporada',escapeHtml(homeStats.record),rc.away,rc.home)}
+    ${buildStatRow(escapeHtml(`${awayStats.conference} #${awayStats.position}`),'Conf. / Pos.',escapeHtml(`${homeStats.conference} #${homeStats.position}`))}
+    ${buildStatRow(escapeHtml(awayStats.context),'Contexto clasificatorio',escapeHtml(homeStats.context))}
+    ${buildStatRow(escapeHtml(awayStats.pointsScoredRecent),'Pts anotados (últ. 5)',escapeHtml(homeStats.pointsScoredRecent),rsc.away,rsc.home)}
+    ${buildStatRow(escapeHtml(awayStats.pointsAllowedRecent),'Pts recibidos (últ. 5)',escapeHtml(homeStats.pointsAllowedRecent),rac.away,rac.home)}
+    ${buildStatRow(escapeHtml(awayStats.adjustedDiffRecent),'Diferencial ajustado',escapeHtml(homeStats.adjustedDiffRecent),adc.away,adc.home)}
+    ${buildStatRow(escapeHtml(awayStats.rivalQuality),'Calidad de rivales',escapeHtml(homeStats.rivalQuality))}
+    ${buildStatRow(escapeHtml(awayStats.venueSplit),'Split de cancha',escapeHtml(homeStats.venueSplit),vc.away,vc.home)}
+    ${buildStatRow(escapeHtml(awayStats.teamStyle),'Perfil ofensivo/defensivo',escapeHtml(homeStats.teamStyle))}
+    ${buildStatRow(escapeHtml(awayStats.b2b),'Back-to-back',escapeHtml(homeStats.b2b))}
+  </div></div></div>`;
+}
+
+/* ── Load scoreboard ── */
+async function loadNBAGames(){
+  statusEl.textContent='Cargando partidos NBA...';
+  try{
+    const datesToTry=[];
+    const now=new Date();
+    for(let i=0;i<5;i++){
+      const dt=new Date(now);
+      dt.setUTCDate(now.getUTCDate()+i);
+      datesToTry.push(toYYYYMMDD(dt));
+    }
+    let data=null;
+    for(const d of datesToTry){
+      const tryData=await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}`);
+      if((tryData?.events||[]).length){ data=tryData; break; }
+      if(!data) data=tryData;
+    }
+    if(!data) data=await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
+    CURRENT_SEASON=Number(data?.season?.year)||CURRENT_SEASON;
+    const events=data?.events||[];
+    scoreboardCache=events;
+    if(!events.length){ statusEl.textContent='Sin partidos disponibles.'; gamesContainer.innerHTML='<div class="empty-state"><p>No hay juegos disponibles en los próximos días.</p></div>'; return; }
+    statusEl.textContent=`Se cargaron ${events.length} partidos NBA`;
+    gamesContainer.innerHTML='';
+    for(const event of events){
+      const comp=event.competitions?.[0]||null;
+      const comps=comp?.competitors||[];
+      const home=comps.find(t=>t.homeAway==='home'), away=comps.find(t=>t.homeAway==='away');
+      const homeName=home?.team?.displayName||'Local', awayName=away?.team?.displayName||'Visitante';
+      const homeAbbr=home?.team?.abbreviation||'', awayAbbr=away?.team?.abbreviation||'';
+      const homeScore=typeof home?.score==='object'?home.score?.displayValue??'—':home?.score??'—';
+      const awayScore=typeof away?.score==='object'?away.score?.displayValue??'—':away?.score??'—';
+      const rawStatus=event.status?.type?.description||'Sin estado', gameStatus=formatStatusText(rawStatus);
+      const period=event.status?.period||null, clock=event.status?.displayClock||'', state=event.status?.type?.state||'';
+      const isFinal=state==='post'||gameStatus==='Finalizado', isLive=state==='in'||gameStatus==='En progreso';
+      let badgeText, badgeClass='is-scheduled';
+      if(isFinal){ badgeText='Finalizado'; badgeClass='is-final'; }
+      else if(isLive){ badgeText=`En progreso · Q${period||'—'} · ${clock}`.trim(); badgeClass=''; }
+      else { badgeText=`Programado · ${formatGameTime(event.date)}`; }
+      const card=document.createElement('article');
+      card.className='game-card';
+      card.innerHTML=`
+        <div class="game-top"><span class="game-status">${isLive?'🔴 EN VIVO':'📅 NBA'}</span><span class="game-date">${new Date(event.date).toLocaleDateString('es-CL',{weekday:'short',month:'short',day:'numeric'})}</span></div>
+        <div class="teams">
+          <div class="team-row"><div class="team-row-left"><img class="team-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}" loading="lazy" width="30" height="30"><span class="team-name">${escapeHtml(awayName)}</span></div>${(isFinal||isLive)?`<span class="team-score">${escapeHtml(String(awayScore))}</span>`:''}</div>
+          <div class="team-row"><div class="team-row-left"><img class="team-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}" loading="lazy" width="30" height="30"><span class="team-name">${escapeHtml(homeName)}</span></div>${(isFinal||isLive)?`<span class="team-score">${escapeHtml(String(homeScore))}</span>`:''}</div>
+        </div>
+        <span class="live-extra ${badgeClass}">${escapeHtml(badgeText||'')}</span>
+        <div class="game-actions"><button class="analyze-btn" data-game-id="${escapeHtml(String(event.id))}">
+          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Analizar partido
+        </button></div>`;
+      gamesContainer.appendChild(card);
+    }
+  }catch(err){ console.error(err); statusEl.textContent='Error al cargar partidos'; gamesContainer.innerHTML='<div class="empty-state"><p>No se pudo cargar la API de ESPN.</p></div>'; }
+}
+
+/* ── Analyze game ── */
+async function analyzeGame(gameId){
+  if(!analysisPanel) return;
+  openModal();
+  analysisPanel.innerHTML=`<div class="loading-state"><div class="loading-spinner"></div><p>Cargando análisis pregame...</p></div>`;
+  if(modalTeamsHdr) modalTeamsHdr.innerHTML='<span>Análisis Pregame</span>';
+  try{
+    const summaryResult=await fetchGameSummary(gameId);
+    const scoreboardEvent=findGameInScoreboardCache(gameId);
+    const summaryData=summaryResult||buildFallbackSummaryFromScoreboardEvent(scoreboardEvent);
+    const competitors=getCompetitorsFromEventLike(summaryData);
+    if(!competitors.length){ analysisPanel.innerHTML='<div class="loading-state"><p>No se pudo abrir el pregame de este partido.</p></div>'; return; }
+    const comp=summaryData?.header?.competitions?.[0]||scoreboardEvent?.competitions?.[0]||{};
+    const home=competitors.find(t=>t.homeAway==='home'), away=competitors.find(t=>t.homeAway==='away');
+    if(!home||!away){ analysisPanel.innerHTML='<div class="loading-state"><p>No se pudo identificar local y visitante.</p></div>'; return; }
+    const homeName=home?.team?.displayName||'Local', awayName=away?.team?.displayName||'Visitante';
+    const homeAbbr=home?.team?.abbreviation||'', awayAbbr=away?.team?.abbreviation||'';
+    const homeTeamId=getTeamIdFromCompetitor(home), awayTeamId=getTeamIdFromCompetitor(away);
+    const gameDate=comp?.date?new Date(comp.date).toLocaleString('es-CL'):'Pendiente';
+    const gameTime=comp?.date?formatGameTime(comp.date):'';
+
+    if(modalTeamsHdr) modalTeamsHdr.innerHTML=`
+      <div class="modal-header-team"><img class="modal-header-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}"><span>${escapeHtml(awayName)}</span></div>
+      <span class="modal-header-vs">vs</span>
+      <div class="modal-header-team"><img class="modal-header-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}"><span>${escapeHtml(homeName)}</span></div>
+      <span class="modal-header-time">🕐 ${escapeHtml(gameTime)}</span>`;
+
+    const [standingsRes,awaySchedRes,homeSchedRes,oddsRes,awayRosterRes,homeRosterRes,injuriesRes]=await Promise.allSettled([
+      fetchConferenceStandingsSorted(),
+      fetchTeamSchedule(awayTeamId),
+      fetchTeamSchedule(homeTeamId),
+      fetchOddsApiEvents(),
+      fetchTeamRoster(awayTeamId),
+      fetchTeamRoster(homeTeamId),
+      fetchGameInjuries(gameId)
+    ]);
+
+    const standingsData=standingsRes.status==='fulfilled'?standingsRes.value:null;
+    const standingsLookup=standingsData?buildStandingsLookup(standingsData):createEmptyStandingsLookup();
+    const awaySchedule=awaySchedRes.status==='fulfilled'?awaySchedRes.value:null;
+    const homeSchedule=homeSchedRes.status==='fulfilled'?homeSchedRes.value:null;
+    const oddsEvents=oddsRes.status==='fulfilled'&&Array.isArray(oddsRes.value)?oddsRes.value:[];
+    const awayRoster=awayRosterRes.status==='fulfilled'?awayRosterRes.value:[];
+    const homeRoster=homeRosterRes.status==='fulfilled'?homeRosterRes.value:[];
+    const injuriesData=injuriesRes.status==='fulfilled'?injuriesRes.value:[];
+
+    let leagueProfilesMap={};
+    try{ leagueProfilesMap=standingsData?await getLeagueProfilesMap(standingsData):{}; }catch(e){ console.warn('League profiles failed:',e); }
+
+    const awayEntry=standingsLookup.byTeamId[String(awayTeamId)]||standingsLookup.byAbbr[awayAbbr.toLowerCase()]||standingsLookup.byName[awayName]||null;
+    const homeEntry=standingsLookup.byTeamId[String(homeTeamId)]||standingsLookup.byAbbr[homeAbbr.toLowerCase()]||standingsLookup.byName[homeName]||null;
+    const awayRecent5=getRecentFormFromSchedule(awaySchedule,awayTeamId,comp?.date,5,standingsLookup);
+    const homeRecent5=getRecentFormFromSchedule(homeSchedule,homeTeamId,comp?.date,5,standingsLookup);
+    const awayVenueSplit=getVenueSplitForm(awaySchedule,awayTeamId,comp?.date,'away',5);
+    const homeVenueSplit=getVenueSplitForm(homeSchedule,homeTeamId,comp?.date,'home',5);
+    const awayB2B=getB2BStatus(awaySchedule,awayTeamId,comp?.date);
+    const homeB2B=getB2BStatus(homeSchedule,homeTeamId,comp?.date);
+    const awayProfileRanked=leagueProfilesMap[String(awayTeamId)]||{offenseRank:null,defenseRank:null,label:'Ataque medio | Defensa media'};
+    const homeProfileRanked=leagueProfilesMap[String(homeTeamId)]||{offenseRank:null,defenseRank:null,label:'Ataque medio | Defensa media'};
+
+    const awayStats={
+      conference:awayEntry?.conference||'Pendiente',position:awayEntry?.conferencePosition||'-',
+      context:getContextFromConferencePosition(awayEntry?.conferencePosition,awayEntry?.clincher||null),
+      record:awayEntry?.record||'Pendiente',recentFormHtml:renderFormChips(awayRecent5.games),
+      pointsScoredRecent:formatOneDecimal(awayRecent5.scoredAvg),pointsAllowedRecent:formatOneDecimal(awayRecent5.allowedAvg),
+      adjustedDiffRecent:formatSignedOneDecimal(awayRecent5.adjustedDiffAvg),rivalQuality:getOpponentStrengthLabel(awayRecent5.opponentPctAvg),
+      venueSplit:`Fuera: ${awayVenueSplit.record}, margen ${formatSignedOneDecimal(awayVenueSplit.diffAvg)}`,venueDiff:awayVenueSplit.diffAvg,
+      teamStyle:awayProfileRanked.label,b2b:`${awayB2B.label} · ${awayB2B.detail}`
+    };
+    const homeStats={
+      conference:homeEntry?.conference||'Pendiente',position:homeEntry?.conferencePosition||'-',
+      context:getContextFromConferencePosition(homeEntry?.conferencePosition,homeEntry?.clincher||null),
+      record:homeEntry?.record||'Pendiente',recentFormHtml:renderFormChips(homeRecent5.games),
+      pointsScoredRecent:formatOneDecimal(homeRecent5.scoredAvg),pointsAllowedRecent:formatOneDecimal(homeRecent5.allowedAvg),
+      adjustedDiffRecent:formatSignedOneDecimal(homeRecent5.adjustedDiffAvg),rivalQuality:getOpponentStrengthLabel(homeRecent5.opponentPctAvg),
+      venueSplit:`Casa: ${homeVenueSplit.record}, margen ${formatSignedOneDecimal(homeVenueSplit.diffAvg)}`,venueDiff:homeVenueSplit.diffAvg,
+      teamStyle:homeProfileRanked.label,b2b:`${homeB2B.label} · ${homeB2B.detail}`
+    };
+
+    /* ── Edge calc base ── */
+    const awayRecordParsed=parseRecord(awayStats.record), homeRecordParsed=parseRecord(homeStats.record);
+    const awayRecentScoredNum=toNumber(awayStats.pointsScoredRecent), homeRecentScoredNum=toNumber(homeStats.pointsScoredRecent);
+    const awayRecentAllowedNum=toNumber(awayStats.pointsAllowedRecent), homeRecentAllowedNum=toNumber(homeStats.pointsAllowedRecent);
+    const awayAdjustedDiffNum=toNumber(awayStats.adjustedDiffRecent), homeAdjustedDiffNum=toNumber(homeStats.adjustedDiffRecent);
+    const awayVenueDiffNum=awayVenueSplit.diffAvg, homeVenueDiffNum=homeVenueSplit.diffAvg;
+
+    let awayEdge=0, homeEdge=0;
+    if(awayRecordParsed&&homeRecordParsed){ if(awayRecordParsed.pct>homeRecordParsed.pct) awayEdge+=2; if(homeRecordParsed.pct>awayRecordParsed.pct) homeEdge+=2; }
+    if(awayEntry?.conferencePosition&&homeEntry?.conferencePosition){ const ap=Number(awayEntry.conferencePosition),hp=Number(homeEntry.conferencePosition); if(!Number.isNaN(ap)&&!Number.isNaN(hp)){ if(ap<hp) awayEdge+=1; if(hp<ap) homeEdge+=1; } }
+    if(awayAdjustedDiffNum!==null&&homeAdjustedDiffNum!==null){ if(awayAdjustedDiffNum>homeAdjustedDiffNum) awayEdge+=2; if(homeAdjustedDiffNum>awayAdjustedDiffNum) homeEdge+=2; }
+    if(awayRecentAllowedNum!==null&&homeRecentAllowedNum!==null){ if(awayRecentAllowedNum<homeRecentAllowedNum) awayEdge+=1; if(homeRecentAllowedNum<awayRecentAllowedNum) homeEdge+=1; }
+    if(awayRecentScoredNum!==null&&homeRecentScoredNum!==null){ if(awayRecentScoredNum>homeRecentScoredNum) awayEdge+=1; if(homeRecentScoredNum>awayRecentScoredNum) homeEdge+=1; }
+    if(awayVenueDiffNum!==null&&homeVenueDiffNum!==null){ if(awayVenueDiffNum>homeVenueDiffNum) awayEdge+=1; if(homeVenueDiffNum>awayVenueDiffNum) homeEdge+=1; }
+    if(awayB2B.isB2B&&!homeB2B.isB2B) homeEdge+=1;
+    if(homeB2B.isB2B&&!awayB2B.isB2B) awayEdge+=1;
+
+    const awayKeyNames=getKeyPlayerNamesFromCompetitor(away);
+    const homeKeyNames=getKeyPlayerNamesFromCompetitor(home);
+    const awayInjuries=getTeamInjuries(injuriesData,awayName);
+    const homeInjuries=getTeamInjuries(injuriesData,homeName);
+    const injuryAlerts=[];
+
+    const applyInjuryImpact=async ({teamName,keyNames,injuries,schedule,teamId,isAway})=>{
+      for(const inj of injuries){
+        const status=String(inj.status||'').toLowerCase();
+        if(!status.includes('out')) continue;
+        const player=inj.athlete?.displayName||'';
+        const isKey=keyNames.some(k=>normTeam(k)===normTeam(player));
+        if(!isKey) continue;
+        const avail=await playerRecentAvailability(schedule,teamId,player,comp?.date,5);
+        const penalty=avail.recentlyActive?2:0.5;
+        if(isAway) awayEdge-=penalty; else homeEdge-=penalty;
+        injuryAlerts.push({
+          team:teamName,
+          players:[`${player} OUT (${avail.recentlyActive?'impacto alto':'equipo adaptado'})`]
+        });
+      }
+    };
+    await applyInjuryImpact({teamName:awayName,keyNames:awayKeyNames,injuries:awayInjuries,schedule:awaySchedule,teamId:awayTeamId,isAway:true});
+    await applyInjuryImpact({teamName:homeName,keyNames:homeKeyNames,injuries:homeInjuries,schedule:homeSchedule,teamId:homeTeamId,isAway:false});
+
+    /* ── leanText y autoNote IDÉNTICOS al original ── */
+    let edgeText='Matchup equilibrado', leanText='No bet';
+    if(awayEdge>=homeEdge+2){ edgeText=`Ventaja ${awayName}`; leanText=`Lean visitante: ${awayName}`; }
+    else if(homeEdge>=awayEdge+2){ edgeText=`Ventaja ${homeName}`; leanText=`Lean local: ${homeName}`; }
+
+    const awayWeakSched=awayRecent5.opponentPctAvg!==null&&awayRecent5.opponentPctAvg<0.45;
+    const homeWeakSched=homeRecent5.opponentPctAvg!==null&&homeRecent5.opponentPctAvg<0.45;
+    const awayStrongSched=awayRecent5.opponentPctAvg!==null&&awayRecent5.opponentPctAvg>=0.60;
+    const homeStrongSched=homeRecent5.opponentPctAvg!==null&&homeRecent5.opponentPctAvg>=0.60;
+
+    let autoNote='La comparación es competitiva y no deja una ventaja contundente.';
+    if(awayEdge>homeEdge){
+      autoNote=`${awayName} llega mejor por perfil global, forma ajustada y rendimiento reciente como visitante.`;
+      if(awayWeakSched) autoNote=`${awayName} llega mejor, pero parte de su forma reciente fue ante rivales más débiles.`;
+      if(homeStrongSched&&awayEdge-homeEdge<=2) autoNote=`${awayName} tiene números favorables, aunque ${homeName} enfrentó rivales más fuertes últimamente.`;
+    } else if(homeEdge>awayEdge){
+      autoNote=`${homeName} llega mejor por perfil global, forma ajustada y rendimiento reciente como local.`;
+      if(homeWeakSched) autoNote=`${homeName} llega mejor, pero parte de su forma reciente fue ante rivales más débiles.`;
+      if(awayStrongSched&&homeEdge-awayEdge<=2) autoNote=`${homeName} tiene mejores señales globales, pero ${awayName} viene de enfrentar rivales más fuertes últimamente.`;
+    }
+
+    /* ── Proyecciones y cuotas ── */
+    const projAway=awayRecentScoredNum!==null&&homeRecentAllowedNum!==null?(awayRecentScoredNum+homeRecentAllowedNum)/2:awayRecentScoredNum;
+    const projHome=homeRecentScoredNum!==null&&awayRecentAllowedNum!==null?(homeRecentScoredNum+awayRecentAllowedNum)/2:homeRecentScoredNum;
+    const projectedTotal=projAway!==null&&projHome!==null?projAway+projHome:null;
+
+    const matchingOddsEvent=findMatchingOddsEvent(oddsEvents,homeName,awayName);
+    const edgeDiff=Math.abs(awayEdge-homeEdge);
+    const isVolatile=edgeDiff<2;
+    const forceTotals=injuryAlerts.length>0&&edgeDiff<3;
+    const betRecommendation=buildOddsRecommendation({oddsEvent:matchingOddsEvent,awayName,homeName,awayEdge,homeEdge,projectedTotal,isVolatile,forceTotals});
+
+    const awayWinProb=Math.max(5,Math.min(95,Math.round(50+(awayEdge-homeEdge)*5)));
+    const homeWinProb=100-awayWinProb;
+    const edgeHtml=`<div class="section-block"><div class="section-title">⚖️ Edge estadístico (probabilidad de victoria)</div>
+      <div class="edge-row">
+        <div class="edge-team"><img style="width:22px;height:22px;object-fit:contain" src="${espnLogo(awayAbbr)}" alt=""><span style="font-size:13px;font-weight:700">${escapeHtml(awayName)}</span><strong style="font-size:16px;color:var(--nba-blue);margin-left:4px">${awayWinProb}%</strong></div>
+        <div class="edge-bar-wrap"><div class="edge-bar"><div class="edge-bar-fill" style="width:${awayWinProb}%"></div></div></div>
+        <div class="edge-team" style="flex-direction:row-reverse"><img style="width:22px;height:22px;object-fit:contain" src="${espnLogo(homeAbbr)}" alt=""><span style="font-size:13px;font-weight:700">${escapeHtml(homeName)}</span><strong style="font-size:16px;color:var(--nba-blue);margin-right:4px">${homeWinProb}%</strong></div>
+      </div>
+      ${projectedTotal!==null?`<div class="projected-total-row"><span>Total proyectado:</span><span class="projected-total-value">${formatOneDecimal(projectedTotal)} pts</span><span>· ${escapeHtml(awayName)} ${formatOneDecimal(projAway)} – ${formatOneDecimal(projHome)} ${escapeHtml(homeName)}</span></div>`:''}
+    </div>`;
+
+    /* ── Ensamble final: PICK ARRIBA ── */
+    analysisPanel.innerHTML=`
+      <div style="font-size:12px;color:#94a3b8;font-weight:600;margin-bottom:4px">${escapeHtml(gameDate)}</div>
+      ${renderPickCard(betRecommendation,leanText,autoNote,awayName,homeName,injuryAlerts)}
+      ${edgeHtml}
+      ${renderOddsSection(matchingOddsEvent,betRecommendation)}
+      ${renderLineupSection(awayRoster,homeRoster,injuriesData,awayName,homeName,awayAbbr,homeAbbr,comp?.status?.type?.state==='pre'?'Lineup probable':'Lineup confirmado')}
+      ${renderMatchupSection(awayStats,homeStats,awayName,homeName)}`;
+
+  }catch(err){ console.error(err); analysisPanel.innerHTML=`<div class="loading-state"><p>Error al cargar el análisis: ${escapeHtml(err.message)}</p></div>`; }
+}
+
+/* ── Events ── */
+gamesContainer?.addEventListener('click',ev=>{ const btn=ev.target.closest('.analyze-btn'); if(!btn) return; const id=btn.dataset.gameId; if(id) analyzeGame(id); });
+modalCloseBtn?.addEventListener('click',closeModal);
+modalCloseBg?.addEventListener('click',closeModal);
+document.addEventListener('keydown',ev=>{ if(ev.key==='Escape') closeModal(); });
+
+loadNBAGames();
