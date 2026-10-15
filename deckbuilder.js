/* ClashLabs — deck-building engine (F1) + war optimiser (F4).
   Pure functions over the synergy dataset. Data-backed: card pairings come from
   the public 182k-game sample (SYN.partners / SYN.cards), never the scouting archive.
   No DOM here — app.js renders; this file is the brains and is unit-testable in Node. */
'use strict';
(function (root) {

  // --- Role classification (compact, high-confidence). Everything not listed is a troop. ---
  var SPELLS = ['Arrows', 'Barbarian Barrel', 'Clone', 'Earthquake', 'Fireball', 'Freeze',
    'Giant Snowball', 'Goblin Curse', 'Lightning', 'Mirror', 'Poison', 'Rage', 'Rocket',
    'Royal Delivery', 'The Log', 'Tornado', 'Void', 'Zap'];
  var BUILDINGS = ['Barbarian Hut', 'Bomb Tower', 'Cannon', 'Elixir Collector', 'Furnace',
    'Goblin Cage', 'Goblin Drill', 'Goblin Hut', 'Inferno Tower', 'Mortar', 'Tesla',
    'Tombstone', 'X-Bow'];
  // Win conditions offerable as a deck seed (mirrors the Synergy Tree's list).
  var WINCONS = ['Hog Rider', 'Royal Giant', 'Graveyard', 'X-Bow', 'Miner', 'Goblin Barrel',
    'Balloon', 'Mortar', 'Golem', 'Giant', 'Lava Hound', 'Goblin Drill', 'Three Musketeers',
    'Elixir Golem', 'Mega Knight', 'Royal Hogs', 'Wall Breakers'];

  // Cards that can target AIR (conservative — unknowns omitted, so the guarantee can only
  // over-provide anti-air, never falsely claim it). Troops + buildings only.
  var AIR = ['Archer Queen', 'Archers', 'Baby Dragon', 'Bats', 'Dart Goblin', 'Electro Dragon',
    'Electro Spirit', 'Electro Wizard', 'Executioner', 'Firecracker', 'Fire Spirit', 'Flying Machine',
    'Hunter', 'Ice Wizard', 'Inferno Dragon', 'Inferno Tower', 'Little Prince', 'Magic Archer',
    'Mega Minion', 'Minion Horde', 'Minions', 'Mother Witch', 'Musketeer', 'Phoenix', 'Princess',
    'Skeleton Dragons', 'Spear Goblins', 'Tesla', 'Witch', 'Wizard', 'Zappies'];
  // Cards that deal SPLASH / area damage (troops + buildings).
  var SPLASH = ['Baby Dragon', 'Bomb Tower', 'Bomber', 'Bowler', 'Dark Prince', 'Electro Dragon',
    'Executioner', 'Fire Spirit', 'Firecracker', 'Giant Skeleton', 'Ice Wizard', 'Magic Archer',
    'Mega Knight', 'Mother Witch', 'Princess', 'Sparky', 'Valkyrie', 'Witch', 'Wizard'];

  function toSet(a) { var s = {}; a.forEach(function (x) { s[x] = 1; }); return s; }
  var SPELL_SET = toSet(SPELLS), BUILD_SET = toSet(BUILDINGS), WIN_SET = toSet(WINCONS);
  var AIR_SET = toSet(AIR), SPLASH_SET = toSet(SPLASH);

  // Coarse role (for the one-building / spell-cap rules).
  function roleOf(c) { return SPELL_SET[c] ? 'spell' : (BUILD_SET[c] ? 'building' : 'troop'); }
  // Fine role (for swaps): a win condition swaps for a win condition, not for a support troop.
  function fineRole(c) { return WIN_SET[c] ? 'wincon' : roleOf(c); }

  // --- Engine. Constructed with the loaded SYN object so it's testable with any dataset. ---
  function Engine(SYN) {
    var cards = SYN.cards || {};
    var partners = SYN.partners || {};

    function meta(c) { return cards[c] || {}; }
    function elixir(c) { return meta(c).elixir || 0; }
    function wr(c) { return meta(c).wr == null ? 50 : meta(c).wr; }

    // lift between two cards from the adjacency, either direction.
    function lift(a, b) {
      var la = partners[a], lb = partners[b], i;
      if (la) for (i = 0; i < la.length; i++) if (la[i].card === b) return la[i].lift;
      if (lb) for (i = 0; i < lb.length; i++) if (lb[i].card === a) return lb[i].lift;
      return null;
    }

    // affinity of candidate c to a set: mean available lift, nudged by solo strength.
    function affinity(c, set) {
      var s = 0, n = 0;
      for (var i = 0; i < set.length; i++) { var l = lift(set[i], c); if (l != null) { s += l; n++; } }
      var base = (wr(c) - 50) * 0.18;              // small pull toward proven cards
      return (n ? s / n : -6) + base;              // unseen pairings penalised a little
    }

    function avgElixir(deck) {
      if (!deck.length) return 0;
      var t = 0; deck.forEach(function (c) { t += elixir(c); });
      return t / deck.length;
    }

    var ALL = Object.keys(cards);

    // Build an 8-card deck around a seed (win condition).
    //   locked : cards to force into the deck
    //   opts.pool   : restrict candidates to these card names (e.g. the cards a player owns)
    //   opts.weight : fn(card)->number added to a card's score (e.g. a level/evolution bonus)
    function buildDeck(seed, locked, opts) {
      locked = locked || []; opts = opts || {};
      var localAll = opts.pool ? opts.pool.filter(function (c) { return cards[c]; }) : ALL;
      if (localAll.indexOf(seed) < 0) localAll = [seed].concat(localAll);
      var wfn = opts.weight || function () { return 0; };
      // Need-based nudge: while the deck has no anti-air / no splash, prefer cards that add it.
      function needBonus(c) {
        var b = 0;
        if (AIR_SET[c] && !deck.some(function (x) { return AIR_SET[x]; })) b += 6;
        if (SPLASH_SET[c] && !deck.some(function (x) { return SPLASH_SET[x]; })) b += 3;
        return b;
      }
      function score(c, set) { return affinity(c, set) + wfn(c) + needBonus(c); }

      var deck = [];
      function add(c) { if (c && deck.indexOf(c) < 0 && deck.length < 8) deck.push(c); }
      add(seed);
      locked.forEach(add);

      var countRole = function (r) { return deck.filter(function (c) { return roleOf(c) === r; }).length; };

      function countWincons() { return deck.filter(function (c) { return WIN_SET[c]; }).length; }

      function eligible(wantRole, maxElix) {
        var spells = countRole('spell'), builds = countRole('building'), wins = countWincons();
        return localAll.filter(function (c) {
          if (deck.indexOf(c) >= 0) return false;
          var r = roleOf(c);
          if (r === 'building') { if (builds >= 1) return false; }          // <=1 building total
          if (r === 'spell' && spells >= 2 && !wantRole) return false;       // cap spells at 2 (auto)
          if (WIN_SET[c] && wins >= 2) return false;                         // <=2 win conditions total
          if (wantRole && r !== wantRole) return false;
          if (maxElix && elixir(c) > maxElix) return false;
          return true;
        });
      }

      function best(pool) {
        if (!pool.length) return null;
        pool.sort(function (a, b) { return score(b, deck) - score(a, deck); });
        return pool[0];
      }

      // Greedy fill with light shaping so the deck is legal and playable.
      var guard = 0;
      while (deck.length < 8 && guard++ < 40) {
        var slotsLeft = 8 - deck.length;
        var spells = countRole('spell');
        var cheap = deck.filter(function (c) { return elixir(c) <= 2; }).length;
        var want = null, maxE = 0;

        if (spells === 0 && slotsLeft <= 3) { want = 'spell'; maxE = 4; }        // guarantee a spell (prefer cheaper)
        else if (spells === 1 && slotsLeft <= 2) { want = 'spell'; }             // guarantee a 2nd spell
        else if (cheap === 0 && slotsLeft === 1) { maxE = 3; }                   // guarantee a cycle card last

        var pool = eligible(want, maxE);
        if (!pool.length) pool = eligible(want, 0);     // relax elixir cap if nothing fit
        if (!pool.length) pool = eligible(null, 0);     // relax role if still nothing
        var pick = best(pool);
        if (!pick) break;
        add(pick);
      }

      // Elixir sanity: if too heavy, swap the priciest non-seed troop for a cheaper high-affinity one.
      if (avgElixir(deck) > 4.4) {
        var heavy = deck.slice(1).filter(function (c) { return roleOf(c) === 'troop'; })
          .sort(function (a, b) { return elixir(b) - elixir(a); })[0];
        if (heavy) {
          var rest = deck.filter(function (c) { return c !== heavy; });
          var alt = localAll.filter(function (c) { return deck.indexOf(c) < 0 && roleOf(c) === 'troop' && elixir(c) <= 3; })
            .sort(function (a, b) { return score(b, rest) - score(a, rest); })[0];
          if (alt) deck[deck.indexOf(heavy)] = alt;
        }
      }

      // Anti-air guarantee: if the deck somehow ended with no air-targeting card, swap the
      // weakest-fit non-seed troop for the best available air-capable card.
      if (!deck.some(function (c) { return AIR_SET[c]; })) {
        var swappable = deck.slice(1).filter(function (c) { return roleOf(c) === 'troop' && !WIN_SET[c]; });
        if (swappable.length) {
          var weakest = swappable.sort(function (a, b) {
            var ra = deck.filter(function (x) { return x !== a; }), rb = deck.filter(function (x) { return x !== b; });
            return affinity(a, ra) - affinity(b, rb);
          })[0];
          var rest2 = deck.filter(function (c) { return c !== weakest; });
          var airAlt = localAll.filter(function (c) { return deck.indexOf(c) < 0 && AIR_SET[c] && roleOf(c) === 'troop'; })
            .sort(function (a, b) { return affinity(b, rest2) - affinity(a, rest2); })[0];
          if (airAlt) deck[deck.indexOf(weakest)] = airAlt;
        }
      }
      return deck;
    }

    // Top same-(fine)role swap suggestions for one card, ranked by fit with the rest of the deck.
    function swaps(deck, card, n) {
      n = n || 3;
      var r = fineRole(card), rest = deck.filter(function (c) { return c !== card; });
      return ALL.filter(function (c) { return deck.indexOf(c) < 0 && fineRole(c) === r; })
        .map(function (c) { return { card: c, score: affinity(c, rest), wr: wr(c), elixir: elixir(c) }; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, n);
    }

    // The strongest recorded pairs inside a finished deck (for the "why these cards" note).
    function deckPairs(deck, n) {
      n = n || 4;
      var out = [];
      for (var i = 0; i < deck.length; i++) for (var j = i + 1; j < deck.length; j++) {
        var l = lift(deck[i], deck[j]);
        if (l != null) out.push({ a: deck[i], b: deck[j], lift: l });
      }
      return out.sort(function (x, y) { return y.lift - x.lift; }).slice(0, n);
    }

    // --- F4: Clan War four-deck optimiser ---
    // owned: [{name, level, maxLevel, evolutionLevel}]. Builds up to `maxDecks` decks that share
    // NO card, drawing only from owned cards, biased toward the player's maxed & evolved copies.
    function warDecks(owned, maxDecks) {
      maxDecks = maxDecks || 4;
      var ownMap = {}; owned.forEach(function (o) { if (cards[o.name]) ownMap[o.name] = o; });
      var ownedNames = Object.keys(ownMap);
      function levelFrac(o) { return (o && o.maxLevel) ? Math.max(0, Math.min(1, (o.level || 0) / o.maxLevel)) : 0.5; }
      function hubScore(o) { return levelFrac(o) * 2 + (o.evolutionLevel > 0 ? 1 : 0) + wr(o.name) / 100; }

      var used = {};
      function poolFor() { return ownedNames.filter(function (n) { return !used[n]; }); }
      function weightFor() {
        return function (c) { var o = ownMap[c]; if (!o) return -999; return levelFrac(o) * 6 + (o.evolutionLevel > 0 ? 5 : 0); };
      }

      // Seeds: owned win conditions first (best level/evo/wr), then top owned hubs to reach maxDecks.
      var seeds = ownedNames.filter(function (c) { return WIN_SET[c]; })
        .sort(function (a, b) { return hubScore(ownMap[b]) - hubScore(ownMap[a]); })
        .slice(0, maxDecks);
      var usedSeed = toSet(seeds);
      while (seeds.length < maxDecks) {
        var extra = ownedNames.filter(function (n) { return !usedSeed[n] && !WIN_SET[n] && roleOf(n) === 'troop'; })
          .sort(function (a, b) { return hubScore(ownMap[b]) - hubScore(ownMap[a]); })[0];
        if (!extra) break;
        seeds.push(extra); usedSeed[extra] = 1;
      }

      var decks = [];
      seeds.forEach(function (seed, idx) {
        if (used[seed]) return;
        // Reserve the seeds we haven't built yet, so an earlier deck can't eat a later win condition.
        var future = toSet(seeds.slice(idx + 1));
        var pool = poolFor().filter(function (n) { return n === seed || !future[n]; });
        if (pool.length < 8) return;                       // not enough owned cards left for a full deck
        var deck = buildDeck(seed, [], { pool: pool, weight: weightFor() });
        if (deck.length < 8) return;
        deck.forEach(function (c) { used[c] = 1; });
        var lv = 0, evo = 0; deck.forEach(function (c) { var o = ownMap[c]; if (o) { lv += levelFrac(o); if (o.evolutionLevel > 0) evo++; } });
        decks.push({ seed: seed, cards: deck, avgElixir: avgElixir(deck), avgLevelFrac: lv / deck.length, evolutions: evo });
      });
      return decks;
    }

    return {
      buildDeck: buildDeck, swaps: swaps, deckPairs: deckPairs, warDecks: warDecks,
      avgElixir: avgElixir, roleOf: roleOf, fineRole: fineRole, lift: lift, affinity: affinity,
      elixir: elixir, wr: wr, all: ALL
    };
  }

  root.DeckBuilder = { Engine: Engine, SPELLS: SPELLS, BUILDINGS: BUILDINGS, WINCONS: WINCONS, roleOf: roleOf };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
