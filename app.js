/* ClashLabs — competitive Clash Royale analytics. Self-contained, reads data/*.json. */
'use strict';
const DATA = {};
let CONFIG = { apiBase: '' };
let SYN = null;
const MIN_DUELS = 5;

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = () => document.getElementById('app');
const FLAG = { Egypt:'🇪🇬', Brazil:'🇧🇷', 'South Korea':'🇰🇷', Japan:'🇯🇵', 'Dominican Republic':'🇩🇴',
  Spain:'🇪🇸', Canada:'🇨🇦', Portugal:'🇵🇹', Germany:'🇩🇪', France:'🇫🇷', China:'🇨🇳' };
const flag = c => FLAG[c] || '🌐';
const P = () => DATA.players.players;
const byHandle = h => P().find(p => p.handle === h);
const wrCls = wr => wr == null ? 'na' : (wr >= 50 ? 'hi' : 'lo');
const wrTxt = wr => wr == null ? '—' : wr + '%';
const synIcon = n => (SYN && SYN.cards[n] && SYN.cards[n].icon) || null;

/* diverging win/lose heat for the h2h grid */
const hx = h => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)); };
const mix = (a,b,t) => a.map((x,i) => Math.round(x+(b[i]-x)*t));
function heat(wr) {
  const win = hx(getComputedStyle(document.documentElement).getPropertyValue('--win').trim() || '#2a78d6');
  const lose = hx(getComputedStyle(document.documentElement).getPropertyValue('--lose').trim() || '#e34948');
  const mid = [150,150,148];
  const t = Math.max(-1, Math.min(1, (wr-50)/50));
  const c = t >= 0 ? mix(mid, win, t) : mix(mid, lose, -t);
  const lum = (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255;
  return { bg:`rgb(${c.join(',')})`, fg: lum > 0.6 ? '#0b0b0b' : '#fff' };
}

const tipEl = () => document.getElementById('tip');
function bindTip(node, html) {
  node.addEventListener('mousemove', e => { const t = tipEl(); t.innerHTML = html; t.style.opacity='1';
    t.style.left = Math.min(e.clientX+14, innerWidth-250)+'px'; t.style.top = (e.clientY+14)+'px'; });
  node.addEventListener('mouseleave', () => { tipEl().style.opacity='0'; });
}

/* ============================ HOME ============================ */
function renderHome() {
  const g = SYN ? SYN.games_analyzed : null;
  const nCards = SYN ? Object.keys(SYN.cards).length : null;
  const sum = k => P().reduce((a,p) => a + (p[k] && p[k].games ? p[k].games : 0), 0);
  const feat = (href, ic, title, desc, soon) => `<a class="feat" href="${soon ? '#/' : href}"${soon?' onclick="return false" style="cursor:default"':''}>
    <div class="ic">${ic}</div><h3>${title}</h3><p>${desc}</p>${soon?'<span class="soon">Coming soon</span>':''}</a>`;
  app().innerHTML = `
    <div class="hero">
      <h1>Competitive Clash Royale analytics</h1>
      <p>Card synergies from real competitive play, a personal deck companion for your account, and the stats behind the CRL World Finalists.</p>
      ${g ? `<div class="statline">
        <div class="s"><b class="mono">${g.toLocaleString()}</b><span>games analysed</span></div>
        <div class="s"><b class="mono">${nCards}</b><span>cards ranked</span></div>
        <div class="s"><b class="mono">16</b><span>world finalists</span></div>
      </div>`:''}
    </div>
    <h2 class="sec">Tools</h2>
    <div class="grid features">
      ${feat('#/tree','🌿','Synergy Tree','Start from a win condition and branch out to the cards that pair best with it — a synergy explorer built from competitive win rates.')}
      ${feat('#/lab','🧪','Deck Lab','Enter your player tag to see your collection, your evolutions, and the strongest card pairs you can build right now.')}
      ${feat('#/finalists','🏆','World Finalists','Practice and official win rates, head-to-head records and partnerships for the 16 players at the 2026 World Finals.')}
      ${feat('#/','⚔️','War Deck Builder','Build your four Clan War decks optimised to your card levels and evolutions. In the works.', true)}
    </div>`;
}

/* ============================ SYNERGY TREE ============================ */
const SEED_WINCONS = ['Hog Rider','Royal Giant','Graveyard','X-Bow','Miner','Goblin Barrel','Balloon','Mortar',
  'Golem','Giant','Lava Hound','Goblin Drill','Three Musketeers','Elixir Golem','Mega Knight','Royal Hogs','Wall Breakers'];

function treeState() { if (!window._line) window._line = []; return window._line; }

function cardImg(n, w) { const i = synIcon(n); return i ? `<img src="${esc(i)}" alt="" style="width:${w}px">` : ''; }

function renderTree() {
  if (!SYN) { app().innerHTML = `<h1 class="page">Synergy Tree</h1><div class="card"><div class="note">Synergy data isn't loaded.</div></div>`; return; }
  const line = treeState();
  const seeds = SEED_WINCONS.filter(c => SYN.partners[c]).slice(0, 14);
  let html = `<h1 class="page">Synergy Tree</h1>
    <p class="sub">Pick a card, then follow the branches to the cards it pairs best with. Each branch shows how often that pairing wins and its "lift" — how much better the two do together than apart. Built from ${SYN.games_analyzed.toLocaleString()} competitive 1v1 games.</p>`;

  if (!line.length) {
    html += `<div class="tree-start"><input id="treeInput" list="cardlist" placeholder="Search any card to start…" spellcheck="false"></div>
      <datalist id="cardlist">${Object.keys(SYN.partners).sort().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
      <h2 class="sec">Or start from a win condition</h2>
      <div class="seedgrid">${seeds.map(c=>`<button class="seed" data-seed="${esc(c)}">${cardImg(c,22)}${esc(c)}</button>`).join('')}</div>`;
    app().innerHTML = html;
    wireTreeStart();
    return;
  }

  // trunk
  const last = line[line.length-1].card;
  html += `<div class="trunk">` + line.map((nd,i) => {
    const wc = wrCls(nd.wr);
    return `${i? '<span class="arrow">→</span>':''}<div class="node${i===0?' root':''}">
      <span class="rm" data-cut="${i}" title="trim here">×</span>
      ${cardImg(nd.card,40)}<div class="nm">${esc(nd.card)}</div>
      <div class="wr ${wc}">${i===0?'':''}${wrTxt(nd.wr)}</div></div>`;
  }).join('') + `</div>`;
  html += `<div style="display:flex;gap:10px;align-items:center;margin:-6px 0 14px"><button class="seed" id="treeReset">↺ Start over</button>
    <span class="note">Elixir in line: ${line.reduce((a,n)=>a+((SYN.cards[n.card]||{}).elixir||0),0)} · ${line.length} card${line.length>1?'s':''}</span></div>`;

  // branches
  const inLine = new Set(line.map(n=>n.card));
  const opts = (SYN.partners[last]||[]).filter(p=>!inLine.has(p.card)).slice(0,12);
  html += `<h2 class="sec">Pairs best with ${esc(last)}</h2>`;
  if (!opts.length) html += `<div class="card"><div class="note">No further strong partners recorded for this card.</div></div>`;
  else html += `<div class="branches">` + opts.map(p => `<button class="branch" data-add="${esc(p.card)}" data-wr="${p.wr}" data-lift="${p.lift==null?'':p.lift}">
      ${cardImg(p.card,34)}<span class="bn">${esc(p.card)}</span>
      <span class="meta2"><span class="wr ${wrCls(p.wr)}">${p.wr}%</span><span class="lift">${p.lift>=0?'+':''}${p.lift} lift · ${p.games}g</span></span>
    </button>`).join('') + `</div>`;

  app().innerHTML = html;
  wireTree();
}

function wireTreeStart() {
  const seed = c => { if (!SYN.partners[c] && !SYN.cards[c]) return; window._line = [{card:c, wr:(SYN.cards[c]||{}).wr ?? null, lift:null}]; renderTree(); };
  document.querySelectorAll('.seed[data-seed]').forEach(b => b.addEventListener('click', () => seed(b.dataset.seed)));
  const inp = document.getElementById('treeInput');
  if (inp) inp.addEventListener('change', () => { const v = inp.value.trim(); const hit = Object.keys(SYN.cards).find(c => c.toLowerCase()===v.toLowerCase()); if (hit) seed(hit); });
}
function wireTree() {
  document.querySelectorAll('.branch[data-add]').forEach(b => b.addEventListener('click', () => {
    window._line.push({ card:b.dataset.add, wr:+b.dataset.wr, lift:b.dataset.lift===''?null:+b.dataset.lift }); renderTree();
  }));
  document.querySelectorAll('.rm[data-cut]').forEach(x => x.addEventListener('click', e => {
    e.stopPropagation(); window._line = window._line.slice(0, +x.dataset.cut); renderTree();
  }));
  const r = document.getElementById('treeReset'); if (r) r.addEventListener('click', () => { window._line = []; renderTree(); });
}

/* ============================ DECK LAB ============================ */
function evoBadge(c) {
  if (c.evolutionLevel > 0) return `<span class="evob on" title="Evolution unlocked">EVO</span>`;
  if (c.maxEvolutionLevel > 0) return `<span class="evob" title="Evolution exists (not unlocked)">◇</span>`;
  return '';
}
function ccard(c) {
  const under = c.maxLevel && c.level != null && c.level < c.maxLevel;
  return `<div class="ccard${c.evolutionLevel>0?' evo':''}">${c.icon?`<img loading="lazy" src="${esc(c.icon)}" alt="">`:''}
    <div class="cnm">${esc(c.name)}</div><div class="clv ${under?'lo':'hi'}">Lv ${c.level ?? '—'}<span class="mx">/${c.maxLevel ?? '—'}</span></div>${evoBadge(c)}</div>`;
}
function labSuggestions(cards) {
  if (!SYN) return `<div class="card"><div class="note">Synergy suggestions aren't enabled.</div></div>`;
  const owned = new Set(cards.map(c=>c.name));
  const pairs = (SYN.top_pairs||[]).filter(p=>owned.has(p.a)&&owned.has(p.b)).sort((a,b)=>(b.lift??-99)-(a.lift??-99)).slice(0,8);
  const evos = cards.filter(c=>c.evolutionLevel>0 && SYN.evolutions && SYN.evolutions[c.name]).map(c=>({c,e:SYN.evolutions[c.name]}));
  let html = '';
  if (pairs.length) html += `<h2 class="sec">Strongest pairs you own</h2>
    <div class="synlist">`+pairs.map(p=>`<div class="synpair"><div class="sp-cards">${esc(p.a)} <span class="plus">+</span> ${esc(p.b)}</div>
      <div class="sp-stat"><span class="wr ${wrCls(p.wr)}">${p.wr}%</span> together · ${p.lift>=0?'+':''}${p.lift} lift · ${p.games}g</div></div>`).join('')+`</div>`;
  if (evos.length) html += `<h2 class="sec">Your evolutions</h2>
    <div class="synlist">`+evos.map(({c,e})=>{ const bp=(e.best_partners||[]).filter(x=>owned.has(x.card)).slice(0,3).map(x=>`${esc(x.card)} ${x.wr}%`).join(' · ')||'—';
      return `<div class="synpair"><div class="sp-cards">${esc(c.name)} <span class="note">evo</span></div>
      <div class="sp-stat"><span class="wr ${wrCls(e.evo_wr)}">${e.evo_wr}%</span> evolved (solo ${e.solo_wr}%)<br><span class="note">best with: ${bp}</span></div></div>`;}).join('')+`</div>`;
  if (!pairs.length && !evos.length) html = `<div class="card"><div class="note">No synergy matches for this collection yet.</div></div>`;
  return html;
}
function renderDeckLab() {
  if (!CONFIG.apiBase) { app().innerHTML = `<h1 class="page">Deck Lab</h1><div class="card"><div class="note">The lookup service isn't connected yet.</div></div>`; return; }
  const tag = window._labTag||'', d = window._labData, err = window._labErr, loading = window._labLoading;
  let body = '';
  if (loading) body = `<div class="card"><div class="note">Looking up ${esc(tag)}…</div></div>`;
  else if (err) body = `<div class="card"><div class="note" style="color:var(--lose)">${esc(err)}</div></div>`;
  else if (d) { const evoN = d.cards.filter(c=>c.evolutionLevel>0).length;
    body = `<div class="statrow"><div class="stat"><div class="v mono">${d.cardsOwned}</div><div class="k">cards</div></div>
      <div class="stat"><div class="v mono">${evoN}</div><div class="k">evolutions</div></div></div>
      ${labSuggestions(d.cards)}<h2 class="sec">${esc(d.name||tag)}'s collection</h2><div class="cardgrid">${d.cards.map(ccard).join('')}</div>`;
  }
  app().innerHTML = `<h1 class="page">Deck Lab</h1>
    <p class="sub">Enter your player tag to see your collection, your evolutions, and the strongest card pairs you can build. Reads only your public account.</p>
    <form class="labsearch" id="labForm" autocomplete="off"><input id="labInput" placeholder="#YOURTAG" value="${esc(tag)}" maxlength="16" spellcheck="false"><button type="submit">Look up</button></form>${body}`;
  document.getElementById('labForm').addEventListener('submit', async e => {
    e.preventDefault(); const v = document.getElementById('labInput').value.trim(); if (!v) return;
    window._labTag=v; window._labLoading=true; window._labErr=null; window._labData=null; renderDeckLab();
    try { const r = await fetch(CONFIG.apiBase+'/api/player?tag='+encodeURIComponent(v.replace(/^#/,''))); const j = await r.json();
      window._labLoading=false; if (!r.ok) window._labErr=j.message||'Lookup failed.'; else window._labData=j; }
    catch(x){ window._labLoading=false; window._labErr='Could not reach the lookup service.'; }
    renderDeckLab();
  });
}

/* ============================ WORLD FINALISTS ============================ */
let finTab = 'players', finSort = { key:'practice', dir:-1 };
function pWR(p, cat) { const c = p[cat]; return c && c.duels ? c.duel_wr : null; }

function renderFinalists() {
  const tabs = [['players','Players'],['h2h','Head-to-Head'],['compare','Compare'],['leaders','Leaders']];
  let html = `<h1 class="page">CRL World Finalists</h1>
    <p class="sub">The 16 players at the 2026 World Finals — practice and official win rates, how they match up against each other, and who they practise with. From a sample of public battles; win rate is the share of best-of sets won.</p>
    <div class="seg" id="finseg">${tabs.map(t=>`<button data-t="${t[0]}" class="${t[0]===finTab?'on':''}">${t[1]}</button>`).join('')}</div>
    <div style="margin-top:16px" id="finbody"></div>`;
  app().innerHTML = html;
  document.getElementById('finseg').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ finTab=b.dataset.t; renderFinalists(); }));
  const body = document.getElementById('finbody');
  if (finTab==='players') body.innerHTML = finPlayers();
  else if (finTab==='h2h') body.innerHTML = finH2H();
  else if (finTab==='compare') { body.innerHTML = finCompare(); wireCompare(); }
  else body.innerHTML = finLeaders();
  if (finTab==='players') wirePlayers();
  if (finTab==='h2h') { body.querySelectorAll('td[data-bg]').forEach(td=>{ td.style.background=td.dataset.bg; td.style.color=td.dataset.fg; });
    body.querySelectorAll('td[data-tip]').forEach(td=>bindTip(td,td.dataset.tip)); }
}

function finPlayers() {
  const rows = [...P()];
  const val = (p,k) => k==='handle'?p.handle : k==='games'?((p.practice&&p.practice.games)||0) : (pWR(p,k) ?? -1);
  rows.sort((a,b)=>{ const x=val(a,finSort.key), y=val(b,finSort.key);
    if (typeof x==='string') return finSort.dir*x.localeCompare(y); return finSort.dir*(x-y); });
  const caret = k => finSort.key===k ? `<span class="sortcaret">${finSort.dir<0?'▾':'▴'}</span>` : '';
  const cell = (p,cat) => { const wr=pWR(p,cat), c=p[cat], low=c&&c.duels&&c.duels<MIN_DUELS;
    return `<td class="num"><span class="wr ${wrCls(wr)}">${wrTxt(wr)}</span>${low?'<span class="note"> ·sm</span>':''}</td>`; };
  return `<div class="card" style="padding:4px 4px"><table class="tbl"><thead><tr>
      <th data-s="handle">Player ${caret('handle')}</th><th>Country</th>
      <th class="num" data-s="practice">Practice ${caret('practice')}</th>
      <th class="num" data-s="official">Official ${caret('official')}</th>
      <th class="num" data-s="games">Games ${caret('games')}</th></tr></thead><tbody>`
    + rows.map(p=>`<tr data-h="${esc(p.handle)}"><td class="pl">${esc(p.handle)}</td>
        <td><span class="fl">${flag(p.country)}</span><span class="note">${esc(p.country)}</span></td>
        ${cell(p,'practice')}${cell(p,'official')}
        <td class="num mono">${((p.practice&&p.practice.games)||0).toLocaleString()}</td></tr>`).join('')
    + `</tbody></table></div><p class="note" style="margin-top:8px">Click a player for detail. "·sm" = small sample (under ${MIN_DUELS} duels).</p>`;
}
function wirePlayers() {
  document.querySelectorAll('#finbody th[data-s]').forEach(th=>th.addEventListener('click',()=>{
    const k=th.dataset.s; if (finSort.key===k) finSort.dir*=-1; else finSort={key:k, dir:k==='handle'?1:-1}; renderFinalists(); }));
  document.querySelectorAll('#finbody tbody tr').forEach(tr=>tr.addEventListener('click',()=>{ location.hash='#/p/'+encodeURIComponent(tr.dataset.h); }));
}

function finLeaders() {
  const F = DATA.facts.facts, g=(a,i)=>(a||[])[i];
  const list = (title, rows, fmt) => `<h2 class="sec">${title}</h2><div class="card">`+(rows||[]).slice(0,8).map((x,i)=>
    `<div class="kv"><span>${i+1}. ${esc(x.handle)}</span><b class="mono">${fmt(x.value)}</b></div>`).join('')+`</div>`;
  return list('Most practice games', F.most_practice_games, v=>v.toLocaleString())
    + list('Best practice duel win rate (min '+MIN_DUELS+' duels)', F.best_practice_duel_wr, v=>v+'%');
}

function finH2H() {
  const order = DATA.h2h.order, M = DATA.h2h.matrix;
  let h = `<p class="note" style="margin:0 0 10px">Each finalist's duel win rate vs every other. <span class="wr hi">Blue</span> = winning record, <span class="wr lo">red</span> = losing. Hover a cell.</p>
    <div class="card" style="padding:12px"><div class="heat-scroll"><table class="heat"><thead><tr><th></th>${order.map(o=>`<th class="colh"><span>${esc(o)}</span></th>`).join('')}</tr></thead><tbody>`;
  for (const r of order) { h += `<tr><th class="rowh">${esc(r)}</th>`;
    for (const c of order) { if (r===c){ h+=`<td class="self"></td>`; continue; }
      const cell = M[r]&&M[r][c] ? M[r][c].all : null;
      if (!cell||!cell.duels){ h+=`<td class="empty">·</td>`; continue; }
      if (cell.duels<MIN_DUELS){ h+=`<td class="empty" data-tip="${esc(r)} vs ${esc(c)} — ${cell.games}g (small sample)">${cell.duel_wr}</td>`; }
      else { const col=heat(cell.duel_wr); h+=`<td data-bg="${col.bg}" data-fg="${col.fg}" data-tip="${esc(r)} vs ${esc(c)} — ${cell.games} games, ${cell.duels} duels · ${cell.duel_wr}% duel WR">${cell.duel_wr}</td>`; } }
    h += `</tr>`; }
  return h + `</tbody></table></div></div>`;
}

function finCompare() {
  const order = DATA.h2h.order, a = window._a||order[0], b = window._b||order[1];
  const pa = byHandle(a), pb = byHandle(b);
  const opt = sel => order.map(o=>`<option${o===sel?' selected':''}>${esc(o)}</option>`).join('');
  const h2h = DATA.h2h.matrix[a]&&DATA.h2h.matrix[a][b] ? DATA.h2h.matrix[a][b].all : null;
  const side = p => `<div class="card"><div style="font-weight:800;font-size:16px">${flag(p.country)} ${esc(p.handle)}</div>
    <div class="note" style="margin-bottom:8px">${esc(p.country)}</div>
    <div class="kv"><span>Practice WR</span><b class="wr ${wrCls(pWR(p,'practice'))}">${wrTxt(pWR(p,'practice'))}</b></div>
    <div class="kv"><span>Official WR</span><b class="wr ${wrCls(pWR(p,'official'))}">${wrTxt(pWR(p,'official'))}</b></div>
    <div class="kv"><span>Practice games</span><b class="mono">${((p.practice&&p.practice.games)||0).toLocaleString()}</b></div></div>`;
  let banner = `<div class="card"><div class="note">No recorded games between these two.</div></div>`;
  if (h2h&&h2h.duels){ const aw=h2h.duel_wins, bw=h2h.duels-h2h.duel_wins, low=h2h.duels<MIN_DUELS;
    banner = `<div class="card" style="text-align:center"><div style="font-size:26px;font-weight:800" class="mono"><span class="wr ${aw>=bw?'hi':'lo'}">${aw}</span> – <span class="wr ${bw>aw?'hi':'lo'}">${bw}</span></div>
      <div class="note">duels · ${esc(a)} vs ${esc(b)} (${h2h.games} games)${low?' · small sample':''}</div></div>`; }
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px"><select id="selA">${opt(a)}</select><select id="selB">${opt(b)}</select></div>
    <div class="grid" style="grid-template-columns:1fr 1fr">${side(pa)}${side(pb)}</div>
    <h2 class="sec">Head-to-head</h2>${banner}`;
}
function wireCompare() {
  const sa=document.getElementById('selA'), sb=document.getElementById('selB');
  if (sa) sa.addEventListener('change',e=>{ window._a=e.target.value; renderFinalists(); });
  if (sb) sb.addEventListener('change',e=>{ window._b=e.target.value; renderFinalists(); });
}

function renderPlayer(handle) {
  const p = byHandle(handle);
  if (!p) { app().innerHTML = `<p>Unknown player. <a href="#/finalists">Back</a></p>`; return; }
  const partners = DATA.partners.partners[handle] || [];
  const row = DATA.h2h.matrix[handle] || {};
  const rivals = DATA.h2h.order.filter(o=>o!==handle && row[o] && row[o].all && row[o].all.duels>=MIN_DUELS)
    .map(o=>({o, wr:row[o].all.duel_wr, g:row[o].all.games}));
  const best = [...rivals].sort((a,b)=>b.wr-a.wr).slice(0,5);
  const tough = [...rivals].sort((a,b)=>a.wr-b.wr).slice(0,5);
  const stat = (k,cat)=>`<div class="stat"><div class="v wr ${wrCls(pWR(p,cat))}">${wrTxt(pWR(p,cat))}</div><div class="k">${k}</div></div>`;
  const partRows = partners.length ? partners.map(pt=>`<div class="kv"><span>${esc(pt.name)}${pt.is_finalist?' · WF':''} <span class="note">${pt.games}g</span></span>
      <b class="wr ${wrCls(pt.duel_wr)}">${wrTxt(pt.duel_wr)}</b></div>`).join('') : `<div class="note">No practice partners recorded.</div>`;
  const rivRows = rows => rows.length ? rows.map(m=>`<div class="kv"><span>${esc(m.o)}</span><b class="wr ${wrCls(m.wr)}">${m.wr}%</b></div>`).join('') : `<div class="note">—</div>`;
  app().innerHTML = `<p class="note"><a href="#/finalists">← World Finalists</a></p>
    <h1 class="page">${flag(p.country)} ${esc(p.handle)}</h1>
    <p class="sub">${esc(p.country)} · ${esc(p.qual)}${p.last_active?` · last seen ${p.last_active}`:''}</p>
    <div class="statrow">${stat('Practice','practice')}${stat('Official CRL','official')}${stat('Overall','overall')}</div>
    <h2 class="sec">Favourite practice partners</h2><div class="card">${partRows}</div>
    ${rivals.length?`<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <div><h2 class="sec" style="color:var(--win)">Best results</h2><div class="card">${rivRows(best)}</div></div>
      <div><h2 class="sec" style="color:var(--lose)">Toughest</h2><div class="card">${rivRows(tough)}</div></div></div>`:''}`;
}

/* ============================ ROUTER ============================ */
function render() {
  const parts = (location.hash||'#/').replace(/^#\//,'').split('/');
  const route = parts[0]||'';
  const activeFor = route==='p' ? 'finalists' : route;
  document.querySelectorAll('nav.main a').forEach(a=>a.classList.toggle('active', a.dataset.route===activeFor));
  try {
    if (route==='p') renderPlayer(decodeURIComponent(parts[1]||''));
    else if (route==='tree') renderTree();
    else if (route==='lab') renderDeckLab();
    else if (route==='finalists') renderFinalists();
    else renderHome();
  } catch(e){ app().innerHTML = `<p class="note">Something went wrong.</p>`; console.error(e); }
  scrollTo(0,0);
}

function initTheme() {
  let t=null; try { t=localStorage.getItem('crl-theme'); } catch(e){}
  document.documentElement.setAttribute('data-theme', t||'dark');
  document.getElementById('themeBtn').addEventListener('click',()=>{
    const next = document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('crl-theme', next); } catch(e){}
  });
}

async function boot() {
  initTheme();
  try {
    const loadJSON = async (name, optional) => {
      for (const p of ['data/'+name, name]) { try { const r=await fetch(p); if (r.ok) return await r.json(); } catch(e){} }
      if (optional) return null; throw new Error('missing '+name);
    };
    const files = ['players','partners','h2h','facts','meta'];
    const got = await Promise.all(files.map(f=>loadJSON(f+'.json')));
    files.forEach((f,i)=>DATA[f]=got[i]);
    document.getElementById('footgen').textContent = ' · Updated '+DATA.meta.generated;
    const cfg = await loadJSON('config.json', true); if (cfg) CONFIG = cfg;
    SYN = await loadJSON('synergy.json', true);
    addEventListener('hashchange', render); render();
  } catch(e){ app().innerHTML = '<p class="note">Could not load data.</p>'; console.error(e); }
}
boot();
