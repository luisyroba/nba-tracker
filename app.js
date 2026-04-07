/* NBA Pregame Scout · app.js — v7
   Fixes v7:
   - season=2026 en standings y schedule (datos actuales)
   - B2B: compara horas (< 30h) en lugar de fecha calendario
   - Clincher: usa valor numérico (1=x,2=y,3=z,4=e) como fallback si displayValue falla
   - Record desde wins/losses directos (más fiables que Division Standings)
   - Últimos 5: score leído desde score.value correctamente con season=2026
   - Pick lock: se guarda al primer análisis pregame y no se sobreescribe si el partido ya empezó
   - Eliminada tabla de cuotas por casa (sólo pick card muestra la cuota)
   - Eliminadas métricas pts temporada de la tabla (se usan internamente para perfil)
*/

const statusEl      = document.getElementById('status');
const gamesContainer= document.getElementById('games');
const analysisPanel = document.getElementById('analysis-panel');
const modal         = document.getElementById('game-modal');
const modalCloseBtn = document.getElementById('modal-close');
const modalCloseBg  = document.getElementById('modal-close-bg');
const modalTeamsHdr = document.getElementById('modal-teams-header');
const lastUpdatedEl = document.getElementById('last-updated');

const ODDS_API_KEY  = '987635aba320e6bdebcf265db26707ae';
const BM_DISPLAY    = {fanduel:'FanDuel',draftkings:'DraftKings',pointsbet:'PointsBet',unibet:'Unibet',caesars:'Caesars',betmgm:'BetMGM',espnbet:'ESPN Bet',williamhill:'William Hill',bovada:'Bovada',mybookieag:'MyBookie',betonlineag:'BetOnline',bet365:'Bet365',betsson:'Betsson',stake:'Stake'};
const NBA_SEASON    = '2026';

/* Pick lock: {[gameId]: pickResult} — se guarda antes de que empiece el partido */
const pickLockStore = {};

let oddsCache = null, oddsCacheTime = 0, scoreboardCache = [];

/* ── Modal ── */
function openModal() { modal?.classList.remove('hidden'); modal?.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
function closeModal(){ modal?.classList.add('hidden');   modal?.setAttribute('aria-hidden','true');  document.body.style.overflow=''; }
modalCloseBtn?.addEventListener('click', closeModal);
modalCloseBg?.addEventListener('click', closeModal);
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

/* ── Timestamp ── */
function updateTimestamp(){
  if(!lastUpdatedEl) return;
  const t = new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  lastUpdatedEl.textContent = `Última actualización: ${t}`;
}

/* ── Utils ── */
function escapeHtml(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function toNum(v){ if(v===null||v===undefined) return null; if(typeof v==='number') return Number.isNaN(v)?null:v; const n=Number(String(v).replace(/[^\d.-]/g,'')); return Number.isNaN(n)?null:n; }
function parseRec(t){ if(!t||typeof t!=='string') return null; const p=t.split('-'); if(p.length<2) return null; const w=Number(p[0]),l=Number(p[1]); return (Number.isNaN(w)||Number.isNaN(l))?null:{w,l,pct:w/(w+l||1)}; }
function avg(arr){ const f=arr.filter(v=>v!==null&&!Number.isNaN(v)); return f.length?f.reduce((s,v)=>s+v,0)/f.length:null; }
function fmt1(v){ if(v===null||v===undefined||Number.isNaN(Number(v))) return '—'; return Number(v).toFixed(1); }
function fmtS(v){ if(v===null||v===undefined||Number.isNaN(Number(v))) return '—'; return Number(v)>0?`+${Number(v).toFixed(1)}`:Number(v).toFixed(1); }
function fmtO(v){ if(v===null||Number.isNaN(Number(v))) return '—'; return Number(v).toFixed(2); }
function fmtP(v){ if(v===null||Number.isNaN(Number(v))) return '—'; return `${(Number(v)*100).toFixed(1)}%`; }
function norm(n){ return String(n||'').toLowerCase().replace(/\s+/g,' ').trim(); }
function cmpH(a,b){ const an=toNum(a),bn=toNum(b); if(an===null||bn===null) return {a:'',b:''}; return an>bn?{a:'edge',b:''}:bn>an?{a:'',b:'edge'}:{a:'',b:''}; }
function cmpL(a,b){ const an=toNum(a),bn=toNum(b); if(an===null||bn===null) return {a:'',b:''}; return an<bn?{a:'edge',b:''}:bn<an?{a:'',b:'edge'}:{a:'',b:''}; }
function implP(v){ return (!v||Number(v)<=1)?null:1/Number(v); }
function espnLogo(abbr){ return abbr?`https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png`:''; }
function fmtTime(d){ try{ return new Date(d).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}); }catch{ return ''; } }
function confLabel(n){ const l=String(n||'').toLowerCase(); return l.includes('east')?'Este':l.includes('west')?'Oeste':'NBA'; }
async function fetchJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

/* ── Standings lookup (season 2026) ── */
function buildStandingsLk(data){
  const lk={byId:{},byAbbr:{}};
  if(!data?.children) return lk;
  for(const conf of data.children){
    const confName=confLabel(conf?.name||'');
    for(const div of (conf.children||[])){
      for(const entry of (div.standings?.entries||[])){
        const team=entry.team||{};
        const tid=String(team.id||'');
        const abbr=(team.abbreviation||'').toLowerCase();
        const sm={};
        for(const s of (entry.stats||[])) sm[s.name]=s;
        /* Record: wins/losses directos son los más fiables */
        const wins=toNum(sm['wins']?.value);
        const losses=toNum(sm['losses']?.value);
        const record=(wins!==null&&losses!==null)?`${wins}-${losses}`:(sm['Division Standings']?.displayValue||'—');
        const winPct=toNum(sm['winPercent']?.value);
        const pos=toNum(sm['playoffSeed']?.value);
        /* Clincher: displayValue puede ser '' para equipos sin confirmar. Valor numérico: 1=x,2=y,3=z,4=e */
        const clDisp=sm['clincher']?.displayValue||'';
        const clVal=toNum(sm['clincher']?.value);
        let clincher=clDisp||null;
        if(!clincher&&clVal!==null){ clincher=clVal===1?'x':clVal===2?'y':clVal===3?'z':clVal===4?'e':null; }
        const ptsFor=toNum(sm['avgPointsFor']?.value);
        const ptsAg=toNum(sm['avgPointsAgainst']?.value);
        const homeRec=sm['Home']?.displayValue||'—';
        const roadRec=sm['Road']?.displayValue||'—';
        const last10=sm['Last Ten Games']?.displayValue||'—';
        const obj={tid,abbr,name:team.displayName||'',conference:confName,pos,clincher,record,winPct,ptsFor,ptsAg,homeRec,roadRec,last10};
        if(tid) lk.byId[tid]=obj;
        if(abbr) lk.byAbbr[abbr]=obj;
      }
    }
  }
  return lk;
}

/* ── Context label ── */
function ctxLabel(pos,clincher){
  if(clincher==='e') return {label:'Eliminado',cls:'out'};
  if(clincher==='z') return {label:'Mejor récord',cls:'playoffs'};
  if(clincher==='y') return {label:'Líder División',cls:'playoffs'};
  if(clincher==='x') return {label:'✅ Clasificado',cls:'playoffs'};
  if(pos===null) return {label:'—',cls:'neutral'};
  const p=Number(pos);
  if(p<=6) return {label:`#${p} Playoffs`,cls:'playoffs'};
  if(p<=10) return {label:`#${p} Play-In`,cls:'playin'};
  return {label:`#${p} Fuera playoffs`,cls:'out'};
}

/* ── Recent games from schedule ── */
function extractRecent(schedule, teamId, gameDate, n){
  const events=schedule?.events||[];
  const tid=String(teamId);
  const cutoff=gameDate?new Date(gameDate):new Date();
  const played=events.filter(ev=>{
    const comp=ev.competitions?.[0]||{};
    const state=comp.status?.type?.state||'';
    return state==='post' && new Date(ev.date||'')<cutoff;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,n);

  return played.map(ev=>{
    const comp=ev.competitions?.[0]||{};
    const comps=comp.competitors||[];
    const me=comps.find(c=>String(c.team?.id||c.id||'')===tid);
    const opp=comps.find(c=>String(c.team?.id||c.id||'')!==tid);
    if(!me||!opp) return null;
    const gs=c=>{ const s=c.score; if(!s) return null; return typeof s==='object'?toNum(s.value??s.displayValue):toNum(s); };
    const myP=gs(me), oppP=gs(opp);
    if(myP===null||oppP===null) return null;
    return {result:myP>oppP?'W':'L',myP,oppP,oppId:String(opp.team?.id||opp.id||''),isHome:me.homeAway==='home'};
  }).filter(Boolean);
}

/* ── B2B: < 30 horas desde último partido jugado ── */
function getB2B(schedule, teamId, gameDate){
  const events=schedule?.events||[];
  const tid=String(teamId);
  const gd=gameDate?new Date(gameDate):new Date();
  const MS_30H=30*60*60*1000;
  const prev=events.filter(ev=>{
    const comp=ev.competitions?.[0]||{};
    const state=comp.status?.type?.state||'';
    if(state!=='post') return false;
    const d=new Date(ev.date||'');
    if(d>=gd) return false;
    const plays=comp.competitors?.some(c=>String(c.team?.id||c.id||'')===tid);
    return plays && (gd-d)<MS_30H;
  });
  return prev.length>0?{isB2B:true,label:'⚠️ Back-to-back'}:{isB2B:false,label:'Descansado'};
}

/* ── Build team stats ── */
async function buildTeamStats(teamId, teamAbbr, gameDate, standingsLk){
  const entry=standingsLk.byId[String(teamId)]||standingsLk.byAbbr[(teamAbbr||'').toLowerCase()]||null;

  let schedule=null;
  try{ schedule=await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=${NBA_SEASON}`); }catch(e){}

  const recent=schedule?extractRecent(schedule,teamId,gameDate,10):[];
  const last5=recent.slice(0,5);

  const scored5=last5.map(g=>g.myP).filter(v=>v!==null);
  const allowed5=last5.map(g=>g.oppP).filter(v=>v!==null);
  const avgScored=avg(scored5);
  const avgAllowed=avg(allowed5);
  const avgDiff=(avgScored!==null&&avgAllowed!==null)?avgScored-avgAllowed:null;

  /* Diferencial ajustado por calidad rival */
  const adjDiffs=last5.map(g=>{
    if(g.myP===null||g.oppP===null) return null;
    const base=g.myP-g.oppP;
    const oppWp=standingsLk.byId[g.oppId]?.winPct??0.5;
    return base*(1+(oppWp-0.5)*0.4);
  }).filter(v=>v!==null);
  const adjDiff=avg(adjDiffs);

  /* Calidad de rivales últimos 7 */
  const recent7=recent.slice(0,7);
  const oppPcts=recent7.map(g=>standingsLk.byId[g.oppId]?.winPct??null).filter(v=>v!==null);
  const rivalPct=avg(oppPcts);
  const rivalLabel=rivalPct===null?'—':rivalPct>=0.60?'Rivales fuertes':rivalPct>=0.50?'Rivales medios':rivalPct>=0.40?'Rivales mixtos':'Rivales débiles';

  /* Split local/visita últimos 7 */
  const homeG=recent7.filter(g=>g.isHome);
  const awayG=recent7.filter(g=>!g.isHome);
  const splitStr=`Casa ${homeG.filter(g=>g.result==='W').length}/${homeG.length} · Visita ${awayG.filter(g=>g.result==='W').length}/${awayG.length}`;

  const b2b=schedule?getB2B(schedule,teamId,gameDate):{isB2B:false,label:'—'};

  /* Perfil ofensivo/defensivo desde stats temporada (oculto, sólo para label) */
  const sPtsFor=entry?.ptsFor??null;
  const sPtsAg=entry?.ptsAgainst??null;
  let teamStyle='—';
  if(sPtsFor!==null&&sPtsAg!==null){
    const off=sPtsFor>=116?'Ataque alto':sPtsFor>=111?'Ataque medio':'Ataque bajo';
    const def=sPtsAg<=110?'Def. sólida':sPtsAg<=115?'Def. media':'Def. débil';
    teamStyle=`${off} · ${def}`;
  }

  const formHtml=last5.length
    ?`<div class="form-chips">${last5.map(g=>`<span class="form-chip ${g.result==='W'?'win':'loss'}">${g.result}</span>`).join('')}</div>`
    :'<span style="font-size:12px;color:#94a3b8">Sin datos</span>';

  return {
    record:entry?.record||'—',
    last10:entry?.last10||'—',
    conference:entry?.conference||'—',
    pos:entry?.pos??null,
    clincher:entry?.clincher||null,
    homeRec:entry?.homeRec||'—',
    roadRec:entry?.roadRec||'—',
    winPct:entry?.winPct??null,
    formHtml,
    formGames:last5,
    avgScored,
    avgAllowed,
    avgDiff,
    adjDiff,
    rivalPct,
    rivalLabel,
    splitStr,
    isB2B:b2b.isB2B,
    b2bLabel:b2b.label,
    teamStyle,
    seasonPtsFor:sPtsFor,
    seasonPtsAg:sPtsAg,
  };
}

/* ── Odds API (sportsgameodds) ── */
async function fetchOddsEvents(){
  const now=Date.now();
  if(oddsCache&&now-oddsCacheTime<3600000) return oddsCache;
  try{
    const json=await fetchJSON(`https://api.sportsgameodds.com/v2/events?leagueID=NBA&oddsAvailable=true&apiKey=${ODDS_API_KEY}`);
    if(!json?.success||!Array.isArray(json?.data)) return [];
    oddsCache=json.data.map(ev=>{
      const homeTeam=ev.teams?.home?.names?.long||'';
      const awayTeam=ev.teams?.away?.names?.long||'';
      const odds=ev.odds||{};
      const bmMap={};
      function addOdd(oddID,mkey,oname){
        const oddData=odds[oddID];
        if(!oddData?.byBookmaker) return;
        const bookSpread=oddData.bookSpread??null;
        const bookOU=oddData.bookOverUnder??null;
        for(const [bmKey,bmData] of Object.entries(oddData.byBookmaker)){
          if(!bmData?.available) continue;
          const rawOdds=Number(bmData.odds);
          if(!rawOdds||Number.isNaN(rawOdds)) continue;
          let price=rawOdds>0?rawOdds/100+1:rawOdds<0?100/Math.abs(rawOdds)+1:null;
          if(!price||price<1.01) continue;
          const bk=bmKey.toLowerCase();
          if(!bmMap[bk]) bmMap[bk]={key:bk,title:bmKey,markets:{}};
          if(!bmMap[bk].markets[mkey]) bmMap[bk].markets[mkey]={key:mkey,outcomes:[]};
          const out={name:oname,price};
          if(mkey==='spreads'){ const line=bmData.spread!==undefined?Number(bmData.spread):(bookSpread!==null?Number(bookSpread):null); if(line!==null) out.point=line; }
          if(mkey==='totals'){ const line=bmData.overUnder!==undefined?Number(bmData.overUnder):(bookOU!==null?Number(bookOU):null); if(line!==null) out.point=line; }
          bmMap[bk].markets[mkey].outcomes.push(out);
        }
      }
      addOdd('points-home-game-ml-home','h2h',homeTeam);
      addOdd('points-away-game-ml-away','h2h',awayTeam);
      addOdd('points-home-game-sp-home','spreads',homeTeam);
      addOdd('points-away-game-sp-away','spreads',awayTeam);
      addOdd('points-all-game-ou-over','totals','over');
      addOdd('points-all-game-ou-under','totals','under');
      return{id:ev.eventID,home_team:homeTeam,away_team:awayTeam,commence_time:ev.status?.startsAt,
        bookmakers:Object.values(bmMap).map(bm=>({key:bm.key,title:bm.title,markets:Object.values(bm.markets)}))};
    }).filter(ev=>ev.bookmakers.length>0);
    oddsCacheTime=now;
    return oddsCache;
  }catch(e){ console.error('OddsAPI:',e); return []; }
}

function findOddsEvent(events,homeName,awayName){
  const h=norm(homeName),a=norm(awayName);
  const city=n=>norm(n).split(' ').pop();
  return events.find(ev=>norm(ev.home_team)===h&&norm(ev.away_team)===a)
      ||events.find(ev=>norm(ev.home_team).includes(city(h))&&norm(ev.away_team).includes(city(a)))
      ||null;
}

function bmName(key,title){ return BM_DISPLAY[String(key||'').toLowerCase()]||title||key||'—'; }

function bestOdds(bms,teamName,market){
  let best=null,bestBm=null,bestLine=null;
  const t=norm(teamName),city=t.split(' ').pop();
  for(const bm of bms){
    const mkt=bm.markets?.find(m=>m.key===market);
    if(!mkt) continue;
    const out=mkt.outcomes?.find(o=>norm(o.name)===t)||mkt.outcomes?.find(o=>norm(o.name).includes(city));
    if(!out) continue;
    const price=toNum(out.price);
    if(!price||price<1.01) continue;
    if(best===null||price>best){best=price;bestBm=bm;bestLine=out.point??null;}
  }
  return best?{price:best,line:bestLine,bm:bestBm}:null;
}

function bestTotal(bms,direction){
  let best=null,bestBm=null,bestLine=null;
  for(const bm of bms){
    const mkt=bm.markets?.find(m=>m.key==='totals');
    const out=mkt?.outcomes?.find(o=>o.name?.toLowerCase()===direction);
    if(!out) continue;
    const price=toNum(out.price),line=toNum(out.point);
    if(!price||price<1.01||line===null) continue;
    if(best===null||price>best){best=price;bestBm=bm;bestLine=line;}
  }
  return best?{price:best,line:bestLine,bm:bestBm}:null;
}

/* ── Pick engine ── */
function buildPick({oddsEvent,awayName,homeName,awayStats,homeStats,injPenAway,injPenHome}){
  if(!oddsEvent?.bookmakers?.length) return {nobet:true,reason:'Sin cuotas disponibles para este partido.'};
  const bms=oddsEvent.bookmakers;

  let aScore=0,hScore=0;
  const aAdj=awayStats.adjDiff??awayStats.avgDiff;
  const hAdj=homeStats.adjDiff??homeStats.avgDiff;
  if(aAdj!==null) aScore+=aAdj*0.5;
  if(hAdj!==null) hScore+=hAdj*0.5;
  awayStats.formGames.forEach((g,i)=>{ aScore+=(g.result==='W'?1:-1)*(5-i)*0.4; });
  homeStats.formGames.forEach((g,i)=>{ hScore+=(g.result==='W'?1:-1)*(5-i)*0.4; });
  hScore+=2.5; /* ventaja local */
  const aRec=parseRec(awayStats.record),hRec=parseRec(homeStats.record);
  if(aRec&&hRec){ aScore+=(aRec.pct-0.5)*4; hScore+=(hRec.pct-0.5)*4; }
  if(awayStats.avgScored!==null&&homeStats.avgAllowed!==null) aScore+=(awayStats.avgScored-homeStats.avgAllowed)*0.15;
  if(homeStats.avgScored!==null&&awayStats.avgAllowed!==null) hScore+=(homeStats.avgScored-awayStats.avgAllowed)*0.15;
  if(awayStats.isB2B) aScore-=3.5;
  if(homeStats.isB2B) hScore-=3.5;
  aScore-=(injPenAway||0); hScore-=(injPenHome||0);

  const diff=aScore-hScore;
  const favSide=diff>0?awayName:diff<0?homeName:null;
  const edgeAbs=Math.abs(diff);
  if(!favSide||edgeAbs<1.5) return {nobet:true,reason:'Partido muy parejo — sin edge estadístico suficiente.',awayScore:Math.round(aScore*10)/10,homeScore:Math.round(hScore*10)/10};

  let projTotal=null;
  if(awayStats.avgScored!==null&&homeStats.avgAllowed!==null&&homeStats.avgScored!==null&&awayStats.avgAllowed!==null)
    projTotal=(awayStats.avgScored+homeStats.avgAllowed)/2+(homeStats.avgScored+awayStats.avgAllowed)/2;

  let selection=null;
  const estMargin=edgeAbs*2.2;
  if(edgeAbs>=3){
    const sp=bestOdds(bms,favSide,'spreads');
    if(sp&&sp.line!==null&&sp.price>=1.60){
      const spAbs=Math.abs(sp.line);
      if(sp.line>0||spAbs<=Math.max(2,estMargin-2))
        selection={type:'spread',side:favSide,line:sp.line,odds:sp.price,bm:sp.bm};
    }
    if(!selection){const ml=bestOdds(bms,favSide,'h2h');if(ml&&ml.price>=1.40)selection={type:'moneyline',side:favSide,odds:ml.price,bm:ml.bm};}
  }else{
    const ml=bestOdds(bms,favSide,'h2h');if(ml&&ml.price>=1.50)selection={type:'moneyline',side:favSide,odds:ml.price,bm:ml.bm};
  }
  if(!selection&&projTotal!==null){
    const dir=projTotal>223?'over':projTotal<208?'under':null;
    if(dir){const tot=bestTotal(bms,dir);if(tot&&Math.abs(projTotal-tot.line)>=3.5)selection={type:'total',direction:dir,line:tot.line,odds:tot.price,bm:tot.bm};}
  }
  if(!selection) return {nobet:true,reason:'Edge estadístico presente pero sin cuota con valor.',awayScore:Math.round(aScore*10)/10,homeScore:Math.round(hScore*10)/10};

  const impl=implP(selection.odds);
  const modelProb=edgeAbs>=6?0.70:edgeAbs>=4?0.65:edgeAbs>=2.5?0.60:0.55;
  const edgePct=impl?modelProb-impl:null;
  let strength='Débil',stake='0.5u',badgeCls='weak';
  if(edgeAbs>=5&&selection.odds>=1.65){strength='Fuerte';stake='2u';badgeCls='strong';}
  else if(edgeAbs>=3&&selection.odds>=1.55){strength='Medio';stake='1u';badgeCls='medium';}

  let label='';
  if(selection.type==='spread') label=`${favSide} ${selection.line>0?'+'+selection.line:selection.line}`;
  else if(selection.type==='total') label=`${selection.direction==='over'?'Más de':'Menos de'} ${selection.line} pts`;
  else label=`${favSide} ML`;

  const mktLabel=selection.type==='spread'?'Spread':selection.type==='total'?'Total':'Moneyline';
  return {nobet:false,selection,label,strength,stake,badgeCls,favSide,edgeAbs,modelProb,impl,edgePct,projTotal,
    reason:`${mktLabel} · ${bmName(selection.bm?.key,selection.bm?.title)} · Edge ${fmt1(edgeAbs)} pts`,
    awayScore:Math.round(aScore*10)/10,homeScore:Math.round(hScore*10)/10};
}

/* ── Injury penalty ── */
function calcInjury(injuriesData,teamName,roster){
  let penalty=0;const outPlayers=[],qtPlayers=[];
  const tNorm=norm(teamName).split(' ').pop();
  const teamInj=injuriesData?.find?.(t=>norm(t.team?.displayName||'').includes(tNorm));
  if(!teamInj) return {penalty,outPlayers,qtPlayers};
  const keyNames=roster.slice(0,7).map(p=>norm(p.displayName||''));
  for(const inj of (teamInj.injuries||[])){
    const pName=norm(inj.athlete?.displayName||'');
    const status=(inj.status||'').toLowerCase();
    const isKey=keyNames.some(k=>k.split(' ').pop()===pName.split(' ').pop());
    if(!isKey) continue;
    if(status.includes('out')){penalty+=2.5;outPlayers.push(inj.athlete?.displayName||'?');}
    else if(status.includes('day')){penalty+=0.8;qtPlayers.push(inj.athlete?.displayName||'?');}
    else if(status.includes('quest')){penalty+=0.4;qtPlayers.push(inj.athlete?.displayName||'?');}
  }
  return {penalty,outPlayers,qtPlayers};
}

/* ══════════════════════════════
   RENDER
   ══════════════════════════════ */

/* ── Pick card ── */
function renderPickCard(pick){
  if(pick.nobet){
    return `<div class="pick-card no-pick">
      <div class="pick-card-header"><span class="pick-badge nobet">🚫 Sin apuesta</span></div>
      <p class="pick-nobet-text">${escapeHtml(pick.reason)}</p>
    </div>`;
  }
  const impStr=pick.impl!==null?`Prob. implícita: ${fmtP(pick.impl)}`:'';
  const edgeStr=pick.edgePct!==null?` · Edge modelo: ${fmtP(pick.edgePct)}`:'';
  const totalStr=pick.projTotal!==null?`<span class="pick-total-note">Total proyectado: ${fmt1(pick.projTotal)} pts</span>`:'';
  const lockNote=pick.locked?`<span class="pick-lock-note">🔒 Pick pregame bloqueado</span>`:'';
  return `<div class="pick-card has-pick">
    <div class="pick-card-header">
      <span class="pick-badge ${pick.badgeCls}">${pick.strength==='Fuerte'?'🔥 Fuerte':pick.strength==='Medio'?'✅ Medio':'⚡ Débil'}</span>
      <span class="pick-stake-badge">${escapeHtml(pick.stake)}</span>
      ${lockNote}
    </div>
    <div class="pick-main">
      <span class="pick-selection">${escapeHtml(pick.label)}</span>
      <span class="pick-odds">@${fmtO(pick.selection.odds)}</span>
    </div>
    <p class="pick-reason">${escapeHtml(pick.reason)}</p>
    ${impStr?`<p class="pick-implied">${escapeHtml(impStr+edgeStr)}</p>`:''}
    ${totalStr}
  </div>`;
}

/* ── Edge bar ── */
function renderEdgeBar(pick,awayName,homeName,awayAbbr,homeAbbr){
  const aS=pick.awayScore??0,hS=pick.homeScore??0;
  const total=Math.abs(aS)+Math.abs(hS)||1;
  const aPct=Math.max(5,Math.min(95,Math.round((aS/(aS+hS||1))*100)));
  return `<div class="section-block">
    <div class="section-title">⚖️ Edge estadístico</div>
    <div class="edge-row">
      <div class="edge-team">
        <img style="width:22px;height:22px;object-fit:contain" src="${espnLogo(awayAbbr)}" alt="">
        <span>${escapeHtml(awayName)}</span>
        <strong style="color:var(--nba-blue)">${aS>0?'+':''}${fmt1(aS)}</strong>
      </div>
      <div class="edge-bar-wrap"><div class="edge-bar"><div class="edge-bar-fill" style="width:${aPct}%"></div></div></div>
      <div class="edge-team" style="flex-direction:row-reverse">
        <img style="width:22px;height:22px;object-fit:contain" src="${espnLogo(homeAbbr)}" alt="">
        <span>${escapeHtml(homeName)}</span>
        <strong style="color:var(--nba-blue)">${hS>0?'+':''}${fmt1(hS)}</strong>
      </div>
    </div>
  </div>`;
}

/* ── Context ── */
function renderContext(awayStats,homeStats,awayName,homeName,awayAbbr,homeAbbr){
  const aC=ctxLabel(awayStats.pos,awayStats.clincher);
  const hC=ctxLabel(homeStats.pos,homeStats.clincher);
  function block(name,abbr,stats,ctx){
    return `<div class="context-team">
      <div class="context-team-header">
        <img class="context-team-logo" src="${espnLogo(abbr)}" alt="${escapeHtml(abbr)}" loading="lazy" width="24" height="24">
        <span class="context-team-name">${escapeHtml(name)}</span>
      </div>
      <span class="context-pill ${ctx.cls}">${escapeHtml(ctx.label)}</span>
      <span class="context-pill neutral">${escapeHtml(stats.conference)}</span>
      <span class="context-pill neutral">${escapeHtml(stats.record)}</span>
      ${stats.last10!=='—'?`<span class="context-pill neutral">Últ.10: ${escapeHtml(stats.last10)}</span>`:''}
      ${stats.isB2B?`<span class="context-pill b2b">Back-to-back</span>`:''}
    </div>`;
  }
  return `<div class="section-block">
    <div class="section-title">🏆 Contexto clasificatorio</div>
    <div class="context-grid">
      ${block(awayName,awayAbbr,awayStats,aC)}
      ${block(homeName,homeAbbr,homeStats,hC)}
    </div>
  </div>`;
}

/* ── Stats grid (sin pts temporada) ── */
function sRow(av,label,hv,ac='',hc=''){
  return `<div class="pregame-row">
    <div class="away ${ac}">${av}</div>
    <div class="metric">${escapeHtml(label)}</div>
    <div class="home ${hc}">${hv}</div>
  </div>`;
}
function renderStats(awayStats,homeStats,awayName,homeName){
  const rC=cmpH(parseRec(awayStats.record)?.pct,parseRec(homeStats.record)?.pct);
  const sC=cmpH(awayStats.avgScored,homeStats.avgScored);
  const aLC=cmpL(awayStats.avgAllowed,homeStats.avgAllowed);
  const dC=cmpH(awayStats.adjDiff??awayStats.avgDiff,homeStats.adjDiff??homeStats.avgDiff);
  return `<div class="section-block">
    <div class="section-title">📊 Comparativa estadística</div>
    <div class="pregame-shell"><div class="pregame-compare">
      <div class="pregame-row pregame-head">
        <div>${escapeHtml(awayName)}</div><div>Métrica</div><div>${escapeHtml(homeName)}</div>
      </div>
      ${sRow(awayStats.formHtml,'Forma últimos 5',homeStats.formHtml)}
      ${sRow(escapeHtml(awayStats.record),'Récord temporada',escapeHtml(homeStats.record),rC.a,rC.b)}
      ${sRow(escapeHtml(awayStats.homeRec+' / '+awayStats.roadRec),'Casa / Visita (temp.)',escapeHtml(homeStats.homeRec+' / '+homeStats.roadRec))}
      ${sRow(fmt1(awayStats.avgScored)+' pts','Pts anotados (últ.5)',fmt1(homeStats.avgScored)+' pts',sC.a,sC.b)}
      ${sRow(fmt1(awayStats.avgAllowed)+' pts','Pts recibidos (últ.5)',fmt1(homeStats.avgAllowed)+' pts',aLC.a,aLC.b)}
      ${sRow(fmtS(awayStats.adjDiff??awayStats.avgDiff),'Diferencial ajustado',fmtS(homeStats.adjDiff??homeStats.avgDiff),dC.a,dC.b)}
      ${sRow(escapeHtml(awayStats.rivalLabel),'Calidad de rivales',escapeHtml(homeStats.rivalLabel))}
      ${sRow(escapeHtml(awayStats.splitStr),'Split L/V (últ.7)',escapeHtml(homeStats.splitStr))}
      ${sRow(escapeHtml(awayStats.teamStyle),'Perfil ataque/defensa',escapeHtml(homeStats.teamStyle))}
      ${sRow(escapeHtml(awayStats.b2bLabel),'Back-to-back',escapeHtml(homeStats.b2bLabel))}
    </div></div>
  </div>`;
}

/* ── Roster ── */
function renderRoster(awayRoster,homeRoster,awayAbbr,homeAbbr,awayName,homeName,injuriesData){
  function buildMap(teamName){
    const map={};
    const tNorm=norm(teamName).split(' ').pop();
    const teamInj=injuriesData?.find?.(t=>norm(t.team?.displayName||'').includes(tNorm));
    for(const inj of (teamInj?.injuries||[])){ map[norm(inj.athlete?.displayName||'')]=inj.status||''; }
    return map;
  }
  function rows(roster,injMap){
    if(!roster?.length) return '<div class="section-empty">Sin datos de roster</div>';
    return roster.slice(0,12).map(p=>{
      const pName=norm(p.displayName||''),rawStatus=injMap[pName]||'';
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
  return `<div class="section-block">
    <div class="section-title">🏀 Roster & Lesionados</div>
    <div class="lineup-grid">
      <div class="lineup-col">
        <div class="lineup-col-title"><img class="lineup-col-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}" loading="lazy" width="20" height="20"><span>${escapeHtml(awayName)}</span></div>
        ${rows(awayRoster,buildMap(awayName))}
      </div>
      <div class="lineup-col">
        <div class="lineup-col-title"><img class="lineup-col-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}" loading="lazy" width="20" height="20"><span>${escapeHtml(homeName)}</span></div>
        ${rows(homeRoster,buildMap(homeName))}
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════
   SCOREBOARD
   ══════════════════════════════ */
function findInCache(id){ return scoreboardCache.find(e=>String(e.id)===String(id))||null; }
function getTeamId(c){ return c?.team?.id||c?.id||null; }
function getCompetitors(d){ return d?.header?.competitions?.[0]?.competitors||d?.competitions?.[0]?.competitors||[]; }

async function loadNBAGames(){
  if(statusEl) statusEl.textContent='Cargando partidos NBA...';
  try{
    const data=await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    const events=data?.events||[];
    scoreboardCache=events;
    updateTimestamp();
    if(!events.length){
      if(statusEl) statusEl.textContent='Sin partidos hoy.';
      gamesContainer.innerHTML='<div class="empty-state"><p>No hay juegos NBA hoy.</p></div>';
      return;
    }
    if(statusEl) statusEl.textContent=`${events.length} partidos NBA`;
    gamesContainer.innerHTML='';
    for(const event of events){
      const comp=event.competitions?.[0]||{};
      const comps=comp.competitors||[];
      const home=comps.find(t=>t.homeAway==='home');
      const away=comps.find(t=>t.homeAway==='away');
      const homeName=home?.team?.displayName||'Local';
      const awayName=away?.team?.displayName||'Visitante';
      const homeAbbr=home?.team?.abbreviation||'';
      const awayAbbr=away?.team?.abbreviation||'';
      const gs=c=>{ const s=c?.score; if(!s) return '—'; return typeof s==='object'?(s.displayValue??'—'):s; };
      const state=event.status?.type?.state||'';
      const isFinal=state==='post',isLive=state==='in';
      const period=event.status?.period||null,clock=event.status?.displayClock||'';
      let badgeText='',badgeClass='is-scheduled';
      if(isFinal){badgeText='Finalizado';badgeClass='is-final';}
      else if(isLive){badgeText=`En progreso · Q${period||'—'} · ${clock}`;badgeClass='';}
      else{badgeText=`Programado · ${fmtTime(event.date)}`;}
      /* Candado visual si ya hay pick guardado */
      const hasLock=!!pickLockStore[String(event.id)];
      const card=document.createElement('article');
      card.className='game-card';
      card.innerHTML=`
        <div class="game-top">
          <span class="game-status">${isLive?'🔴 EN VIVO':'📅 NBA'}</span>
          <span class="game-date">${new Date(event.date).toLocaleDateString('es-CL',{weekday:'short',month:'short',day:'numeric'})}</span>
        </div>
        <div class="teams">
          <div class="team-row"><div class="team-row-left"><img class="team-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}" loading="lazy" width="30" height="30"><span class="team-name">${escapeHtml(awayName)}</span></div>${(isFinal||isLive)?`<span class="team-score">${escapeHtml(String(gs(away)))}</span>`:''}</div>
          <div class="team-row"><div class="team-row-left"><img class="team-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}" loading="lazy" width="30" height="30"><span class="team-name">${escapeHtml(homeName)}</span></div>${(isFinal||isLive)?`<span class="team-score">${escapeHtml(String(gs(home)))}</span>`:''}</div>
        </div>
        <span class="live-extra ${badgeClass}">${escapeHtml(badgeText)}</span>
        <div class="game-actions">
          <button class="analyze-btn" data-game-id="${escapeHtml(String(event.id))}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            ${hasLock?'🔒 Ver análisis':'Analizar partido'}
          </button>
        </div>`;
      gamesContainer.appendChild(card);
    }
  }catch(err){ console.error(err); if(statusEl) statusEl.textContent='Error cargando partidos'; gamesContainer.innerHTML='<div class="empty-state"><p>No se pudo cargar ESPN.</p></div>'; }
}

/* ── Analyze game ── */
async function analyzeGame(gameId){
  if(!analysisPanel) return;
  openModal();
  analysisPanel.innerHTML=`<div class="loading-state"><div class="loading-spinner"></div><p>Cargando análisis pregame...</p></div>`;
  if(modalTeamsHdr) modalTeamsHdr.innerHTML='<span>Análisis Pregame</span>';
  try{
    let summaryData=null;
    try{ summaryData=await fetchJSON(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`); }catch(e){}
    const sbEvent=findInCache(gameId);
    if(!summaryData&&sbEvent) summaryData={header:{competitions:sbEvent.competitions||[]}};

    const competitors=getCompetitors(summaryData);
    if(!competitors.length){ analysisPanel.innerHTML='<div class="loading-state"><p>No se pudo abrir el pregame.</p></div>'; return; }

    const home=competitors.find(t=>t.homeAway==='home');
    const away=competitors.find(t=>t.homeAway==='away');
    if(!home||!away){ analysisPanel.innerHTML='<div class="loading-state"><p>No se pudo identificar equipos.</p></div>'; return; }

    const homeName=home?.team?.displayName||'Local';
    const awayName=away?.team?.displayName||'Visitante';
    const homeAbbr=home?.team?.abbreviation||'';
    const awayAbbr=away?.team?.abbreviation||'';
    const homeTeamId=getTeamId(home);
    const awayTeamId=getTeamId(away);
    const comp=summaryData?.header?.competitions?.[0]||sbEvent?.competitions?.[0]||{};
    const gameDate=comp?.date||null;
    const gameTime=gameDate?fmtTime(gameDate):'';
    const gameState=comp?.status?.type?.state||sbEvent?.status?.type?.state||'pre';
    const isLiveOrFinal=gameState==='in'||gameState==='post';

    if(modalTeamsHdr) modalTeamsHdr.innerHTML=`
      <div class="modal-header-team"><img class="modal-header-logo" src="${espnLogo(awayAbbr)}" alt="${escapeHtml(awayAbbr)}" loading="lazy"><span>${escapeHtml(awayName)}</span></div>
      <span class="modal-header-vs">vs</span>
      <div class="modal-header-team"><img class="modal-header-logo" src="${espnLogo(homeAbbr)}" alt="${escapeHtml(homeAbbr)}" loading="lazy"><span>${escapeHtml(homeName)}</span></div>
      ${gameTime?`<span class="modal-header-time">${escapeHtml(gameTime)}</span>`:''}`;

    /* ── Pick lock: si el partido ya empezó o terminó, usar pick guardado ── */
    const lockKey=String(gameId);
    if(isLiveOrFinal&&pickLockStore[lockKey]){
      /* Mostrar pick bloqueado + stats (que siguen siendo útiles para revisión) */
      const lockedPick={...pickLockStore[lockKey],locked:true};
      /* Cargamos datos para mostrar estadísticas (sin regenerar pick) */
      const [standingsRes,injRes,awayRosterRes,homeRosterRes]= await Promise.allSettled([
        fetchJSON(`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${NBA_SEASON}&seasontype=2&type=0&level=3`),
        fetchJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries').then(d=>d?.injuries||d||[]).catch(()=>[]),
        fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${awayTeamId}/roster`).then(d=>{ const a=d?.athletes||[]; return a.flatMap(g=>g.items||g.athletes||[g]).filter(p=>p?.displayName); }).catch(()=>[]),
        fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${homeTeamId}/roster`).then(d=>{ const a=d?.athletes||[]; return a.flatMap(g=>g.items||g.athletes||[g]).filter(p=>p?.displayName); }).catch(()=>[]),
      ]);
      const standingsData=standingsRes.status==='fulfilled'?standingsRes.value:null;
      const injuriesData=injRes.status==='fulfilled'?injRes.value:[];
      const awayRoster=awayRosterRes.status==='fulfilled'?awayRosterRes.value:[];
      const homeRoster=homeRosterRes.status==='fulfilled'?homeRosterRes.value:[];
      const standingsLk=standingsData?buildStandingsLk(standingsData):{byId:{},byAbbr:{}};
      const [awayStats,homeStats]=await Promise.all([
        buildTeamStats(awayTeamId,awayAbbr,gameDate,standingsLk),
        buildTeamStats(homeTeamId,homeAbbr,gameDate,standingsLk),
      ]);
      const gameDateStr=gameDate?new Date(gameDate).toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):'';
      analysisPanel.innerHTML=`
        ${gameDateStr?`<div class="game-date-label">${escapeHtml(gameDateStr)}${gameTime?' · '+escapeHtml(gameTime):''}</div>`:''}
        ${renderPickCard(lockedPick)}
        ${renderEdgeBar(lockedPick,awayName,homeName,awayAbbr,homeAbbr)}
        ${renderContext(awayStats,homeStats,awayName,homeName,awayAbbr,homeAbbr)}
        ${renderStats(awayStats,homeStats,awayName,homeName)}
        ${renderRoster(awayRoster,homeRoster,awayAbbr,homeAbbr,awayName,homeName,injuriesData)}`;
      return;
    }

    /* ── Análisis fresco (partido no empezado o primera vez) ── */
    const [standingsRes,injRes,awayRosterRes,homeRosterRes,oddsRes]=await Promise.allSettled([
      fetchJSON(`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${NBA_SEASON}&seasontype=2&type=0&level=3`),
      fetchJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries').then(d=>d?.injuries||d||[]).catch(()=>[]),
      fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${awayTeamId}/roster`).then(d=>{ const a=d?.athletes||[]; return a.flatMap(g=>g.items||g.athletes||[g]).filter(p=>p?.displayName); }).catch(()=>[]),
      fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${homeTeamId}/roster`).then(d=>{ const a=d?.athletes||[]; return a.flatMap(g=>g.items||g.athletes||[g]).filter(p=>p?.displayName); }).catch(()=>[]),
      fetchOddsEvents(),
    ]);

    const standingsData=standingsRes.status==='fulfilled'?standingsRes.value:null;
    const injuriesData=injRes.status==='fulfilled'?injRes.value:[];
    const awayRoster=awayRosterRes.status==='fulfilled'?awayRosterRes.value:[];
    const homeRoster=homeRosterRes.status==='fulfilled'?homeRosterRes.value:[];
    const oddsEvents=oddsRes.status==='fulfilled'?oddsRes.value:[];
    const standingsLk=standingsData?buildStandingsLk(standingsData):{byId:{},byAbbr:{}};

    const [awayStats,homeStats]=await Promise.all([
      buildTeamStats(awayTeamId,awayAbbr,gameDate,standingsLk),
      buildTeamStats(homeTeamId,homeAbbr,gameDate,standingsLk),
    ]);

    const injAway=calcInjury(injuriesData,awayName,awayRoster);
    const injHome=calcInjury(injuriesData,homeName,homeRoster);
    const oddsEvent=findOddsEvent(oddsEvents,homeName,awayName);
    const pick=buildPick({oddsEvent,awayName,homeName,awayStats,homeStats,injPenAway:injAway.penalty,injPenHome:injHome.penalty});

    /* Guardar pick si el partido aún no ha empezado */
    if(!isLiveOrFinal) pickLockStore[lockKey]=pick;

    const allOut=[...injAway.outPlayers.map(p=>({name:p,team:awayName})),...injHome.outPlayers.map(p=>({name:p,team:homeName}))];
    const injAlertHtml=allOut.length?`<div class="injury-alert">⚠️ <span><strong>Bajas confirmadas:</strong> ${allOut.map(p=>`${escapeHtml(p.name)} (${escapeHtml(p.team)})`).join(' · ')}</span></div>`:'';

    const gameDateStr=gameDate?new Date(gameDate).toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):'';
    analysisPanel.innerHTML=`
      ${gameDateStr?`<div class="game-date-label">${escapeHtml(gameDateStr)}${gameTime?' · '+escapeHtml(gameTime):''}</div>`:''}
      ${renderPickCard(pick)}
      ${injAlertHtml}
      ${renderEdgeBar(pick,awayName,homeName,awayAbbr,homeAbbr)}
      ${renderContext(awayStats,homeStats,awayName,homeName,awayAbbr,homeAbbr)}
      ${renderStats(awayStats,homeStats,awayName,homeName)}
      ${renderRoster(awayRoster,homeRoster,awayAbbr,homeAbbr,awayName,homeName,injuriesData)}`;

  }catch(err){ console.error(err); analysisPanel.innerHTML=`<div class="loading-state"><p>Error: ${escapeHtml(err.message)}</p></div>`; }
}

/* ── Events ── */
gamesContainer?.addEventListener('click',ev=>{
  const btn=ev.target.closest('.analyze-btn');
  if(!btn) return;
  const id=btn.dataset.gameId;
  if(id) analyzeGame(id);
});

loadNBAGames();
