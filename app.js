/* ClashLabs, competitive Clash Royale analytics. Self-contained, reads data/*.json. */
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
  // Live example: a real deck the engine builds right now, shown as the hero centrepiece.
  let demo = '';
  try {
    if (window.DeckBuilder && SYN) {
      const eng = bEngine(), d = eng.buildDeck('Hog Rider');
      demo = `<div class="hero-demo">
        <div class="hd-label">A Hog Rider deck the builder just made, live · ${eng.avgElixir(d).toFixed(1)} avg elixir</div>
        <div class="hd-cards">${d.map(c => `<span class="hd-card" title="${esc(c)}">${deckImg(c) || esc(c).slice(0,3)}</span>`).join('')}</div>
        <a class="hd-cta" href="#/builder">Build your own →</a>
      </div>`;
    }
  } catch (e) { demo = ''; }
  app().innerHTML = `
    <div class="hero">
      <h1>Competitive Clash Royale analytics</h1>
      <p>Card synergies from real competitive play, a personal deck companion for your account, and the stats behind the CRL World Finalists.</p>
      ${g ? `<div class="statline">
        <div class="s"><b class="mono">${g.toLocaleString()}</b><span>games analysed</span></div>
        <div class="s"><b class="mono">${nCards}</b><span>cards ranked</span></div>
        <div class="s"><b class="mono">16</b><span>world finalists</span></div>
      </div>`:''}
      ${demo}
    </div>
    <h2 class="sec">Tools</h2>
    <div class="grid features">
      ${feat('#/tree','🌿','Synergy Tree','Start from a win condition and branch out to the cards that pair best with it, a synergy explorer built from competitive win rates.')}
      ${feat('#/map','🔥','Synergy Map','A card×card heatmap, a card\'s closest partners and how they pair with each other. Tight blue blocks are mini-archetypes.')}
      ${feat('#/builder','🛠️','Deck Builder','Pick a win condition and get a full 8-card deck built from the cards that win together, then fine-tune any slot with data-backed swaps.')}
      ${feat('#/lab','🧪','Deck Lab','Enter your player tag to see your collection, your evolutions, and the strongest card pairs you can build right now.')}
      ${feat('#/finalists','🏆','World Finalists','Practice and official win rates, head-to-head records and partnerships for the 16 players at the 2026 World Finals.')}
      ${feat('#/war','⚔️','War Deck Builder','Enter your tag and get four Clan War decks built from cards you own, no card reused, weighted to your maxed and evolved copies.')}
    </div>`;
}

/* ============================ SYNERGY TREE ============================ */
const SEED_WINCONS = ['Hog Rider','Royal Giant','Graveyard','X-Bow','Miner','Goblin Barrel','Balloon','Mortar',
  'Golem','Giant','Lava Hound','Goblin Drill','Three Musketeers','Elixir Golem','Mega Knight','Royal Hogs','Wall Breakers'];

function treeState() { if (!window._line) window._line = []; return window._line; }

function cardImg(n, w) { const i = synIcon(n); return i ? `<img src="${esc(i)}" alt="" style="width:${w}px">` : ''; }

function renderTree() {
  if (!SYN || !SYN.partners) { app().innerHTML = `<h1 class="page">Synergy Tree</h1><div class="card"><div class="note">Synergy data is still loading or out of date, try a full refresh (hold Shift and click reload).</div></div>`; return; }
  const line = treeState();
  const seeds = SEED_WINCONS.filter(c => SYN.partners[c]).slice(0, 14);
  let html = `<h1 class="page">Synergy Tree</h1>
    <p class="sub">Pick a card, then follow the branches to the cards it pairs best with. Each branch shows how often that pairing wins and its "lift", how much better the two do together than apart. Built from ${SYN.games_analyzed.toLocaleString()} competitive 1v1 games.</p>`;

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
  if (loading) body = skelDeck('Looking up ' + tag + '…');
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
    <p class="sub">The 16 players at the 2026 World Finals, practice and official win rates, how they match up against each other, and who they practise with. From a sample of public battles; win rate is the share of best-of sets won.</p>
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
      if (cell.duels<MIN_DUELS){ h+=`<td class="empty" data-tip="${esc(r)} vs ${esc(c)}, ${cell.games}g (small sample)">${cell.duel_wr}</td>`; }
      else { const col=heat(cell.duel_wr); h+=`<td data-bg="${col.bg}" data-fg="${col.fg}" data-tip="${esc(r)} vs ${esc(c)}, ${cell.games} games, ${cell.duels} duels · ${cell.duel_wr}% duel WR">${cell.duel_wr}</td>`; } }
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

/* ============================ HOW IT WORKS ============================ */
const HOW_STEPS = [
  { t: 'Pick your starting point',
    d: 'Search your player tag in Deck Lab, or choose a card in the Synergy Tree. No account or sign-in needed.',
    sample: `<div class="hs-row"><div class="hs-input">#YOURTAG</div><div class="hs-btn">Look up</div></div>
             <div class="hs-note">or pick a card to explore</div>
             <div class="hs-chips"><span class="hs-chip">Hog Rider</span><span class="hs-chip">Graveyard</span><span class="hs-chip">Miner</span></div>` },
  { t: 'We read what\'s public',
    d: 'For Deck Lab, we read the cards and levels on your public account. Nothing private, nothing stored about you.',
    sample: `<div class="hs-grid">${['Hog Rider','Fireball','Musketeer','Cannon','Ice Spirit','Skeletons'].map(n=>`<div class="hs-card">${n}<span class="hs-lv">Lv 14</span></div>`).join('')}</div>` },
  { t: 'Matched to the competitive meta',
    d: 'Your cards are matched against win rates from a large sample of competitive 1v1 play, which pairs over-perform, and by how much.',
    sample: `<div class="hs-pair"><span>Elixir Collector <b>+</b> Inferno Dragon</span><span class="wr hi">91%</span></div>
             <div class="hs-pair"><span>Hog Rider <b>+</b> Poison</span><span class="wr hi">75.6%</span></div>
             <div class="hs-barlabel">win rate together · "lift" over playing them apart</div>` },
  { t: 'Your result',
    d: 'The strongest pairs you can build right now, your evolutions, or a synergy line to follow, ranked and explained.',
    sample: `<div class="hs-res"><span class="hs-rk">1</span><span>Strongest pair you own</span><span class="wr hi">+33.8 lift</span></div>
             <div class="hs-res"><span class="hs-rk">2</span><span>Your best evolution</span><span class="wr hi">59%</span></div>
             <div class="hs-res"><span class="hs-rk">3</span><span>Next card to pair</span><span class="wr hi">72%</span></div>` },
];
function renderHow() {
  app().innerHTML = `<h1 class="page">How ClashLabs works</h1>
    <p class="sub">From a tag or a card to a ranked, explained suggestion, in four steps. All examples below use sample data.</p>
    <div class="how">
      <div class="how-stage"><div class="how-panels">
        ${HOW_STEPS.map((s,i)=>`<div class="how-panel${i===0?' on':''}" data-p="${i}"><div class="hs-tag">Example</div>${s.sample}</div>`).join('')}
      </div></div>
      <ol class="how-steps">
        ${HOW_STEPS.map((s,i)=>`<li class="how-step${i===0?' active':''}" data-s="${i}">
          <div class="how-num">${i+1}</div><div><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div></li>`).join('')}
      </ol>
    </div>
    <p class="note" style="margin-top:22px">Ready? <a href="#/lab">Try Deck Lab</a> or <a href="#/tree">open the Synergy Tree</a>.</p>`;
  const steps = [...app().querySelectorAll('.how-step')], panels = [...app().querySelectorAll('.how-panel')];
  const setActive = i => { steps.forEach((s,j)=>s.classList.toggle('active', j===i)); panels.forEach((p,j)=>p.classList.toggle('on', j===i)); };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) setActive(+e.target.dataset.s); });
    }, { rootMargin: '-20% 0px -78% 0px', threshold: 0 });
    steps.forEach(s => io.observe(s));
  }
  steps.forEach(s => s.addEventListener('click', () => setActive(+s.dataset.s)));
}

/* ============================ DECK BUILDER (F1) ============================ */
function bEngine() { if (!window._eng && SYN && window.DeckBuilder) window._eng = window.DeckBuilder.Engine(SYN); return window._eng; }
function deckImg(c) { const i = synIcon(c); return i ? `<img loading="lazy" src="${esc(i)}" alt="">` : ''; }
function skelDeck(label) { return `<div class="note" style="margin:4px 0 10px">${esc(label)}</div>
  <div class="skel-grid">${new Array(8).fill('<div class="skel skel-tile"></div>').join('')}</div>`; }

function renderBuilder() {
  if (!SYN || !window.DeckBuilder) { app().innerHTML = `<h1 class="page">Deck Builder</h1><div class="card"><div class="note">Synergy data is still loading or out of date, try a full refresh (hold Shift and click reload).</div></div>`; return; }
  const eng = bEngine();
  const wincons = window.DeckBuilder.WINCONS.filter(c => SYN.cards[c]);
  let html = `<h1 class="page">Deck Builder</h1>
    <p class="sub">Pick a win condition and get a full 8-card deck built from the cards that actually win together, from ${SYN.games_analyzed.toLocaleString()} competitive 1v1 games. Then fine-tune any slot with data-backed swaps.</p>
    <div class="tree-start"><input id="bldInput" list="bldlist" placeholder="Search any card to build around…" spellcheck="false">
      <datalist id="bldlist">${Object.keys(SYN.cards).sort().map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <h2 class="sec">Or start from a win condition</h2>
    <div class="seedgrid">${wincons.map(c => `<button class="seed" data-bseed="${esc(c)}">${cardImg(c,22)}${esc(c)}</button>`).join('')}</div>`;
  if (window._bDeck && window._bDeck.length) html += builtDeckHtml(eng);
  app().innerHTML = html;
  wireBuilder(eng);
}

function builtDeckHtml(eng) {
  const deck = window._bDeck, seed = window._bSeed;
  const wins = deck.filter(c => eng.fineRole(c) === 'wincon').length;
  const spells = deck.filter(c => eng.roleOf(c) === 'spell').length;
  let h = `<h2 class="sec" style="margin-top:24px">Your ${esc(seed)} deck</h2>
    <div class="statrow" style="margin-bottom:14px">
      <div class="stat"><div class="v mono">${eng.avgElixir(deck).toFixed(1)}</div><div class="k">avg elixir</div></div>
      <div class="stat"><div class="v mono">${wins}</div><div class="k">win con${wins===1?'':'s'}</div></div>
      <div class="stat"><div class="v mono">${spells}</div><div class="k">spells</div></div>
      <button class="seed" id="bldCopy" style="align-self:center">⧉ Copy card list</button>
      <button class="seed" id="bldReset" style="align-self:center">↺ Start over</button>
    </div>
    <div class="cardgrid bld-grid">` + deck.map((c, i) => {
      const isSeed = c === seed, role = eng.fineRole(c);
      return `<div class="ccard bld-tile${isSeed ? ' core' : ''}">
        ${deckImg(c)}<div class="cnm">${esc(c)}</div>
        <div class="bld-el mono">${eng.elixir(c)}<span class="mx"> elixir</span></div>
        <div class="bld-role">${role}</div>
        ${isSeed ? `<span class="bld-core-tag">CORE</span>` : `<button class="bld-swap" data-i="${i}">⇄ swap</button>`}
      </div>`;
    }).join('') + `</div>`;

  if (window._bOpen != null && window._bOpen < deck.length) {
    const i = window._bOpen, c = deck[i], sw = eng.swaps(deck, c, 4);
    h += `<div class="card" style="margin-top:12px"><div class="note" style="margin-bottom:8px">Swap <b>${esc(c)}</b> for a same-role card that fits the rest of the deck:</div>
      <div class="branches">` + (sw.length ? sw.map(s => `<button class="branch" data-swapto="${esc(s.card)}" data-i="${i}">
        ${cardImg(s.card,34)}<span class="bn">${esc(s.card)}</span>
        <span class="meta2"><span class="wr ${wrCls(s.wr)}">${s.wr}%</span><span class="lift">${eng.elixir(s.card)} elixir</span></span></button>`).join('')
        : `<div class="note">No same-role alternative with enough data.</div>`) + `</div></div>`;
  }

  const pairs = eng.deckPairs(deck, 4);
  if (pairs.length) h += `<h2 class="sec">Why these cards</h2>
    <div class="synlist">` + pairs.map(p => `<div class="synpair"><div class="sp-cards">${esc(p.a)} <span class="plus">+</span> ${esc(p.b)}</div>
      <div class="sp-stat">${p.lift >= 0 ? '+' : ''}${p.lift} lift together</div></div>`).join('') + `</div>`;
  h += `<p class="note" style="margin-top:12px">Built by greedily pairing the highest-synergy cards around your win condition, keeping the deck legal (a spell, a cheap cycle card, at most one building). Swaps preserve each card's role so the deck still functions. Synergy is from public games, never from private scouting data.</p>`;
  return h;
}

function wireBuilder(eng) {
  const build = c => { if (!SYN.cards[c]) return; window._bSeed = c; window._bDeck = eng.buildDeck(c); window._bOpen = null; renderBuilder(); };
  document.querySelectorAll('.seed[data-bseed]').forEach(b => b.addEventListener('click', () => build(b.dataset.bseed)));
  const inp = document.getElementById('bldInput');
  if (inp) inp.addEventListener('change', () => { const v = inp.value.trim(); const hit = Object.keys(SYN.cards).find(c => c.toLowerCase() === v.toLowerCase()); if (hit) build(hit); });
  document.querySelectorAll('.bld-swap[data-i]').forEach(b => b.addEventListener('click', () => { window._bOpen = +b.dataset.i; renderBuilder(); }));
  document.querySelectorAll('.branch[data-swapto]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i; window._bDeck[i] = b.dataset.swapto; window._bOpen = null; renderBuilder();
  }));
  const reset = document.getElementById('bldReset');
  if (reset) reset.addEventListener('click', () => { window._bDeck = null; window._bSeed = null; window._bOpen = null; renderBuilder(); });
  const copy = document.getElementById('bldCopy');
  if (copy) copy.addEventListener('click', () => {
    const txt = window._bDeck.join(', ');
    try { navigator.clipboard.writeText(txt); copy.textContent = '✓ Copied'; setTimeout(() => { copy.textContent = '⧉ Copy card list'; }, 1400); }
    catch (e) { copy.textContent = txt; }
  });
}

/* ============================ SYNERGY MAP (card×card matrix) ============================ */
function matrixHeat(l) {
  if (l == null) return { bg: 'transparent', fg: 'var(--muted)' };
  const win = hx(getComputedStyle(document.documentElement).getPropertyValue('--win').trim() || '#2a78d6');
  const lose = hx(getComputedStyle(document.documentElement).getPropertyValue('--lose').trim() || '#e34948');
  const mid = [150, 150, 148];
  const t = Math.max(-1, Math.min(1, l / 25));
  const c = t >= 0 ? mix(mid, win, t) : mix(mid, lose, -t);
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return { bg: `rgb(${c.join(',')})`, fg: lum > 0.6 ? '#0b0b0b' : '#fff' };
}

function renderMatrix() {
  if (!SYN || !SYN.partners) { app().innerHTML = `<h1 class="page">Synergy Map</h1><div class="card"><div class="note">Synergy data is still loading or out of date, try a full refresh (hold Shift and click reload).</div></div>`; return; }
  const focus = (window._mxFocus && SYN.partners[window._mxFocus]) ? window._mxFocus : (SYN.partners['Hog Rider'] ? 'Hog Rider' : Object.keys(SYN.partners)[0]);
  const partners = (SYN.partners[focus] || []).slice(0, 11).map(p => p.card);
  const list = [focus].concat(partners);
  const liftOf = (a, b) => {
    if (a === b) return null;
    const la = SYN.partners[a] || []; for (const e of la) if (e.card === b) return e;
    const lb = SYN.partners[b] || []; for (const e of lb) if (e.card === a) return e;
    return null;
  };
  const picks = ['Hog Rider','Golem','Graveyard','X-Bow','Miner','Lava Hound','Balloon','Mega Knight'].filter(c => SYN.partners[c]);

  let html = `<h1 class="page">Synergy Map</h1>
    <p class="sub">A card's closest partners, and how they pair with <em>each other</em>. Each cell is the "lift" between two cards (how much better they do together than apart), from ${SYN.games_analyzed.toLocaleString()} competitive games. Blue is strong synergy, red is anti-synergy; the diagonal is each card's solo win rate.</p>
    <div class="tree-start"><input id="mxInput" list="mxlist" placeholder="Search any card to centre the map…" spellcheck="false">
      <datalist id="mxlist">${Object.keys(SYN.partners).sort().map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <div class="seedgrid" style="margin-bottom:4px">${picks.map(c => `<button class="seed${c===focus?' on':''}" data-mx="${esc(c)}">${cardImg(c,20)}${esc(c)}</button>`).join('')}</div>
    <h2 class="sec">Centred on ${esc(focus)}</h2>
    <div class="card" style="padding:12px"><div class="heat-scroll"><table class="heat mx"><thead><tr><th></th>`
    + list.map(c => `<th class="colh"><span title="${esc(c)}">${cardImg(c,24) || esc(c).slice(0,3)}</span></th>`).join('') + `</tr></thead><tbody>`;
  list.forEach(r => {
    html += `<tr><th class="rowh">${cardImg(r,20)}<span>${esc(r)}</span></th>`;
    list.forEach(c => {
      if (r === c) { const w = (SYN.cards[r] || {}).wr; html += `<td class="mx-diag" data-tip="${esc(r)}, ${w != null ? w + '% solo win rate' : 'no solo data'}">${w != null ? Math.round(w) : '·'}</td>`; return; }
      const e = liftOf(r, c);
      if (!e) { html += `<td class="empty" data-tip="${esc(r)} + ${esc(c)}, no strong pairing recorded">·</td>`; return; }
      const col = matrixHeat(e.lift);
      html += `<td data-bg="${col.bg}" data-fg="${col.fg}" data-tip="${esc(r)} + ${esc(c)}, ${e.lift >= 0 ? '+' : ''}${e.lift} lift · ${e.wr}% win · ${e.games}g">${e.lift >= 0 ? '+' : ''}${e.lift}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div></div>
    <p class="note" style="margin-top:10px">The first row and column are ${esc(focus)} with each partner. The inner cells show which of those partners also synergise with <em>each other</em>, a tight block of blue is a mini-archetype. Hover any cell for the exact numbers.</p>`;
  app().innerHTML = html;
  app().querySelectorAll('td[data-bg]').forEach(td => { td.style.background = td.dataset.bg; td.style.color = td.dataset.fg; });
  app().querySelectorAll('td[data-tip]').forEach(td => bindTip(td, td.dataset.tip));
  const pick = c => { if (SYN.partners[c]) { window._mxFocus = c; renderMatrix(); } };
  document.querySelectorAll('.seed[data-mx]').forEach(b => b.addEventListener('click', () => pick(b.dataset.mx)));
  const inp = document.getElementById('mxInput');
  if (inp) inp.addEventListener('change', () => { const v = inp.value.trim(); const hit = Object.keys(SYN.partners).find(c => c.toLowerCase() === v.toLowerCase()); if (hit) pick(hit); });
}

/* ============================ WAR DECK BUILDER (F4) ============================ */
function warResultHtml(eng, d) {
  const owned = d.cards.map(c => ({ name: c.name, level: c.level, maxLevel: c.maxLevel, evolutionLevel: c.evolutionLevel }));
  const decks = eng.warDecks(owned, 4);
  if (!decks.length) return `<div class="card"><div class="note">Couldn't build four full decks from this collection, not enough distinct cards.</div></div>`;
  const om = {}; d.cards.forEach(c => { om[c.name] = c; });
  const evoTotal = decks.reduce((a, x) => a + x.evolutions, 0);
  let h = `<div class="statrow" style="margin:2px 0 16px">
      <div class="stat"><div class="v mono">${decks.length}</div><div class="k">war decks</div></div>
      <div class="stat"><div class="v mono">${evoTotal}</div><div class="k">evolutions used</div></div>
      <div class="stat"><div class="v mono">${d.cardsOwned}</div><div class="k">cards owned</div></div>
    </div>`;
  h += decks.map((dk, i) => `<h2 class="sec">Deck ${i + 1}, ${esc(dk.seed)}
      <span class="note" style="font-weight:500">· ${dk.avgElixir.toFixed(1)} avg elixir · ${Math.round(dk.avgLevelFrac * 100)}% leveled · ${dk.evolutions} evo</span></h2>
    <div class="cardgrid bld-grid">${dk.cards.map(c => ccard(om[c] || { name: c })).join('')}</div>`).join('');
  h += `<p class="note" style="margin-top:14px">Each deck uses only cards you own, no card appears in two decks, and the picks are weighted toward your higher-level and evolved copies as well as synergy. Reads only your public account; synergy is from public games, never private scouting data.</p>`;
  return h;
}

function renderWar() {
  if (!SYN || !window.DeckBuilder) { app().innerHTML = `<h1 class="page">War Deck Builder</h1><div class="card"><div class="note">Synergy data is still loading or out of date, try a full refresh (hold Shift and click reload).</div></div>`; return; }
  if (!CONFIG.apiBase) { app().innerHTML = `<h1 class="page">War Deck Builder</h1><div class="card"><div class="note">The lookup service isn't connected yet.</div></div>`; return; }
  const eng = bEngine();
  const tag = window._warTag || '', d = window._warData, err = window._warErr, loading = window._warLoading;
  let body = '';
  if (loading) body = skelDeck('Building war decks for ' + tag + '…');
  else if (err) body = `<div class="card"><div class="note" style="color:var(--lose)">${esc(err)}</div></div>`;
  else if (d) body = warResultHtml(eng, d);
  app().innerHTML = `<h1 class="page">War Deck Builder</h1>
    <p class="sub">Enter your player tag for four Clan War decks built from cards you own, no card reused across decks, weighted toward your maxed and evolved copies and the synergies that win. Reads only your public account.</p>
    <form class="labsearch" id="warForm" autocomplete="off"><input id="warInput" placeholder="#YOURTAG" value="${esc(tag)}" maxlength="16" spellcheck="false"><button type="submit">Build war decks</button></form>${body}`;
  document.getElementById('warForm').addEventListener('submit', async e => {
    e.preventDefault(); const v = document.getElementById('warInput').value.trim(); if (!v) return;
    window._warTag = v; window._warLoading = true; window._warErr = null; window._warData = null; renderWar();
    try { const r = await fetch(CONFIG.apiBase + '/api/player?tag=' + encodeURIComponent(v.replace(/^#/, ''))); const j = await r.json();
      window._warLoading = false; if (!r.ok) window._warErr = j.message || 'Lookup failed.'; else window._warData = j; }
    catch (x) { window._warLoading = false; window._warErr = 'Could not reach the lookup service.'; }
    renderWar();
  });
}

/* ============================ LEGAL PAGES ============================ */
const CONTACT = 'https://github.com/ClashLabs/ClashLabs.github.io/issues';

function renderPrivacy() {
  app().innerHTML = `<h1 class="page">Privacy Policy</h1><div class="legal">
    <p class="updated">Last updated 15 October 2026</p>
    <p>ClashLabs is a free, unofficial Clash Royale fan project. There are no accounts and no sign-in. This page explains the small amount of data the site touches.</p>

    <h2>What we handle</h2>
    <p>When you enter a player tag in the Deck Lab or War Deck Builder, that tag is sent to our own lookup service (a Cloudflare Worker), which fetches your <b>public</b> Clash Royale profile and recent battles from Supercell's official API. We never ask for your name, email, or any password.</p>

    <h2>What we store</h2>
    <p>To power the site's stats, recent <b>public</b> battles from looked-up and tracked players are saved in our database (Cloudflare D1), and the public stats files are built from public competitive battles. The only information involved is your public in-game tag and public battle records, which anyone can already read from the official API. We do not store anything that identifies you off the game, because we never collect it.</p>

    <h2>Cookies and tracking</h2>
    <p>No ads, no analytics, no tracking cookies, no third-party scripts. The only things kept in your browser are your light/dark theme choice and a flag for whether you have seen the tour. Both are functional only and never leave your device.</p>

    <h2>Keeping and removing data</h2>
    <p>Public battle data is kept so the stats stay accurate over time. If you would like a specific player tag's cached data removed, <a href="${CONTACT}" rel="noopener noreferrer" target="_blank">open a request on our GitHub</a> and we will remove it.</p>

    <h2>Younger players</h2>
    <p>Many Clash Royale players are children. ClashLabs only ever handles a public player tag and public battle data; it does not collect personal details, and it has no accounts, chat, or payments. A parent or guardian who wants a tag removed can use the contact above.</p>

    <h2>Who else is involved</h2>
    <ul>
      <li><b>Supercell</b>, the official Clash Royale API (game data) and card images.</li>
      <li><b>Cloudflare</b>, hosts the lookup service and the database.</li>
      <li><b>GitHub</b>, hosts the website.</li>
    </ul>
    <p>Each of these has its own privacy terms.</p>

    <h2>Changes</h2>
    <p>If this policy changes, the date at the top will change with it.</p>

    <p class="disclaimer">This is a plain-language summary for a hobby project, not legal advice. Privacy rules vary by country; please check an official source if you need certainty.</p>
    <p style="margin-top:14px"><a href="#/terms">Terms of Service →</a></p>
  </div>`;
}

function renderTerms() {
  app().innerHTML = `<h1 class="page">Terms of Service</h1><div class="legal">
    <p class="updated">Last updated 15 October 2026</p>
    <p>ClashLabs is a free, unofficial, fan-made tool. By using it you agree to the following.</p>

    <h2>Not affiliated with Supercell</h2>
    <p>ClashLabs is not created, endorsed, or sponsored by Supercell. Clash Royale and all related names, cards, and images are the property of Supercell. The site follows Supercell's Fan Content Policy; game data and assets are used under that policy and the Clash Royale API terms.</p>

    <h2>Provided "as is"</h2>
    <p>The stats, synergies, and suggested decks are generated from public game data and come with no warranty. They may be incomplete, out of date, or wrong. Treat them as one input for fun, not a guarantee of results.</p>

    <h2>Fair use</h2>
    <p>Please use the site for personal, non-commercial purposes, and don't try to overload or abuse the lookup service.</p>

    <h2>Availability</h2>
    <p>This is a hobby project. It may change, break, or be shut down at any time, without notice.</p>

    <h2>Contact</h2>
    <p>Questions or requests: <a href="${CONTACT}" rel="noopener noreferrer" target="_blank">open an issue on our GitHub</a>.</p>

    <p class="disclaimer">This is a plain-language summary for a hobby project, not legal advice.</p>
    <p style="margin-top:14px"><a href="#/privacy">Privacy Policy →</a></p>
  </div>`;
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
    else if (route==='map') renderMatrix();
    else if (route==='builder') renderBuilder();
    else if (route==='war') renderWar();
    else if (route==='lab') renderDeckLab();
    else if (route==='finalists') renderFinalists();
    else if (route==='how') renderHow();
    else if (route==='privacy') renderPrivacy();
    else if (route==='terms') renderTerms();
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
      // root first (our deploy is flat), then data/; always revalidate so a stale cache can't bite
      for (const p of [name, 'data/'+name]) { try { const r=await fetch(p,{cache:'no-cache'}); if (r.ok) return await r.json(); } catch(e){} }
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
