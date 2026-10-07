/* ClashLabs — Clash Royale stats & deck tools. Self-contained, reads data/*.json. */
'use strict';
const DATA = {};
const MIN_DUELS = 5;
const CATS = [['all', 'All'], ['practice', 'Practice'], ['official', 'Official CRL']];
const FLAG = { Egypt:'🇪🇬', Brazil:'🇧🇷', 'South Korea':'🇰🇷', Japan:'🇯🇵',
  'Dominican Republic':'🇩🇴', Spain:'🇪🇸', Canada:'🇨🇦', Portugal:'🇵🇹', Germany:'🇩🇪',
  France:'🇫🇷', China:'🇨🇳' };

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = () => document.getElementById('app');
const flag = c => FLAG[c] || '🌐';
const wrCls = wr => wr == null ? '' : (wr >= 50 ? 'wrtxt-hi' : 'wrtxt-lo');
const pctTxt = v => v == null ? '—' : v + '%';
const P = () => DATA.players.players;
const byHandle = h => P().find(p => p.handle === h);

/* diverging heat color */
const hx = h => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.slice(i, i+2), 16)); };
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const HI = hx('#2bb0ef'), LO = hx('#f5733a'), MID = hx('#d7dbf2');
function heat(wr) {
  const t = Math.max(-1, Math.min(1, (wr - 50) / 50));
  const c = t >= 0 ? mix(MID, HI, t) : mix(MID, LO, -t);
  const lum = (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255;
  return { bg: `rgb(${c.join(',')})`, fg: lum > 0.62 ? '#06243a' : '#fff' };
}

const tipEl = () => document.getElementById('tip');
function bindTip(node, html) {
  node.addEventListener('mousemove', e => {
    const t = tipEl(); t.innerHTML = html; t.style.opacity = '1';
    t.style.left = Math.min(e.clientX + 14, innerWidth - 250) + 'px'; t.style.top = (e.clientY + 14) + 'px';
  });
  node.addEventListener('mouseleave', () => { tipEl().style.opacity = '0'; });
}

/* ring gauge */
function ring(wr, label, sub, big) {
  const r = 46, C = 2 * Math.PI * r, sw = big ? 10 : 9;
  if (wr == null) return `<div class="ring low"><div class="rwrap"><svg viewBox="0 0 108 108">
    <circle class="bgc" cx="54" cy="54" r="${r}" fill="none" stroke-width="${sw}"/></svg>
    <div class="rval">—</div></div><div class="rlab">${label}</div><div class="rsub">${sub || 'no data'}</div></div>`;
  const off = C * (1 - wr / 100), color = wr >= 50 ? 'var(--win)' : 'var(--lose)';
  return `<div class="ring"><div class="rwrap"><svg viewBox="0 0 108 108">
    <circle class="bgc" cx="54" cy="54" r="${r}" fill="none" stroke-width="${sw}"/>
    <circle class="fgc" cx="54" cy="54" r="${r}" fill="none" stroke-width="${sw}" stroke="${color}"
      stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 54 54)"/>
    </svg><div class="rval" style="color:${color}">${wr}%</div></div>
    <div class="rlab">${label}</div><div class="rsub">${sub || ''}</div></div>`;
}

function bars(rows, opt) {
  opt = opt || {};
  const mx = opt.max || Math.max(1, ...rows.map(r => r.value));
  return `<div class="bars">` + rows.map((r, i) => {
    const w = Math.max(4, Math.round(100 * r.value / mx));
    const g = i === 0 ? 'g1' : i === 1 ? 'g2' : i === 2 ? 'g3' : '';
    const val = opt.fmt ? opt.fmt(r.value) : (r.value + (opt.suffix || ''));
    return `<div class="bar"><div class="rk">${i+1}</div><div class="nm">${r.flag ? `<span>${r.flag}</span>` : ''}${esc(r.label)}</div>
      <div class="track"><div class="fill ${g}" data-w="${w}"></div></div><div class="val">${val}</div></div>`;
  }).join('') + `</div>`;
}
const anim = scope => scope.querySelectorAll('.fill[data-w]').forEach(f => { f.style.width = f.dataset.w + '%'; });
const animRings = scope => scope.querySelectorAll('.fgc').forEach(c => {}); // rings animate via CSS transition on load

/* =========================== pages =========================== */
function fcard(cls, ic, title, big, q) {
  return `<div class="fcard ${cls}"><div class="ic">${ic}</div><div class="t">${title}</div>
    <div class="big">${big}</div>${q ? `<div class="q">${q}</div>` : ''}</div>`;
}

function renderHome() {
  const F = DATA.facts.facts, M = DATA.meta;
  const sum = k => P().reduce((a, p) => a + (p[k] && p[k].games ? p[k].games : 0), 0);
  const bWR = (F.best_practice_duel_wr || [])[0], mG = (F.most_practice_games || [])[0], mP = (F.most_played_pair || [])[0];
  app().innerHTML = `
    <div class="hero">
      <h1>ClashLabs</h1>
      <p>Clash Royale stats and deck tools. Track the 16 CRL World Finalists — who's practising hardest and who beats who — and dig into the card synergies behind the competitive meta.</p>
      <div class="chips">
        <div class="chip"><span class="n">16</span><span class="l">Finalists</span></div>
        <div class="chip"><span class="n">${sum('practice').toLocaleString()}</span><span class="l">Practice games</span></div>
        <div class="chip"><span class="n">${sum('official').toLocaleString()}</span><span class="l">Official CRL games</span></div>
      </div>
    </div>
    <h2 class="sec">Spotlight</h2>
    <div class="grid facts">
      ${bWR ? fcard('fc1', '🔥', 'Best practice duel win rate', esc(bWR.handle), bWR.value + '% over their sets') : ''}
      ${mG ? fcard('fc2', '🎮', 'Most practice games', esc(mG.handle), mG.value.toLocaleString() + ' games tracked') : ''}
      ${mP ? fcard('fc3', '🤝', 'Most-played duo', esc(mP.finalist) + ' × ' + esc(mP.partner), mP.games + ' games together') : ''}
    </div>
    <h2 class="sec">The 16 finalists</h2>
    <div class="grid roster">${P().map(rosterCard).join('')}</div>`;
  anim(app());
}

function miniRing(wr) {
  if (wr == null) return `<div class="ring low mini"><div class="rwrap"><svg class="mini-ring" viewBox="0 0 108 108"><circle class="bgc" cx="54" cy="54" r="46" fill="none" stroke-width="12"/></svg></div></div>`;
  const C = 2 * Math.PI * 46, off = C * (1 - wr / 100), color = wr >= 50 ? 'var(--win)' : 'var(--lose)';
  return `<div class="ring mini" style="width:auto"><div class="rwrap"><svg class="mini-ring" viewBox="0 0 108 108">
    <circle class="bgc" cx="54" cy="54" r="46" fill="none" stroke-width="12"/>
    <circle class="fgc" cx="54" cy="54" r="46" fill="none" stroke-width="12" stroke="${color}"
      stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 54 54)"/></svg>
    <div class="rval" style="font-size:12px;color:${color}">${wr}%</div></div></div>`;
}
function rosterCard(p) {
  const pr = p.practice, low = pr && pr.duels < MIN_DUELS;
  const wr = pr && pr.duels >= MIN_DUELS ? pr.duel_wr : (pr && pr.games ? pr.duel_wr : null);
  return `<a class="pcard" href="#/p/${encodeURIComponent(p.handle)}"><div class="top"></div>
    <div class="body"><div class="flag">${flag(p.country)}</div>
      <div class="info"><div class="h">${esc(p.handle)}</div><div class="meta">${esc(p.country)}</div>
        <span class="qp">${esc(p.qual.split('(')[0].trim())}</span></div>
      ${low ? `<div style="text-align:center"><div class="note">${pctTxt(wr)}</div><div class="note" style="font-size:9px">small sample</div></div>` : miniRing(wr)}
    </div></a>`;
}

function renderFinalists() {
  app().innerHTML = `<h1 class="page">The 16 finalists</h1>
    <p class="sub">Tap a player for their win rates, favourite practice partners and head-to-head records.</p>
    <div class="grid roster">${P().map(rosterCard).join('')}</div>`;
  anim(app());
}

function renderPlayer(handle) {
  const p = byHandle(handle);
  if (!p) { app().innerHTML = `<p>Unknown player. <a href="#/finalists">Back</a></p>`; return; }
  const partners = DATA.partners.partners[handle] || [];
  const row = DATA.h2h.matrix[handle] || {};
  const rivals = DATA.h2h.order.filter(o => o !== handle && row[o] && row[o].all && row[o].all.duels >= MIN_DUELS)
    .map(o => ({ o, wr: row[o].all.duel_wr, g: row[o].all.games }));
  const best = [...rivals].sort((a, b) => b.wr - a.wr).slice(0, 4);
  const tough = [...rivals].sort((a, b) => a.wr - b.wr).slice(0, 4);
  const sub = c => c && c.games ? `${c.duels} duels` : '';
  const partRows = partners.map(pt => `<div class="prow"><div class="pn">${esc(pt.name)}${pt.is_finalist ? '<span class="pbadge">WF</span>' : ''}
      <div class="note">${pt.games} games together</div></div>
      <div class="pr"><b class="${wrCls(pt.duel_wr)}">${pctTxt(pt.duel_wr)}</b> duels<br><span class="note">${pctTxt(pt.game_wr)} games</span></div></div>`).join('')
    || `<div class="note">No practice partners recorded yet.</div>`;
  const pill = m => `<div class="mpill"><span>${esc(m.o)}</span><b class="${wrCls(m.wr)}">${m.wr}%</b></div>`;
  app().innerHTML = `
    <p class="note"><a href="#/finalists">← All players</a></p>
    <div class="card" style="display:flex;align-items:center;gap:16px;margin-bottom:6px">
      <div style="font-size:52px">${flag(p.country)}</div>
      <div><h1 class="page" style="margin:0">${esc(p.handle)}</h1>
        <div class="sub" style="margin:4px 0 0">${esc(p.country)} · ${esc(p.qual)}${p.last_active ? ` · last seen ${p.last_active}` : ''}</div></div>
    </div>
    <h2 class="sec">Win rates (by duel)</h2>
    <div class="card"><div class="rings">
      ${ring(p.practice ? p.practice.duel_wr : null, 'Practice', p.practice ? sub(p.practice) : '', true)}
      ${ring(p.official ? p.official.duel_wr : null, 'Official CRL', p.official ? sub(p.official) : '', true)}
      ${ring(p.overall ? p.overall.duel_wr : null, 'Overall', p.overall ? sub(p.overall) : '', true)}
    </div><p class="note" style="margin:12px 2px 0">Rings show the share of best-of sets won. Based on a sample from the public API.</p></div>
    <h2 class="sec">Favourite practice partners</h2>
    <div class="card"><div class="plist">${partRows}</div></div>
    ${rivals.length ? `<h2 class="sec">Matchups vs finalists</h2>
    <div class="mcols">
      <div class="card"><div class="note" style="margin-bottom:8px;font-weight:800;color:var(--win)">BEST RESULTS</div><div class="mlist">${best.map(pill).join('')}</div></div>
      <div class="card"><div class="note" style="margin-bottom:8px;font-weight:800;color:var(--lose)">TOUGHEST</div><div class="mlist">${tough.map(pill).join('')}</div></div>
    </div>` : ''}`;
}

let h2hCat = 'all';
function renderH2H() {
  const order = DATA.h2h.order, M = DATA.h2h.matrix;
  let html = `<h1 class="page">Head-to-Head</h1>
    <p class="sub">Each finalist's duel win rate vs every other finalist. <b style="color:var(--win)">Blue</b> = winning record, <b style="color:var(--lose)">orange</b> = losing. Hover a square for detail.</p>
    <div class="seg" id="seg">${CATS.map(c => `<button data-c="${c[0]}" class="${c[0] === h2hCat ? 'on' : ''}">${c[1]}</button>`).join('')}</div>
    <div class="card" style="margin-top:12px;padding:12px"><div class="heat-scroll"><table class="heat"><thead><tr><th></th>${order.map(o => `<th class="colh"><span>${esc(o)}</span></th>`).join('')}</tr></thead><tbody>`;
  for (const r of order) {
    html += `<tr><th class="rowh">${esc(r)}</th>`;
    for (const c of order) {
      if (r === c) { html += `<td class="self"></td>`; continue; }
      const cell = (M[r] && M[r][c]) ? M[r][c][h2hCat] : null;
      if (!cell || !cell.duels) { html += `<td class="empty">·</td>`; continue; }
      if (cell.duels < MIN_DUELS) { html += `<td class="empty" data-tip="${esc(r)} vs ${esc(c)} — ${cell.games}g, ${cell.duels}d (small sample)">${cell.duel_wr}</td>`; }
      else { const col = heat(cell.duel_wr);
        html += `<td data-bg="${col.bg}" data-fg="${col.fg}" data-tip="${esc(r)} vs ${esc(c)} — ${cell.games} games, ${cell.duels} duels · ${cell.duel_wr}% duel WR">${cell.duel_wr}</td>`; }
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div></div>`;
  app().innerHTML = html;
  app().querySelectorAll('td[data-bg]').forEach(td => { td.style.background = td.dataset.bg; td.style.color = td.dataset.fg; });
  app().querySelectorAll('td[data-tip]').forEach(td => bindTip(td, td.dataset.tip));
  document.getElementById('seg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { h2hCat = b.dataset.c; renderH2H(); }));
}

function renderCompare() {
  const order = DATA.h2h.order;
  const a = window._a || order[0], b = window._b || order[1];
  const pa = byHandle(a), pb = byHandle(b);
  const opt = sel => order.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');
  const h2h = (DATA.h2h.matrix[a] && DATA.h2h.matrix[a][b]) ? DATA.h2h.matrix[a][b].all : null;
  const side = p => `<div class="card" style="text-align:center">
    <div style="font-size:44px">${flag(p.country)}</div><div class="h" style="font-weight:900;font-size:19px">${esc(p.handle)}</div>
    <div class="note" style="margin-bottom:10px">${esc(p.country)}</div>
    <div class="rings" style="justify-content:center">
      ${ring(p.practice ? p.practice.duel_wr : null, 'Practice', p.practice ? p.practice.duels + ' duels' : '')}
      ${ring(p.official ? p.official.duel_wr : null, 'Official', p.official ? p.official.duels + ' duels' : '')}
    </div></div>`;
  let banner = `<div class="card" style="text-align:center"><div class="note">No recorded games between these two.</div></div>`;
  if (h2h && h2h.duels) {
    const aw = h2h.duel_wins, bw = h2h.duels - h2h.duel_wins, low = h2h.duels < MIN_DUELS;
    banner = `<div class="card" style="text-align:center">
      <div style="font-size:30px;font-weight:900"><span class="${aw>=bw?'wrtxt-hi':''}">${aw}</span> — <span class="${bw>aw?'wrtxt-hi':''}">${bw}</span></div>
      <div class="note">duels · ${esc(a)} vs ${esc(b)} (${h2h.games} games)${low ? ' · small sample' : ''}</div></div>`;
  }
  app().innerHTML = `<h1 class="page">Compare</h1>
    <p class="sub">Pick any two finalists to see their win rates side by side and who wins the head-to-head.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px"><select id="selA">${opt(a)}</select><select id="selB">${opt(b)}</select></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">${side(pa)}${side(pb)}</div>
    <h2 class="sec">Head-to-head</h2>${banner}`;
  document.getElementById('selA').addEventListener('change', e => { window._a = e.target.value; renderCompare(); });
  document.getElementById('selB').addEventListener('change', e => { window._b = e.target.value; renderCompare(); });
}

function renderFacts() {
  const F = DATA.facts.facts;
  const g = (arr, i) => (arr || [])[i];
  const lop = g(F.most_lopsided_rivalry, 0), ses = g(F.longest_day_session, 0), loy = g(F.most_loyal_partnership, 0);
  const bWR = g(F.best_practice_duel_wr, 0), mG = g(F.most_practice_games, 0), mP = g(F.most_played_pair, 0);
  const lb = (rows, fmt) => `<div class="card">${bars((rows || []).map(x => ({ label: x.handle, value: x.value, flag: (byHandle(x.handle) || {}).country ? flag(byHandle(x.handle).country) : '' })), { fmt })}</div>`;
  app().innerHTML = `<h1 class="page">Fun facts</h1>
    <p class="sub">The stories in the numbers — practice grind, rivalries and partnerships. All from summary stats, no decks.</p>
    <div class="grid facts">
      ${bWR ? fcard('fc1', '🔥', 'Best practice duel WR', esc(bWR.handle), bWR.value + '%') : ''}
      ${mG ? fcard('fc2', '🎮', 'Most practice games', esc(mG.handle), mG.value.toLocaleString() + ' games') : ''}
      ${mP ? fcard('fc3', '🤝', 'Most-played duo', esc(mP.finalist) + ' × ' + esc(mP.partner), mP.games + ' games') : ''}
      ${loy ? fcard('fc4', '💞', 'Most loyal partner', esc(loy.finalist) + ' → ' + esc(loy.partner), loy.share + '% of their practice') : ''}
      ${lop ? fcard('fc2', '😤', 'Most lopsided rivalry', esc(lop.finalist) + ' vs ' + esc(lop.partner), lop.game_wr + '% over ' + lop.games + ' games') : ''}
      ${ses ? fcard('fc3', '⏱️', 'Longest session in a day', esc(ses.finalist) + ' × ' + esc(ses.partner), ses.games + ' games · ' + ses.day) : ''}
    </div>
    <h2 class="sec">Most practice games</h2>${lb(F.most_practice_games, v => v.toLocaleString())}
    <h2 class="sec">Best practice duel win rate <span class="note">min ${MIN_DUELS} duels</span></h2>${lb(F.best_practice_duel_wr, v => v + '%')}`;
  anim(app());
}

/* =========================== Deck Lab (Model B — search your tag) =========================== */
/* Calls the Cloudflare Worker (CONFIG.apiBase) which returns the account's card collection,
   and computes personalised synergy picks from data/synergy.json IF that file is published.
   Only the viewer's OWN public account data is shown here. */
let CONFIG = { apiBase: '' };
let SYN = null;                         // loaded from data/synergy.json if present, else null

function evoBadge(c) {
  if (c.evolutionLevel > 0) return `<span class="evob on" title="Evolution unlocked">◆ EVO</span>`;
  if (c.maxEvolutionLevel > 0) return `<span class="evob" title="Evolution exists for this card (not unlocked)">◇</span>`;
  return '';
}
function ccard(c) {
  const under = c.maxLevel && c.level != null && c.level < c.maxLevel;
  return `<div class="ccard${c.evolutionLevel>0?' evo':''}">
    ${c.icon ? `<img loading="lazy" src="${esc(c.icon)}" alt="">` : `<div class="noic">${esc(c.name)}</div>`}
    <div class="cnm">${esc(c.name)}</div>
    <div class="clv ${under?'lo':'hi'}">Lv ${c.level ?? '—'}<span class="mx">/${c.maxLevel ?? '—'}</span></div>
    ${evoBadge(c)}</div>`;
}

function labSuggestions(cards) {
  if (!SYN) return `<div class="card"><div class="note">Synergy suggestions aren't enabled yet. (Add <code>data/synergy.json</code> to turn them on.)</div></div>`;
  const owned = new Set(cards.map(c => c.name));
  const lvl = {}; cards.forEach(c => lvl[c.name] = c);
  const pairs = (SYN.top_pairs || []).filter(p => owned.has(p.a) && owned.has(p.b))
    .sort((a, b) => (b.lift ?? -99) - (a.lift ?? -99)).slice(0, 8);
  const evos = cards.filter(c => c.evolutionLevel > 0 && SYN.evolutions && SYN.evolutions[c.name])
    .map(c => ({ c, e: SYN.evolutions[c.name] }));
  let html = '';
  if (pairs.length) {
    html += `<h2 class="sec">Strongest card pairs you own</h2>
      <p class="sub">Pairs from your collection that over-perform in competitive play. "Lift" = how much better the two win together vs. on their own.</p>
      <div class="synlist">` + pairs.map(p => `<div class="synpair">
        <div class="sp-cards">${esc(p.a)} <span class="plus">+</span> ${esc(p.b)}</div>
        <div class="sp-stat"><b class="${wrCls(p.wr)}">${p.wr}%</b> together <span class="note">· lift ${p.lift>=0?'+':''}${p.lift} · ${p.games}g</span></div>
      </div>`).join('') + `</div>`;
  }
  if (evos.length) {
    html += `<h2 class="sec">Your evolutions</h2>
      <p class="sub">Evolutions you've unlocked, with the owned cards they pair best with.</p>
      <div class="synlist">` + evos.map(({ c, e }) => {
        const bp = (e.best_partners || []).filter(x => owned.has(x.card)).slice(0, 3)
          .map(x => `${esc(x.card)} <span class="note">${x.wr}%</span>`).join(' · ') || '<span class="note">—</span>';
        return `<div class="synpair"><div class="sp-cards">◆ ${esc(c.name)} <span class="note">evo</span></div>
          <div class="sp-stat"><b class="${wrCls(e.evo_wr)}">${e.evo_wr}%</b> evolved <span class="note">(solo ${e.solo_wr}%)</span><br><span class="note">best with: ${bp}</span></div></div>`;
      }).join('') + `</div>`;
  }
  if (!pairs.length && !evos.length) html = `<div class="card"><div class="note">No synergy matches found for this collection yet.</div></div>`;
  return html;
}

function renderDeckLab() {
  if (!CONFIG.apiBase) {
    app().innerHTML = `<h1 class="page">Deck Lab</h1>
      <div class="card"><div class="note">Deck Lab isn't live yet — the lookup service hasn't been connected.</div></div>`;
    return;
  }
  const tag = window._labTag || '';
  const d = window._labData, err = window._labErr, loading = window._labLoading;
  let body = '';
  if (loading) body = `<div class="card"><div class="note">Looking up ${esc(tag)}…</div></div>`;
  else if (err) body = `<div class="card"><div class="note" style="color:var(--lose)">${esc(err)}</div></div>`;
  else if (d) {
    const evoCount = d.cards.filter(c => c.evolutionLevel > 0).length;
    body = `<div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div><h2 style="margin:0;font-size:22px;font-weight:900">${esc(d.name || tag)}</h2>
          <div class="note">${esc(d.tag)} · ${d.cardsOwned} cards · ${evoCount} evolutions unlocked</div></div></div>
      ${labSuggestions(d.cards)}
      <h2 class="sec">Your collection</h2>
      <div class="cardgrid">${d.cards.map(ccard).join('')}</div>`;
  }
  app().innerHTML = `<h1 class="page">Deck Lab</h1>
    <p class="sub">Enter your player tag to see your collection and the card synergies you can build right now. We only read your public account.</p>
    <form class="labsearch" id="labForm" autocomplete="off">
      <input id="labInput" placeholder="#YOURTAG" value="${esc(tag)}" maxlength="16" spellcheck="false">
      <button type="submit">Look up</button>
    </form>
    ${body}`;
  const form = document.getElementById('labForm');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = document.getElementById('labInput').value.trim();
    if (!v) return;
    window._labTag = v; window._labLoading = true; window._labErr = null; window._labData = null; renderDeckLab();
    try {
      const r = await fetch(CONFIG.apiBase + '/api/player?tag=' + encodeURIComponent(v.replace(/^#/, '')));
      const j = await r.json();
      window._labLoading = false;
      if (!r.ok) { window._labErr = j.message || 'Lookup failed.'; }
      else { window._labData = j; }
    } catch (x) { window._labLoading = false; window._labErr = 'Could not reach the lookup service.'; }
    renderDeckLab();
  });
}

/* router */
function render() {
  const parts = (location.hash || '#/').replace(/^#\//, '').split('/');
  document.querySelectorAll('nav.main a').forEach(a => a.classList.toggle('active', a.dataset.route === (parts[0] || '')));
  try {
    if (parts[0] === 'p') renderPlayer(decodeURIComponent(parts[1] || ''));
    else if (parts[0] === 'finalists') renderFinalists();
    else if (parts[0] === 'h2h') renderH2H();
    else if (parts[0] === 'compare') renderCompare();
    else if (parts[0] === 'facts') renderFacts();
    else if (parts[0] === 'lab') renderDeckLab();
    else renderHome();
  } catch (e) { app().innerHTML = `<p class="note">Something went wrong.</p>`; console.error(e); }
  scrollTo(0, 0);
}

function initTheme() {
  let t = null; try { t = localStorage.getItem('crl-theme'); } catch (e) {}
  document.documentElement.setAttribute('data-theme', t || 'dark');
  document.getElementById('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('crl-theme', next); } catch (e) {}
  });
}

async function boot() {
  initTheme();
  try {
    const files = ['players', 'partners', 'h2h', 'facts', 'meta'];
    const got = await Promise.all(files.map(f => fetch('data/' + f + '.json').then(r => r.json())));
    files.forEach((f, i) => DATA[f] = got[i]);
    document.getElementById('footgen').textContent = ' · Updated ' + DATA.meta.generated;
    // optional: Deck Lab config + synergy dataset (both may be absent)
    try { CONFIG = await fetch('data/config.json').then(r => r.ok ? r.json() : CONFIG); } catch (e) {}
    if (CONFIG.apiBase) { const n = document.getElementById('navLab'); if (n) n.hidden = false; }
    try { SYN = await fetch('data/synergy.json').then(r => r.ok ? r.json() : null); } catch (e) { SYN = null; }
    addEventListener('hashchange', render); render();
  } catch (e) { app().innerHTML = '<p class="note">Could not load data.</p>'; console.error(e); }
}
boot();
