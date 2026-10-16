"""
fetch_meta_decks.py — build a PUBLIC meta-decks dataset for ClashLabs' War Deck Builder.

Pulls the top global ladder players from the OFFICIAL Clash Royale API, reads their recent
battle logs, extracts the winning/played 8-card 1v1 decks, and aggregates them into
meta_decks.json (deck usage + win rate). This is public ladder meta — NOT the CRL scouting
roster — so it never touches the private archive (firewall stays intact), and it uses the
official API (not RoyaleAPI's site), so it respects data-source terms.

Run it where your API token's allowed IP is valid:

  # A) locally on the machine whose IP the token allows (direct API):
  CR_API_TOKEN='<your token>' python3 fetch_meta_decks.py

  # B) via the RoyaleAPI proxy with a proxy-whitelisted token (e.g. the scout's secret):
  CR_API_TOKEN='<proxy token>' CR_API_BASE='https://proxy.royaleapi.dev/v1' python3 fetch_meta_decks.py

Then copy meta_decks.json into the ClashLabs repo's data/ folder and push.

Tunables via env: N_PLAYERS (default 200), MIN_GAMES (3), TOP_DECKS (80), OUT (meta_decks.json).
"""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error
from collections import defaultdict, Counter
from datetime import datetime, timezone

BASE = os.environ.get("CR_API_BASE", "https://api.clashroyale.com/v1").rstrip("/")
TOKEN = os.environ.get("CR_API_TOKEN")
N_PLAYERS = int(os.environ.get("N_PLAYERS", "200"))
MIN_GAMES = int(os.environ.get("MIN_GAMES", "3"))
TOP_DECKS = int(os.environ.get("TOP_DECKS", "80"))
OUT = os.environ.get("OUT", "meta_decks.json")

# Competitive 1v1 battle types worth counting toward "meta".
LADDER_TYPES = {"PvP", "pathOfLegend", "trophyRoad", "ranked1v1", "ranked1v1_newArena2"}

if not TOKEN:
    sys.exit("Set CR_API_TOKEN (your Clash Royale API token). See the file header for how to run.")


def api(path):
    url = BASE + path
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + TOKEN,
                                               "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # Surface the API's real reason (e.g. accessDenied.invalidIp with the IP it saw).
        try:
            body = e.read().decode("utf-8", "replace")[:400]
        except Exception:
            body = ""
        raise RuntimeError("HTTP %s on %s -> %s" % (e.code, path, body))


def top_player_tags():
    # Global trophy-road rankings. (If this returns nothing on the current season, the
    # account can switch to a Path-of-Legends season endpoint; trophy rankings is the
    # simplest broad sample.)
    try:
        data = api("/locations/global/rankings/players?limit=%d" % N_PLAYERS)
        tags = [p["tag"] for p in data.get("items", []) if p.get("tag")]
        if tags:
            return tags[:N_PLAYERS]
    except Exception as e:
        print("global rankings failed (%s); trying Path of Legends…" % e)
    # Fallback: current Path of Legends season rankings.
    try:
        seasons = api("/locations/global/pathoflegend/seasons")
        sid = (seasons.get("items") or [{}])[-1].get("id")
        if sid:
            data = api("/locations/global/pathoflegend/%s/rankings/players?limit=%d" % (sid, N_PLAYERS))
            return [p["tag"] for p in data.get("items", []) if p.get("tag")][:N_PLAYERS]
    except Exception as e:
        print("path of legends rankings failed: %s" % e)
    return []


def main():
    tags = top_player_tags()
    if not tags:
        sys.exit("Could not fetch a top-players list from the API. Check the token/IP and endpoints.")
    print("Top players fetched: %d" % len(tags))

    deck = defaultdict(lambda: [0, 0])          # sorted 8-name tuple -> [games, wins]
    deck_evo = defaultdict(Counter)             # deck -> Counter(evolved card names)
    seen = set()                                # (playerTag, battleTime) de-dup
    scanned = 0

    for i, tag in enumerate(tags):
        try:
            battles = api("/players/%s/battlelog" % urllib.parse.quote(tag))
        except Exception as e:
            print("  battlelog %s failed: %s" % (tag, e))
            continue
        scanned += 1
        for b in battles:
            if b.get("type") not in LADDER_TYPES:
                continue
            team, opp = b.get("team") or [], b.get("opponent") or []
            if len(team) != 1 or len(opp) != 1:
                continue
            me = team[0]
            cards = me.get("cards") or []
            if len(cards) != 8:
                continue
            key = (me.get("tag"), b.get("battleTime"))
            if key in seen:
                continue
            seen.add(key)
            mc, oc = me.get("crowns"), opp[0].get("crowns")
            if mc is None or oc is None or mc == oc:
                continue
            names = tuple(sorted(c["name"] for c in cards))
            win = mc > oc
            deck[names][0] += 1
            deck[names][1] += 1 if win else 0
            for c in cards:
                if c.get("evolutionLevel"):
                    deck_evo[names][c["name"]] += 1
        if (i + 1) % 25 == 0:
            print("  …%d/%d players, %d distinct decks so far" % (i + 1, len(tags), len(deck)))
        time.sleep(0.12)  # be gentle on the rate limit

    rows = []
    for names, (g, w) in deck.items():
        if g < MIN_GAMES:
            continue
        rows.append({"cards": list(names),
                     "evo": [n for n, _ in deck_evo[names].most_common(2)],
                     "count": g, "wins": w, "winrate": round(100.0 * w / g, 1)})
    rows.sort(key=lambda r: (-r["count"], -r["winrate"]))
    rows = rows[:TOP_DECKS]

    out = {"source": "live",
           "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
           "players_scanned": scanned,
           "sample_games": sum(r["count"] for r in rows),
           "decks": rows}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("Wrote %s — %d decks from %d games across %d players." %
          (OUT, len(rows), out["sample_games"], scanned))


if __name__ == "__main__":
    main()
