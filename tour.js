/* ClashLabs — guided tour.
   Self-contained: injects its own CSS, draws a bottom card + moving spotlight,
   walks the visitor through each section, and puts any in-progress state back
   exactly as it was when the tour closes. No external dependencies. */
'use strict';
(function () {

  /* ============================ ENGINE ============================ */
  /* Reusable across sites. A site supplies a config:
       { seenKey, title, steps, enter(step), snapshot(), restore(snap) }
     step = { group, title, text, target, pad }
       target : CSS selector, or ()=>Element, or null (centered intro card)
       enter  : called before each step so the site can route / open a tab /
                load demo data. May be async-ish; we then poll for target. */
  function SiteTour(cfg) {
    var steps = cfg.steps, N = steps.length;
    var i = 0, active = false, raf = 0, poll = 0, snap = null, root, card, spot, prefersReduce;

    function css() {
      if (document.getElementById('tour-css')) return;
      var s = document.createElement('style');
      s.id = 'tour-css';
      s.textContent =
        '.tour-root{position:fixed;inset:0;z-index:99998;font-family:var(--font,system-ui,sans-serif)}' +
        '.tour-catch{position:absolute;inset:0;background:transparent}' +
        '.tour-spot{position:fixed;z-index:99998;border-radius:12px;border:2px solid var(--accent,#3987e5);' +
          'box-shadow:0 0 0 9999px rgba(8,8,10,.60),0 0 0 2px rgba(255,255,255,.25);' +
          'pointer-events:none;transition:left .28s cubic-bezier(.4,.1,.2,1),top .28s cubic-bezier(.4,.1,.2,1),' +
          'width .28s cubic-bezier(.4,.1,.2,1),height .28s cubic-bezier(.4,.1,.2,1);display:none}' +
        '.tour-root.nospot .tour-spot{display:none}' +
        '.tour-root.nospot .tour-catch{background:rgba(8,8,10,.60)}' +
        '.tour-card{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:99999;width:min(560px,calc(100vw - 24px));' +
          'background:var(--surface,#1a1a19);color:var(--ink,#fff);border:1px solid var(--border,rgba(255,255,255,.14));' +
          'border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.45);padding:16px 18px 14px;box-sizing:border-box}' +
        '.tour-card .tc-top{display:flex;align-items:center;gap:8px;margin-bottom:7px}' +
        '.tour-card .tc-grp{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--accent,#3987e5)}' +
        '.tour-card .tc-x{margin-left:auto;background:none;border:0;color:var(--muted,#999);font-size:19px;line-height:1;cursor:pointer;padding:0 2px}' +
        '.tour-card .tc-x:hover{color:var(--ink,#fff)}' +
        '.tour-card h4{margin:0 0 5px;font-size:17px;font-weight:800;letter-spacing:-.01em}' +
        '.tour-card .tc-text{margin:0;font-size:14px;line-height:1.5;color:var(--ink2,#c3c2b7)}' +
        '.tour-card .tc-text b{color:var(--ink,#fff)}' +
        '.tour-card .tc-foot{display:flex;align-items:center;gap:10px;margin-top:14px}' +
        '.tour-card .tc-dots{display:flex;gap:5px;flex-wrap:wrap;flex:1;min-width:0}' +
        '.tour-card .tc-dot{width:7px;height:7px;border-radius:50%;background:var(--border,#444);border:0;padding:0;cursor:pointer;transition:background .2s,transform .2s}' +
        '.tour-card .tc-dot.on{background:var(--accent,#3987e5);transform:scale(1.35)}' +
        '.tour-card .tc-dot.done{background:var(--muted,#888)}' +
        '.tour-card select.tc-jump{max-width:150px;font-size:12px;padding:5px 6px;border-radius:8px;border:1px solid var(--border,#444);' +
          'background:var(--surface2,#242423);color:var(--ink,#fff);cursor:pointer}' +
        '.tour-card .tc-btn{font-size:13px;font-weight:700;padding:7px 14px;border-radius:9px;cursor:pointer;border:1px solid var(--border,#444);' +
          'background:var(--surface2,#242423);color:var(--ink,#fff)}' +
        '.tour-card .tc-btn:hover{border-color:var(--accent,#3987e5)}' +
        '.tour-card .tc-btn.primary{background:var(--accent,#3987e5);border-color:var(--accent,#3987e5);color:#fff}' +
        '.tour-card .tc-btn[disabled]{opacity:.4;cursor:default}' +
        '.tour-launch{cursor:pointer}' +
        '@media (max-width:560px){.tour-card{bottom:10px;padding:14px 14px 12px}.tour-card select.tc-jump{display:none}}' +
        '@media (prefers-reduced-motion:reduce){.tour-spot{transition:none}}';
      document.head.appendChild(s);
    }

    function resolve(s) {
      if (!s.target) return null;
      try { return typeof s.target === 'function' ? s.target() : document.querySelector(s.target); }
      catch (e) { return null; }
    }

    function place() {
      if (!active) return;
      var s = steps[i], t = resolve(s);
      if (t) {
        var r = t.getBoundingClientRect(), p = s.pad == null ? 6 : s.pad;
        root.classList.remove('nospot');
        spot.style.display = 'block';
        spot.style.left = (r.left - p) + 'px';
        spot.style.top = (r.top - p) + 'px';
        spot.style.width = (r.width + p * 2) + 'px';
        spot.style.height = (r.height + p * 2) + 'px';
      } else {
        root.classList.add('nospot');
        spot.style.display = 'none';
      }
      raf = requestAnimationFrame(place);
    }

    function scrollInto(t) {
      var r = t.getBoundingClientRect();
      var cardH = card ? card.getBoundingClientRect().height + 28 : 180;
      var viewable = window.innerHeight - cardH;            // room above the card
      var want = Math.max(70, viewable / 2);                // desired distance from top
      var delta = (r.top + r.height / 2) - want - r.height / 2;
      if (Math.abs(delta) > 8) window.scrollBy({ top: delta, left: 0, behavior: prefersReduce ? 'auto' : 'smooth' });
    }

    function jumpOptions() {
      var seen = {}, html = '', open = false;
      for (var k = 0; k < N; k++) {
        var g = steps[k].group || 'Steps';
        if (g !== seen.g) { if (open) html += '</optgroup>'; html += '<optgroup label="' + esc(g) + '">'; open = true; seen.g = g; }
        html += '<option value="' + k + '"' + (k === i ? ' selected' : '') + '>' + (k + 1) + '. ' + esc(steps[k].title) + '</option>';
      }
      if (open) html += '</optgroup>';
      return html;
    }

    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function renderCard() {
      var s = steps[i];
      var dots = '';
      for (var k = 0; k < N; k++) dots += '<button class="tc-dot ' + (k === i ? 'on' : (k < i ? 'done' : '')) + '" data-k="' + k + '" aria-label="Step ' + (k + 1) + '"></button>';
      card.innerHTML =
        '<div class="tc-top"><span class="tc-grp">' + esc(s.group || 'Tour') + ' · ' + (i + 1) + '/' + N + '</span>' +
        '<button class="tc-x" aria-label="Close tour">&times;</button></div>' +
        '<h4>' + esc(s.title) + '</h4><p class="tc-text">' + (s.text || '') + '</p>' +
        '<div class="tc-foot"><div class="tc-dots">' + dots + '</div>' +
        '<select class="tc-jump" aria-label="Jump to section">' + jumpOptions() + '</select>' +
        '<button class="tc-btn tc-prev"' + (i === 0 ? ' disabled' : '') + '>Back</button>' +
        '<button class="tc-btn primary tc-next">' + (i === N - 1 ? 'Done' : 'Next') + '</button></div>';
      card.querySelector('.tc-x').onclick = close;
      card.querySelector('.tc-prev').onclick = function () { go(i - 1); };
      card.querySelector('.tc-next').onclick = function () { i === N - 1 ? close() : go(i + 1); };
      card.querySelector('.tc-jump').onchange = function (e) { go(+e.target.value); };
      [].forEach.call(card.querySelectorAll('.tc-dot'), function (d) { d.onclick = function () { go(+d.dataset.k); }; });
    }

    function go(n) {
      if (n < 0 || n >= N) return;
      i = n;
      var s = steps[i];
      clearInterval(poll); cancelAnimationFrame(raf);
      try { if (cfg.enter) cfg.enter(s); } catch (e) {}
      renderCard();
      // wait for the step's target to exist (route/tab/demo may still be rendering)
      var tries = 0;
      poll = setInterval(function () {
        tries++;
        var t = resolve(s);
        if (t || !s.target || tries > 24) {
          clearInterval(poll);
          if (t) scrollInto(t);
          renderCard();
          cancelAnimationFrame(raf); place();
        }
      }, 110);
    }

    function key(e) {
      if (!active) return;
      if (e.key === 'Escape') { close(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); i < N - 1 ? go(i + 1) : close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (i > 0) go(i - 1); }
    }

    function open() {
      if (active) return;
      prefersReduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
      css();
      try { snap = cfg.snapshot ? cfg.snapshot() : null; } catch (e) { snap = null; }
      root = document.createElement('div'); root.className = 'tour-root';
      var catch_ = document.createElement('div'); catch_.className = 'tour-catch';
      spot = document.createElement('div'); spot.className = 'tour-spot';
      card = document.createElement('div'); card.className = 'tour-card';
      root.appendChild(catch_); root.appendChild(spot); root.appendChild(card);
      document.body.appendChild(root);
      active = true;
      addEventListener('keydown', key, true);
      go(0);
    }

    function close() {
      if (!active) return;
      active = false;
      clearInterval(poll); cancelAnimationFrame(raf);
      removeEventListener('keydown', key, true);
      if (root && root.parentNode) root.parentNode.removeChild(root);
      try { if (cfg.restore) cfg.restore(snap); } catch (e) {}
      try { localStorage.setItem(cfg.seenKey, '1'); } catch (e) {}
    }

    function seen() { try { return localStorage.getItem(cfg.seenKey) === '1'; } catch (e) { return false; } }

    return { open: open, close: close, seen: seen };
  }

  /* ======================= CLASHLABS CONFIG ======================= */
  var hash = function (h) { if (location.hash !== h) location.hash = h; };

  // A clearly-fictional example collection for the Deck Lab demo — no live API call.
  // Chosen so several real top-pairs and a couple of evolutions always render.
  var DEMO = {
    name: 'Example Player', cardsOwned: 110,
    cards: [
      { name: 'Goblin Barrel', level: 14, maxLevel: 14, evolutionLevel: 1, maxEvolutionLevel: 1, icon: null },
      { name: 'Goblin Giant', level: 14, maxLevel: 14, evolutionLevel: 0, maxEvolutionLevel: 0, icon: null },
      { name: 'Goblin Demolisher', level: 13, maxLevel: 14, evolutionLevel: 0, maxEvolutionLevel: 0, icon: null },
      { name: 'Musketeer', level: 14, maxLevel: 14, evolutionLevel: 0, maxEvolutionLevel: 1, icon: null },
      { name: 'Skeleton Army', level: 13, maxLevel: 14, evolutionLevel: 0, maxEvolutionLevel: 0, icon: null },
      { name: 'Inferno Dragon', level: 14, maxLevel: 14, evolutionLevel: 1, maxEvolutionLevel: 1, icon: null },
      { name: 'Witch', level: 13, maxLevel: 14, evolutionLevel: 0, maxEvolutionLevel: 0, icon: null },
      { name: 'Royal Hogs', level: 12, maxLevel: 14, evolutionLevel: 1, maxEvolutionLevel: 1, icon: null }
    ]
  };

  var tour = SiteTour({
    seenKey: 'clashlabs-tour-v1',

    snapshot: function () {
      return {
        hash: location.hash,
        line: window._line, labTag: window._labTag, labData: window._labData,
        labErr: window._labErr, labLoading: window._labLoading, a: window._a, b: window._b,
        scrollY: window.scrollY
      };
    },
    restore: function (s) {
      if (!s) { hash('#/'); return; }
      window._line = s.line; window._labTag = s.labTag; window._labData = s.labData;
      window._labErr = s.labErr; window._labLoading = s.labLoading; window._a = s.a; window._b = s.b;
      if (location.hash === s.hash) { if (typeof render === 'function') render(); }
      else location.hash = s.hash || '#/';
      setTimeout(function () { window.scrollTo(0, s.scrollY || 0); }, 30);
    },

    // Each step may route (nav) and then set up a demo (setup). The engine then
    // polls for the step's target, so setup can trigger an async re-render safely.
    enter: function (s) { if (s.nav) s.nav(); if (s.setup) s.setup(); },

    steps: [
      { group: 'Welcome', title: 'Welcome to ClashLabs', target: null,
        nav: function () { hash('#/'); },
        text: 'A quick tour of the site. ClashLabs turns a large sample of competitive 1v1 games into card-synergy tools and stats on the CRL World Finalists. Use <b>Next</b> / <b>Back</b> or the arrow keys, and <b>Esc</b> to leave any time — nothing you were doing is lost.' },

      { group: 'Navigate', title: 'Everything lives up here', target: 'header .main', pad: 4,
        nav: function () { hash('#/'); },
        text: 'Five sections: <b>Home</b>, the <b>Synergy Tree</b>, the <b>Deck Lab</b>, the <b>World Finalists</b> stats, and <b>How it works</b>. The ◐ button toggles light and dark; the <b>?</b> reopens this tour.' },

      { group: 'Synergy Tree', title: 'Start from a win condition', target: '.seedgrid, .tree-start',
        nav: function () { hash('#/tree'); },
        setup: function () { window._line = []; if (typeof render === 'function') render(); },
        text: 'The Synergy Tree works like a chess opening tree, but for decks: pick a win condition and follow the branches. Built from <b>182,611</b> competitive 1v1 games — real outcomes, not opinion.' },

      { group: 'Synergy Tree', title: 'Win rate and "lift"', target: '.branches',
        nav: function () { hash('#/tree'); },
        setup: function () { window._line = [{ card: 'Hog Rider', wr: (SYN && SYN.cards['Hog Rider'] && SYN.cards['Hog Rider'].wr) || null, lift: null }]; if (typeof render === 'function') render(); },
        text: 'Seeded with <b>Hog Rider</b>. Each branch shows how often that pairing <b>wins</b> and its <b>lift</b> — how much better two cards do together than apart. High lift is genuine synergy, not just two strong cards sharing a slot.' },

      { group: 'Deck Lab', title: 'Build around what you own', target: '#labForm',
        nav: function () { hash('#/lab'); },
        setup: function () { window._labData = null; window._labErr = null; window._labLoading = false; window._labTag = ''; if (typeof render === 'function') render(); },
        text: 'The Deck Lab reads <b>only your public account</b> from your player tag — your collection, your evolutions, and the strongest card pairs you can actually build right now.' },

      { group: 'Deck Lab', title: 'Your strongest pairs', target: '.synlist',
        nav: function () { hash('#/lab'); },
        setup: function () { window._labData = DEMO; window._labErr = null; window._labLoading = false; window._labTag = '#EXAMPLE'; if (typeof render === 'function') render(); },
        text: 'An <b>example</b> result (not a real account). Each pair is scored by win rate and lift, so you can see which of your cards genuinely work together — and which evolutions pull their weight.' },

      { group: 'World Finalists', title: 'The 16 at Worlds', target: '.tbl',
        nav: function () { hash('#/finalists'); },
        setup: function () { finClickTab('players'); },
        text: 'Practice and official win rates for every 2026 World Finalist, plus who they practise with. Click any player for their detail page.' },

      { group: 'World Finalists', title: 'Head-to-head heatmap', target: '.heat',
        nav: function () { hash('#/finalists'); },
        setup: function () { finClickTab('h2h'); },
        text: 'The <b>Head-to-Head</b> grid shows every finalist against every other — <b>blue</b> is a winning record, <b>red</b> a losing one, graded by win rate. Hover any cell for the exact record.' },

      { group: 'Finish', title: 'That’s the tour', target: null,
        nav: function () { hash('#/how'); },
        text: 'The <b>How it works</b> page breaks the method down step by step. Reopen this tour any time from the <b>?</b> button in the top bar. Have fun digging in.' }
    ]
  });

  // Click a World Finalists sub-tab, retrying until the page has rendered it.
  function finClickTab(which) {
    var n = 0;
    (function tryit() {
      var seg = document.querySelector('#finseg');
      var done = which === 'players' ? document.querySelector('.tbl') : document.querySelector('.heat');
      if (seg && !done) { var btn = seg.querySelector('button[data-t="' + which + '"]'); if (btn) btn.click(); }
      if (!done && n++ < 25) setTimeout(tryit, 100);
    })();
  }

  /* Expose + launch button + auto-open on first visit */
  window.ClashLabsTour = tour;

  function addLaunchButton() {
    var nav = document.querySelector('header .main');
    if (!nav || document.getElementById('tourBtn')) return;
    var b = document.createElement('button');
    b.id = 'tourBtn'; b.className = 'theme-btn tour-launch'; b.title = 'Take the tour';
    b.setAttribute('aria-label', 'Take the guided tour');
    b.textContent = '?';
    b.onclick = function () { tour.open(); };
    var theme = document.getElementById('themeBtn');
    nav.insertBefore(b, theme || null);
  }

  function init() {
    addLaunchButton();
    if (!tour.seen()) setTimeout(function () { tour.open(); }, 900);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();

})();
