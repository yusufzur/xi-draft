# Global player and competition data

The app ships a static snapshot in `global-data-2026-27.js`; gameplay does not call EA or ESPN at runtime. Regenerate it with `python3 scripts/import-global-data.py` when refreshing the season snapshot.

## What is included

- Player ratings, primary/alternate positions, six gameplay attributes, team names and portraits are imported from EA's public [FC ratings page](https://www.ea.com/games/ea-sports-fc/ratings), filtered to the Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 and Trendyol Süper Lig team groups. The page currently identifies its ratings as EA SPORTS FC 27. The ratings are shown as EA-page values, not independently verified in-game launch-card values.
- EA portrait URLs in the current page payload still contain `/FC25/`. The interface and this note flag that mismatch; confirm the data version and image permissions before presenting the data as a definitive FC 27 database.
- The pre-existing Turkish roster snapshot is retained, including any players without an EA match. Unmatched entries keep their existing estimated ratings.
- The 2026/27 Champions League, Europa League and Conference League entry lists are imported from ESPN's public soccer API. Club logos use ESPN or EA image URLs. UEFA entrants outside the six EA league groups use ESPN roster names/positions and clearly labeled estimated gameplay ratings, not fabricated EA ratings.
- The five European league rosters and Süper Lig group are sourced as the current EA page snapshot, not as a verified registration list from each league or club. Transfer windows and roster feeds can change.
- Draft cards include 2025/26 and in-progress 2026/27 club league results where EA and ESPN team identities can be matched. The generated tables count completed ESPN score-feed matches and rank teams by points, goal difference, then goals scored; they are not official standings and do not apply every league's head-to-head tie-break rules. Positions are snapshots as of the displayed date. A missing team row means no completed score-feed result was available for that club.
- The 2025/26 Ligue 1 score feed is missing one result in the current snapshot, so its prior-season positions are marked partial rather than final. In-progress 2026/27 rows are naturally provisional.
- Competition-selection and tournament screens use ESPN-hosted league emblems. The distinct blue/orange/green UEFA competition accents are original game UI styling, not official UEFA brand colors.

## Competition simulation limits

The European lists contain the published 36 participants. The user's XI replaces the lowest-rated available entrant so the simulation has 36 teams. Each team plays eight generated, non-repeating league-phase fixtures. The 36-team table routes the top eight directly to the round of 16, ranks 9–24 to a play-off, and eliminates ranks 25–36. Knockout ties are single-match simulations. The generated schedule, match results, tie-break simulation, and knockout games are gameplay approximations, not official UEFA fixtures or a reproduction of every UEFA rule.

Tournament top-scorer and top-assister tables are generated from each campaign's simulated results and saved player lineups; individual goal and assist credits are gameplay estimates, not official football statistics. Scorers and assists from played user fixtures are recorded as the goals happen and displayed under the match score. The tournament view shows the overall top five and a separate complete list of user-squad contributions, so user players remain visible even when outside the overall top five. Drafts now include an 11-player starting XI plus four role-based substitutes; up to five substitutions are permitted at 15-minute breaks, with a substituted-out player unable to re-enter. A finished XI is locked out of starting another tournament: the user can review its campaign and must draft a different XI to compete again. Previously entered XI signatures persist across new drafts in the local game save.

The participant lists reflect the published 2026/27 competition entrants; domestic results are contextual player-card information and are not used to re-rank UEFA entry lists. In-game tournament standings are generated from the user's saved simulated matches.

## Regeneration and review

The import script reads the public EA page payload and ESPN team, completed-score, and roster endpoints, validates the expected 18/20-club league sizes and 36 entrants per UEFA competition, and fails instead of writing a partial snapshot. It also checks that each EA domestic club is linked to a corresponding ESPN results table. Review the snapshot date, team memberships, duplicate roster conflicts, and rating-version note before refreshing or publishing.

Names, ratings, portraits, crests and league marks may be protected by intellectual-property, publicity or data-use rights. Public availability is not a license. Obtain permission or an appropriate license before public distribution, and update the privacy notice and CSP when image providers change.
