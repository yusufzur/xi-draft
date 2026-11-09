#!/usr/bin/env python3
"""Build a static snapshot of EA ratings, ESPN rosters, and UEFA entrants."""

import concurrent.futures
import html
import json
import re
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "global-data-2026-27.js"
EA_URL = "https://www.ea.com/games/ea-sports-fc/ratings"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"
LEAGUES = {
    "eng.1": ("Premier League", "13"),
    "esp.1": ("LaLiga", "53"),
    "ita.1": ("Serie A", "31"),
    "ger.1": ("Bundesliga", "19"),
    "fra.1": ("Ligue 1", "16"),
    "tur.1": ("Trendyol Süper Lig", "68"),
}
EUROPEAN_COMPETITIONS = {
    "uefa.champions": ("champions", "UEFA Champions League"),
    "uefa.europa": ("europa", "UEFA Europa League"),
    "uefa.europa.conf": ("conference", "UEFA Conference League"),
}
EA_POSITIONS = {
    "GK": ("GK", "Goalkeeper"), "CB": ("CB", "Centre-Back"),
    "LB": ("LB", "Left-Back"), "RB": ("RB", "Right-Back"),
    "LWB": ("LWB", "Left Wing-Back"), "RWB": ("RWB", "Right Wing-Back"),
    "CDM": ("CDM", "Defensive Midfield"), "CM": ("CM", "Central Midfield"),
    "CAM": ("CAM", "Attacking Midfield"), "LM": ("LM", "Left Midfield"),
    "RM": ("RM", "Right Midfield"), "LW": ("LW", "Left Winger"),
    "RW": ("RW", "Right Winger"), "ST": ("ST", "Striker"),
    "CF": ("CF", "Centre-Forward"),
}
NAME_ALIASES = {
    "manchester city": "man city", "manchester united": "man utd",
    "tottenham hotspur": "tottenham", "wolverhampton wanderers": "wolves",
    "spurs": "tottenham", "west ham united": "west ham",
    "brighton and hove albion": "brighton", "brighton hove albion": "brighton",
    "ipswich town": "ipswich",
    "newcastle united": "newcastle", "newcastle utd": "newcastle",
    "nottingham forest": "nottm forest", "nott m forest": "nottm forest",
    "athletic club": "athletic bilbao", "atletico madrid": "atletico",
    "atletico de madrid": "atletico",
    "real betis": "betis", "real sociedad": "sociedad",
    "inter milan": "inter", "internazionale": "inter",
    "ac milan": "milan", "as roma": "roma", "ss lazio": "lazio",
    "bergamo calcio": "atalanta", "lombardia": "inter", "milano": "milan",
    "ssc napoli": "napoli",
    "rc deportivo": "deportivo", "celta vigo": "celta", "rcd espanyol": "espanyol",
    "r racing": "racing santander", "d alaves": "alaves",
    "ca osasuna": "osasuna", "levante ud": "levante",
    "paris saint germain": "paris sg", "paris saint-germain": "paris sg",
    "borussia dortmund": "dortmund", "borussia monchengladbach": "gladbach",
    "bayern munich": "bayern", "rb leipzig": "leipzig",
    "1 koln": "cologne", "bayern munchen": "bayern", "bayer leverkusen": "leverkusen",
    "m gladbach": "gladbach", "1 fsv mainz 05": "mainz",
    "frankfurt": "eintracht frankfurt", "1 union berlin": "union berlin",
    "hamburger sv": "hamburg sv", "sv werder bremen": "werder bremen",
    "rc lens": "lens", "losc lille": "lille", "ol": "lyon", "om": "marseille",
    "ogc nice": "nice", "stade brestois 29": "brest", "angers sco": "angers",
    "havre": "le havre", "havre ac": "le havre", "estac troyes": "troyes",
    "galatasaray sk": "galatasaray", "fenerbahce sk": "fenerbahce",
    "besiktas jk": "besiktas", "trabzonspor": "trabzonspor",
    "basaksehir": "istanbul basaksehir", "erzurumspor": "erzurum bb",
    "amed sportif activites": "amed sfk", "amed sportif": "amed sfk",
    "amed sportif faaliyetler": "amed sfk",
}


def fetch(url):
    result = subprocess.run(
        ["curl", "-fsSL", "--compressed", "--max-time", "40", url],
        capture_output=True,
        check=True,
    )
    return result.stdout.decode("utf-8")


def fetch_json(url):
    return json.loads(fetch(url))


def normalized(value):
    value = value.replace("ı", "i")
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    value = re.sub(r"\b(football club|futbol kulubu|fc|cf|afc|ac|sc|sk|jk|fk|club)\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value).strip()
    return NAME_ALIASES.get(value, value)


def all_espn_teams(slug):
    data = fetch_json(f"{ESPN}/{slug}/teams?limit=100")
    teams = []
    for league in data.get("sports", [{}])[0].get("leagues", []):
        for item in league.get("teams", []):
            team = item.get("team", {})
            if team.get("id"):
                teams.append(team)
    if not teams:
        raise RuntimeError(f"No teams returned for ESPN competition {slug}")
    return teams


def team_logo(team):
    for logo in team.get("logos", []):
        if logo.get("href"):
            return logo["href"]
    team_id = team.get("id")
    return f"https://a.espncdn.com/i/teamlogos/soccer/500/{team_id}.png" if team_id else ""


def fetch_domestic_season_stats(slug, league_name):
    teams = all_espn_teams(slug)
    team_names = {str(team["id"]): team.get("displayName") or team.get("name", "") for team in teams}
    events = {}
    for calendar_year in (2025, 2026):
        data = fetch_json(
            f"{ESPN}/{slug}/scoreboard?dates={calendar_year}&limit=1000"
        )
        for event in data.get("events", []):
            season_year = (event.get("season") or {}).get("year")
            if season_year not in (2025, 2026):
                continue
            competition = (event.get("competitions") or [{}])[0]
            if not competition.get("status", {}).get("type", {}).get("completed"):
                continue
            competitors = competition.get("competitors", [])
            if len(competitors) != 2 or any(item.get("score") is None for item in competitors):
                continue
            home = next((item for item in competitors if item.get("homeAway") == "home"), None)
            away = next((item for item in competitors if item.get("homeAway") == "away"), None)
            if not home or not away:
                continue
            events[event["id"]] = (
                season_year,
                str(home.get("team", {}).get("id")),
                str(away.get("team", {}).get("id")),
                int(home["score"]),
                int(away["score"]),
            )

    season_tables = {}
    for year in (2025, 2026):
        rows = {}
        match_count = 0
        for season_year, home_id, away_id, home_score, away_score in events.values():
            if season_year != year:
                continue
            match_count += 1
            for team_id in (home_id, away_id):
                rows.setdefault(team_id, {
                    "played": 0, "wins": 0, "draws": 0, "losses": 0,
                    "points": 0, "goalsFor": 0, "goalsAgainst": 0,
                })
            home_row, away_row = rows[home_id], rows[away_id]
            home_row["played"] += 1
            away_row["played"] += 1
            home_row["goalsFor"] += home_score
            home_row["goalsAgainst"] += away_score
            away_row["goalsFor"] += away_score
            away_row["goalsAgainst"] += home_score
            if home_score > away_score:
                home_row["wins"] += 1
                away_row["losses"] += 1
                home_row["points"] += 3
            elif home_score < away_score:
                away_row["wins"] += 1
                home_row["losses"] += 1
                away_row["points"] += 3
            else:
                home_row["draws"] += 1
                away_row["draws"] += 1
                home_row["points"] += 1
                away_row["points"] += 1
        expected_matches = len(teams) * (len(teams) - 1)
        ranked = sorted(
            rows.items(),
            key=lambda item: (
                -item[1]["points"],
                -(item[1]["goalsFor"] - item[1]["goalsAgainst"]),
                -item[1]["goalsFor"],
                team_names.get(item[0], ""),
            ),
        )
        positions = {team_id: index + 1 for index, (team_id, _) in enumerate(ranked)}
        season_tables[year] = {
            "matchCount": match_count,
            "expectedMatchCount": expected_matches,
            "complete": match_count == expected_matches,
            "teams": {
                team_id: {**stats, "goalDifference": stats["goalsFor"] - stats["goalsAgainst"], "position": positions[team_id]}
                for team_id, stats in rows.items()
            },
        }
    if not season_tables[2025]["matchCount"]:
        raise RuntimeError(f"No completed 2025/26 matches returned for {league_name}.")
    if not season_tables[2026]["matchCount"]:
        raise RuntimeError(f"No completed 2026/27 matches returned for {league_name}.")
    return {
        "league": league_name,
        "source": "ESPN completed league match results",
        "asOf": datetime.now(timezone.utc).date().isoformat(),
        "teamNames": team_names,
        "teamLogos": {
            str(team["id"]): team_logo(team) for team in teams
        },
        "teamIdsByName": {
            normalized(name): team_id for team_id, name in team_names.items()
        },
        "seasons": {
            "2025-26": season_tables[2025],
            "2026-27": season_tables[2026],
        },
    }


def ea_stats(item, role):
    stats = item.get("stats") or {}
    value = lambda key: int((stats.get(key) or {}).get("value", 0))
    if role == "GK":
        return [
            value("gkDiving"), value("gkHandling"), value("gkKicking"),
            value("gkReflexes"), value("acceleration"), value("gkPositioning"),
        ]
    return [value(key) for key in ("pac", "sho", "pas", "dri", "def", "phy")]


def ea_player(item, group_label):
    position = item.get("position") or {}
    primary = position.get("shortLabel", "")
    roles = [primary] if primary in EA_POSITIONS else []
    for alternate in item.get("alternatePositions") or []:
        short = alternate.get("shortLabel")
        if short in EA_POSITIONS and short not in roles:
            roles.append(short)
    if not roles:
        return None
    player_name = item.get("commonName") or " ".join(
        part for part in (item.get("firstName"), item.get("lastName")) if part
    )
    team = item.get("team") or {}
    return {
        "id": f"fc27-{item['id']}",
        "name": player_name,
        "club": team.get("label", ""),
        "roles": roles,
        "rating": int(item.get("overallRating") or 60),
        "stats": ea_stats(item, primary),
        "position": position.get("label") or EA_POSITIONS[primary][1],
        "photo": item.get("avatarUrl", ""),
        "league": group_label,
        "teamId": team.get("id"),
        "ratingSource": "EA SPORTS FC 27 ratings page",
        "positionSource": "EA SPORTS FC 27",
        "playerSource": "EA SPORTS FC 27 ratings page",
    }


def estimate_from_espn(athlete, team_name, competition):
    raw_position = (athlete.get("position") or {}).get("name", "").lower()
    if "goalkeeper" in raw_position:
        roles, position = ["GK"], "Goalkeeper"
    elif "defender" in raw_position:
        roles, position = ["CB", "LB", "RB"], "Defender (broad roster position)"
    elif "midfielder" in raw_position:
        roles, position = ["CDM", "CM", "CAM", "LM", "RM"], "Midfielder (broad roster position)"
    else:
        roles, position = ["LW", "RW", "ST"], "Forward (broad roster position)"
    statistics = athlete.get("statistics") or {}
    appearances = 0
    for split in statistics.get("splits", {}).get("categories", []):
        for stat in split.get("stats", []):
            if stat.get("name") == "appearances":
                appearances = int(stat.get("value", 0))
    rating = max(60, min(76, 62 + appearances // 5))
    if roles == ["GK"]:
        stats = [rating, rating, rating - 2, rating + 1, rating - 3, rating]
    elif roles[0] == "CB":
        stats = [rating - 4, rating - 2, rating, rating - 1, rating + 5, rating + 3]
    elif roles[0] == "CDM":
        stats = [rating - 2, rating - 1, rating + 2, rating - 1, rating + 3, rating + 2]
    elif roles[0] in ("LW", "RW", "ST"):
        stats = [rating + 3, rating + 2, rating, rating + 2, rating - 6, rating - 1]
    else:
        stats = [rating, rating - 1, rating + 2, rating + 1, rating - 1, rating]
    return {
        "id": f"espn-{athlete['id']}",
        "name": athlete.get("displayName") or athlete.get("fullName") or "Unknown player",
        "club": team_name,
        "roles": roles,
        "rating": rating,
        "stats": [max(35, min(95, value)) for value in stats],
        "position": position,
        "photo": (athlete.get("headshot") or {}).get("href", ""),
        "league": competition,
        "ratingSource": "Estimated gameplay rating; not an EA rating",
        "positionSource": "ESPN broad roster category",
        "playerSource": "ESPN club roster",
        "seasonAppearances": appearances,
    }


def validate_snapshot(data):
    players = data["players"]
    player_ids = [player["id"] for player in players]
    if len(player_ids) != len(set(player_ids)):
        raise RuntimeError("The generated player pool contains duplicate player IDs.")
    if any(not isinstance(player["rating"], int) or not 1 <= player["rating"] <= 99 or
           len(player["stats"]) != 6 or any(not isinstance(value, int) or not 0 <= value <= 99 for value in player["stats"])
           for player in players):
        raise RuntimeError("The generated player pool contains invalid ratings or attributes.")
    required_roles = ("GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST")
    for role in required_roles:
        if sum(role in player["roles"] for player in players) < 5:
            raise RuntimeError(f"The generated player pool has fewer than five candidates for {role}.")
    for key, teams in data["competitions"].items():
        ids = [team["id"] for team in teams]
        if len(teams) != 36 or len(ids) != len(set(ids)):
            raise RuntimeError(f"The {key} competition does not have 36 unique entrants.")
    if len(data["teams"]) != 114 or set(data["teamStats"]) != {str(team["id"]) for team in data["teams"]}:
        raise RuntimeError("The domestic club list or season-stat tables are incomplete.")
    for team in data["teams"]:
        stats = data["teamStats"][str(team["id"])]
        if not team.get("espnId") or team.get("teamStats") != stats:
            raise RuntimeError(f"Missing ESPN club match for {team['name']}.")
        if any(season not in stats or season not in stats["meta"] for season in ("2025-26", "2026-27")):
            raise RuntimeError(f"Missing season metadata for {team['name']}.")
    if any(
        player.get("ratingSource") == "EA SPORTS FC 27 ratings page"
        and str(player.get("teamId")) not in data["teamStats"]
        for player in players
    ):
        raise RuntimeError("An EA player is missing a linked domestic club.")


def main():
    page = fetch(EA_URL)
    next_data = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', page, re.S
    )
    if not next_data:
        raise RuntimeError("The EA ratings page did not contain its public ratings payload.")
    ea_data = json.loads(html.unescape(next_data.group(1)))
    build_id = ea_data["buildId"]
    page_props = ea_data["props"]["pageProps"]
    group_by_id = {
        str(group["id"]): group
        for group in page_props["ratingsFilters"]["teamGroups"]
    }

    selected_groups = []
    for league_slug, (league_name, group_id) in LEAGUES.items():
        group = group_by_id.get(group_id)
        if not group:
            raise RuntimeError(f"EA team group {group_id} ({league_name}) is missing.")
        expected_count = 20 if league_slug in ("eng.1", "esp.1", "ita.1") else 18
        if len(group.get("teams", [])) != expected_count:
            raise RuntimeError(
                f"EA returned {len(group.get('teams', []))} clubs for {league_name}; "
                f"expected {expected_count}."
            )
        selected_groups.append((league_slug, league_name, group))

    domestic_stats = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {
            pool.submit(fetch_domestic_season_stats, slug, name): slug
            for slug, name, _ in selected_groups
        }
        for future in concurrent.futures.as_completed(futures):
            domestic_stats[futures[future]] = future.result()

    european_teams = {}
    for slug, (key, title) in EUROPEAN_COMPETITIONS.items():
        european_teams[key] = all_espn_teams(slug)
        if len(european_teams[key]) != 36:
            raise RuntimeError(f"{title} returned {len(european_teams[key])} teams, expected 36.")

    # The six requested domestic groups provide official EA ratings for their squads.
    ea_team_records = []
    for league_slug, league_name, group in selected_groups:
        for team in group.get("teams", []):
            ea_team_records.append({
                "id": team["id"], "name": team["label"], "league": league_name,
                "leagueCode": league_slug, "logo": team.get("imageUrl", ""),
            })
    for record in ea_team_records:
        source = domestic_stats[record["leagueCode"]]
        espn_id = source["teamIdsByName"].get(normalized(record["name"]))
        if not espn_id:
            raise RuntimeError(
                f"Could not match {record['name']} to the ESPN {record['league']} table."
            )
        record["sourceName"] = record["name"]
        record["name"] = source["teamNames"][espn_id]
        record["logo"] = source["teamLogos"].get(espn_id) or record["logo"]
        record["espnId"] = espn_id
        record["teamStats"] = {
            season_name: season["teams"].get(espn_id)
            for season_name, season in source["seasons"].items()
        }
        record["teamStats"]["meta"] = {
            season_name: {
                "matchCount": season["matchCount"],
                "expectedMatchCount": season["expectedMatchCount"],
                "complete": season["complete"],
                "asOf": source["asOf"],
            }
            for season_name, season in source["seasons"].items()
        }

    # Match UEFA entrants to the sourced squad groups, then fetch ESPN only for
    # UEFA clubs outside the six EA domestic groups.
    ea_team_by_name = {}
    for record in ea_team_records:
        ea_team_by_name.setdefault(normalized(record["name"]), record)
    competition_teams = {}
    unmatched = {}
    for key, teams in european_teams.items():
        competition_teams[key] = []
        for team in teams:
            name = team.get("displayName") or team.get("name") or ""
            matched = ea_team_by_name.get(normalized(name))
            roster_club = matched["name"] if matched else name
            competition_teams[key].append({
                "id": f"espn-{team['id']}",
                "espnId": str(team["id"]),
                "name": name,
                "short": team.get("abbreviation") or name[:3].upper(),
                "logo": team_logo(team),
                "rosterClub": roster_club,
                "league": matched["league"] if matched else "UEFA entrant",
                "rosterSource": "EA SPORTS FC 27" if matched else "ESPN",
            })
            if not matched:
                unmatched[str(team["id"])] = (key, name, team_logo(team))

    # Download the current FC27 player lists concurrently; the team filters are
    # publicly embedded in EA's ratings page and avoid fragile name-based scraping.
    def fetch_ea_team(record):
        url = f"https://www.ea.com/_next/data/{build_id}/games/ea-sports-fc/ratings.json?team={record['id']}"
        payload = fetch_json(url)
        details = payload.get("pageProps", {}).get("ratingDetails", {})
        rows = details.get("items", [])
        if not rows:
            raise RuntimeError(f"EA returned an empty squad for {record['name']}.")
        if details.get("totalItems") != len(rows):
            raise RuntimeError(f"EA returned an incomplete squad for {record['name']}.")
        return record, rows

    players = []
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(fetch_ea_team, team) for team in ea_team_records]
        for future in concurrent.futures.as_completed(futures):
            try:
                record, rows = future.result()
                for item in rows:
                    player = ea_player(item, record["league"])
                    if player:
                        player["club"] = record["name"]
                        player["teamId"] = record["id"]
                        player["clubLogo"] = record["logo"]
                        players.append(player)
            except Exception as error:  # Fail the build rather than emit incomplete clubs.
                errors.append(str(error))
    if errors:
        raise RuntimeError("EA squad import failed: " + "; ".join(errors[:8]))

    # Non-top-five UEFA teams use the ESPN roster snapshot and explicitly marked
    # estimated ratings, never an invented attribution to EA.
    def fetch_espn_roster(team_id, key, team_name, logo):
        slug = next(slug for slug, (comp_key, _) in EUROPEAN_COMPETITIONS.items() if comp_key == key)
        roster = fetch_json(f"{ESPN}/{slug}/teams/{team_id}/roster")
        athletes = roster.get("athletes", [])
        if not athletes:
            raise RuntimeError(f"No ESPN roster returned for {team_name}.")
        players = []
        for athlete in athletes:
            if not athlete.get("id"):
                continue
            player = estimate_from_espn(athlete, team_name, EUROPEAN_COMPETITIONS[slug][1])
            player["clubLogo"] = logo
            players.append(player)
        return team_id, players

    roster_results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        futures = [
            pool.submit(fetch_espn_roster, team_id, key, team_name, logo)
            for team_id, (key, team_name, logo) in unmatched.items()
        ]
        for future in concurrent.futures.as_completed(futures):
            team_id, roster = future.result()
            roster_results[team_id] = roster
    espn_records = [player for roster in roster_results.values() for player in roster]
    clubs_per_player = {}
    for player in espn_records:
        clubs_per_player.setdefault(player["id"], set()).add(player["club"])
    conflicting_ids = {
        player_id for player_id, player_clubs in clubs_per_player.items()
        if len(player_clubs) > 1
    }
    if conflicting_ids:
        print(f"Skipped {len(conflicting_ids)} ESPN player records with conflicting club rosters.")
    players.extend(player for player in espn_records if player["id"] not in conflicting_ids)

    # Give every official entrant its sourced competition and roster snapshot
    # metadata for game scheduling, while retaining one dataset across modes.
    for teams in competition_teams.values():
        for team in teams:
            if team["rosterSource"] == "ESPN":
                team["rosterClub"] = team["name"]

    output = {
        "meta": {
            "season": "2026/27",
            "ratingVersion": "EA SPORTS FC 27 ratings page",
            "ratingSource": EA_URL,
            "clubAndRosterSources": "EA SPORTS FC ratings page and ESPN public soccer API",
            "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
            "leagueCounts": {
                name: len(group.get("teams", []))
                for _, name, group in selected_groups
            },
            "seasonStatsAsOf": {
                domestic_stats[slug]["league"]: domestic_stats[slug]["asOf"]
                for slug, _, _ in selected_groups
            },
            "seasonStatsSource": "ESPN completed domestic-league match results; positions sorted by points, goal difference, and goals scored",
            "uefaCounts": {key: len(teams) for key, teams in competition_teams.items()},
            "note": "The page identifies itself as FC 27; some EA portrait asset URLs still contain FC25. ESPN-only player ratings are estimates, not official EA ratings.",
        },
        "players": players,
        "teams": ea_team_records,
        "teamStats": {team["id"]: team["teamStats"] for team in ea_team_records},
        "competitions": competition_teams,
    }
    validate_snapshot(output)
    OUTPUT.write_text(
        "window.GLOBAL_DATA = " + json.dumps(output, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {OUTPUT.name}: {len(players)} players, {len(ea_team_records)} EA clubs, "
        f"{sum(len(teams) for teams in competition_teams.values())} UEFA entries."
    )
    for name, count in output["meta"]["leagueCounts"].items():
        print(f"  {name}: {count} clubs")
    for key, count in output["meta"]["uefaCounts"].items():
        print(f"  {key}: {count} entrants")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
