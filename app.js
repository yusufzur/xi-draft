const STORAGE_KEY = "xi-draft-superlig-2026-27-v3";
const RATING_NOTE = "EA player ratings are taken from EA's FC 27 ratings page. Players without an EA entry use clearly labeled estimates; some EA portrait asset URLs still say FC25.";
const competitionCatalog = {
  superlig: { title: "Süper Lig Cup", short: "SÜPER LİG", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/18.png", teams: window.CURRENT_SEASON_TEAMS },
  champions: { title: "UEFA Champions League", short: "CHAMPIONS LEAGUE", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png", teams: window.GLOBAL_DATA.competitions.champions },
  europa: { title: "UEFA Europa League", short: "EUROPA LEAGUE", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png", teams: window.GLOBAL_DATA.competitions.europa },
  conference: { title: "UEFA Conference League", short: "CONFERENCE LEAGUE", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/20296.png", teams: window.GLOBAL_DATA.competitions.conference },
};
const clubs = window.CURRENT_SEASON_TEAMS;

function normalizeClubName(value) {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").toLowerCase().replace(/\b(football club|futbol kulubu|fc|cf|afc|ac|sc|sk|jk|fk|club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/\bmanchester city\b/, "man city")
    .replace(/\bmanchester united\b/, "man utd")
    .replace(/\btottenham hotspur\b/, "tottenham")
    .replace(/\bwolverhampton wanderers\b/, "wolves")
    .replace(/\binter milan\b/, "inter")
    .replace(/\bparis saint germain\b/, "paris sg");
}

function playerIdentity(player) {
  return `${normalizeClubName(player.name)}|${normalizeClubName(player.club)}`;
}

function squadSignature(picks) {
  return [...picks.map((pick) => pick.playerId)].sort().join("|");
}

const globalPlayers = window.GLOBAL_DATA.players;
const globalTeamStats = window.GLOBAL_DATA.teamStats || {};
const globalPlayerByIdentity = new Map(globalPlayers.map((player) => [playerIdentity(player), player]));
const legacyPlayers = window.CURRENT_SEASON_PLAYERS.map((player) => {
  const sourced = globalPlayerByIdentity.get(playerIdentity(player));
  return sourced ? { ...player, ...sourced, id: player.id, photo: player.photo || sourced.photo } : player;
});
const legacyPlayerIdentities = new Set(legacyPlayers.map(playerIdentity));
const players = [
  ...legacyPlayers,
  ...globalPlayers.filter((player) => !legacyPlayerIdentities.has(playerIdentity(player))),
];
const playerIds = new Set(players.map((player) => player.id));

const formations = {
  "4-3-3": [
    { id: "LW", role: "LW", row: 0 }, { id: "ST", role: "ST", row: 0 }, { id: "RW", role: "RW", row: 0 },
    { id: "CM1", role: "CM", row: 1 }, { id: "CDM", role: "CDM", row: 1 }, { id: "CM2", role: "CM", row: 1 },
    { id: "LB", role: "LB", row: 2 }, { id: "CB1", role: "CB", row: 2 }, { id: "CB2", role: "CB", row: 2 }, { id: "RB", role: "RB", row: 2 },
    { id: "GK", role: "GK", row: 3 },
  ],
  "4-2-3-1": [
    { id: "ST", role: "ST", row: 0 },
    { id: "LM", role: "LM", row: 1 }, { id: "CAM", role: "CAM", row: 1 }, { id: "RM", role: "RM", row: 1 },
    { id: "CDM1", role: "CDM", row: 2 }, { id: "CDM2", role: "CDM", row: 2 },
    { id: "LB", role: "LB", row: 3 }, { id: "CB1", role: "CB", row: 3 }, { id: "CB2", role: "CB", row: 3 }, { id: "RB", role: "RB", row: 3 },
    { id: "GK", role: "GK", row: 4 },
  ],
};
const benchSlots = [
  { id: "BENCH-GK", label: "Goalkeeper", roles: ["GK"] },
  { id: "BENCH-DEF", label: "Defender", roles: ["CB", "LB", "RB", "LWB", "RWB"] },
  { id: "BENCH-MID", label: "Midfielder", roles: ["CDM", "CM", "CAM", "LM", "RM"] },
  { id: "BENCH-FWD", label: "Forward", roles: ["LW", "RW", "ST", "CF"] },
];
const roleFallbacks = {
  LB: ["LWB", "RB", "CB"],
  RB: ["RWB", "LB", "CB"],
  LWB: ["LB", "CB"],
  RWB: ["RB", "CB"],
  LW: ["LM", "RW"],
  RW: ["RM", "LW"],
  LM: ["LW", "CM"],
  RM: ["RW", "CM"],
  CAM: ["CM"],
  CDM: ["CM"],
  CM: ["CDM", "CAM"],
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
let toastTimer;
let storageWarning = "";
let soundOn = false;
let state = loadState();
state.draftId ||= createId();
state.playedSquads ||= [];
state.bench ||= [];
if (state.tournament) {
  state.tournament.id ||= createId();
  state.tournament.draftId ||= state.draftId;
  state.tournament.playerStats ||= [];
  const signature = squadSignature(state.squad, state.formation);
  if (!state.playedSquads.includes(signature)) state.playedSquads.push(signature);
}
saveState();

function initialState() {
  return { version: 3, draftId: createId(), phase: "setup", formation: "4-3-3", competition: "superlig", round: 0, squad: [], bench: [], match: null, tournament: null, playedSquads: [], record: { played: 0, wins: 0, draws: 0, losses: 0 } };
}

function createId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function isValidState(value) {
  if (!value || value.version !== 3 || !["setup", "draft", "bench", "complete", "match", "match-result", "tournament"].includes(value.phase)) return false;
  if (value.competition !== undefined && !Object.hasOwn(competitionCatalog, value.competition)) return false;
  if (!Object.hasOwn(formations, value.formation) || !Number.isInteger(value.round) || !Array.isArray(value.squad)) return false;
  const slots = formations[value.formation];
  if (value.round < 0 || value.round > slots.length || value.squad.length !== value.round || !Array.isArray(value.bench || [])) return false;
  const bench = value.bench || [];
  if (bench.length > benchSlots.length) return false;
  if (value.playedSquads !== undefined && (!Array.isArray(value.playedSquads) || value.playedSquads.some((signature) => typeof signature !== "string"))) return false;
  if (!value.record || !["played", "wins", "draws", "losses"].every((key) => Number.isInteger(value.record[key]) && value.record[key] >= 0)) return false;
  const ids = new Set();
  const slotIds = new Set();
  for (const pick of value.squad) {
    const player = players.find((item) => item.id === pick.playerId);
    const slot = slots.find((item) => item.id === pick.slotId);
    if (!player || !slot || !player.roles.includes(slot.role) || ids.has(player.id) || slotIds.has(slot.id)) return false;
    ids.add(player.id);
    slotIds.add(slot.id);
  }
  for (const [index, pick] of bench.entries()) {
    const player = players.find((item) => item.id === pick.playerId);
    if (!player || pick.slotId !== benchSlots[index].id ||
        !player.roles.some((role) => benchSlots[index].roles.includes(role)) ||
        ids.has(player.id) || slotIds.has(pick.slotId)) return false;
    ids.add(player.id);
    slotIds.add(pick.slotId);
  }
  if (value.phase === "setup") return value.round === 0 && bench.length === 0 && value.match === null && value.tournament === null;
  if (value.phase === "draft") return value.round < slots.length && bench.length === 0 && value.match === null && value.tournament === null;
  if (value.phase === "bench") return value.round === slots.length && bench.length < benchSlots.length && value.match === null && value.tournament === null;
  if (value.round !== slots.length) return false;
  if (!value.tournament) {
    if (value.phase === "complete" && (bench.length === 0 || bench.length === benchSlots.length)) {
      if (value.match === null) return true;
      if (value.match.tournament) return false;
    } else if (!["match", "match-result"].includes(value.phase)) return false;
  } else {
    if (!isValidTournament(value.tournament, slots)) return false;
    if (value.phase === "tournament" && value.match === null) return true;
    if (value.phase === "complete" && value.match === null) return true;
    if (!["complete", "tournament", "match", "match-result"].includes(value.phase)) return false;
  }
  const match = value.match;
  if (!match || !Number.isInteger(match.number) || !Number.isInteger(match.minute) || ![0, 15, 30, 45, 60, 75, 90].includes(match.minute)) return false;
  const lineup = match.lineup || value.squad;
  const rosterIds = new Set([...value.squad, ...bench].map((pick) => pick.playerId));
  const lineupIds = new Set();
  const lineupSlots = new Set();
  if (!Array.isArray(match.opponent) || match.opponent.length !== slots.length || !Array.isArray(lineup) ||
      lineup.length !== slots.length ||
      lineup.some((pick) => {
        const player = players.find((item) => item.id === pick.playerId);
        const slot = slots.find((item) => item.id === pick.slotId);
        if (!player || !slot || !rosterIds.has(player.id) || lineupIds.has(player.id) || lineupSlots.has(pick.slotId) ||
            !player.roles.some((role) => positionGroupForRole(role) === positionGroupForRole(slot.role))) return true;
        lineupIds.add(player.id);
        lineupSlots.add(pick.slotId);
        return false;
      }) ||
      !Array.isArray(match.score) || match.score.length !== 2 || !match.score.every(Number.isInteger)) return false;
  if (!Array.isArray(match.log) || !Array.isArray(match.shots) || match.shots.length !== 2 || !["attack", "balanced", "defend"].includes(match.tactic)) return false;
  if (value.phase === "match-result" && match.minute !== 90) return false;
  if (value.phase === "match" && match.minute >= 90) return false;
  if (Boolean(match.tournament) !== Boolean(value.tournament)) return false;
  const opponentIds = new Set();
  const validOpponent = match.opponent.every((pick, index) => {
    const player = players.find((item) => item.id === pick.playerId);
    const acceptedRoles = [slots[index].role, ...(roleFallbacks[slots[index].role] || [])];
    if (!player || opponentIds.has(player.id) || !match.tournament && !player.roles.some((role) => acceptedRoles.includes(role))) return false;
    opponentIds.add(player.id);
    return true;
  });
  const substitutions = match.substitutions ?? 0;
  const usedSubstitutes = match.usedSubstitutes || [];
  const substitutedOut = match.substitutedOut || [];
  if (!Array.isArray(usedSubstitutes) || !Array.isArray(substitutedOut)) return false;
  const usedSubstituteIds = new Set(usedSubstitutes);
  const substitutedOutIds = new Set(substitutedOut);
  return validOpponent && Number.isInteger(substitutions) && substitutions >= 0 && substitutions <= 5 &&
    usedSubstitutes.length === substitutions && usedSubstituteIds.size === substitutions &&
    usedSubstitutes.every((playerId) => bench.some((pick) => pick.playerId === playerId)) &&
    substitutedOut.length === substitutions && substitutedOutIds.size === substitutions &&
    substitutedOut.every((playerId) => rosterIds.has(playerId) && !lineupIds.has(playerId));
}

function isValidTournament(tournament, slots) {
  const validPlayerStats = (rows) => rows === undefined || Array.isArray(rows) && rows.every((row) =>
    row && playerIds.has(row.playerId) && Number.isInteger(row.goals) && row.goals >= 0 &&
    Number.isInteger(row.assists) && row.assists >= 0
  );
  if (tournament?.competition && tournament.competition !== "superlig") {
    if (!Object.hasOwn(competitionCatalog, tournament.competition)) return false;
    const teamIds = new Set((tournament.teams || []).map((team) => team.id));
    if (tournament.teams?.length !== 36 || teamIds.size !== 36 || !teamIds.has("your-xi")) return false;
    if (!["league", "knockout", "eliminated"].includes(tournament.phaseType)) return false;
    if (!["active", "champion", "eliminated"].includes(tournament.status) ||
        tournament.phaseType === "league" && tournament.status !== "active" ||
        tournament.phaseType === "eliminated" && tournament.status !== "eliminated") return false;
    if (!Array.isArray(tournament.schedule) || tournament.schedule.length !== 8 ||
        tournament.schedule.some((round) => !Array.isArray(round) || round.length !== 18)) return false;
    const seenPairs = new Set();
    for (const round of tournament.schedule) {
      const entrants = new Set();
      for (const current of round) {
        if (!teamIds.has(current.home) || !teamIds.has(current.away) || current.home === current.away) return false;
        entrants.add(current.home);
        entrants.add(current.away);
        const pair = [current.home, current.away].sort().join("|");
        if (seenPairs.has(pair)) return false;
        seenPairs.add(pair);
      }
      if (entrants.size !== 36) return false;
    }
    if (!Array.isArray(tournament.table) || tournament.table.length !== 36 ||
        tournament.table.some((row) => !teamIds.has(row.teamId) ||
          !["played", "wins", "draws", "losses", "points", "goalsFor", "goalsAgainst"].every((key) => Number.isInteger(row[key])))) return false;
    if (new Set(tournament.table.map((row) => row.teamId)).size !== 36) return false;
    if (tournament.teams.some((team) => !Number.isInteger(team.rating) || team.rating < 0 || team.rating > 100 ||
        !Array.isArray(team.lineup) || team.lineup.length !== slots.length ||
        new Set(team.lineup.map((pick) => pick.playerId)).size !== slots.length ||
        new Set(team.lineup.map((pick) => pick.slotId)).size !== slots.length ||
        team.lineup.some((pick) => !playerIds.has(pick.playerId) ||
          !slots.some((slot) => slot.id === pick.slotId)))) return false;
    if (!Array.isArray(tournament.rounds) || tournament.rounds.length !== 5 ||
        tournament.rounds.some((round, index) => !Array.isArray(round) || round.length !== [8, 8, 4, 2, 1][index])) return false;
    if (!Number.isInteger(tournament.leagueRound) || tournament.leagueRound < 0 || tournament.leagueRound > 8 ||
        !Number.isInteger(tournament.currentRound) || tournament.currentRound < 0 || tournament.currentRound > 4) return false;
    return validPlayerStats(tournament.playerStats) && tournament.schedule.every((round) => round.every((item) =>
      item && teamIds.has(item.home) && teamIds.has(item.away) &&
      ["pending", "complete", "user-ready"].includes(item.status) &&
      (item.score === null || Array.isArray(item.score) && item.score.length === 2 && item.score.every(Number.isInteger))
    )) && tournament.rounds.every((round) => round.every((item) =>
      item && ["ready", "complete", "bye", "pending", "user-ready"].includes(item.status) &&
      (item.home === null || teamIds.has(item.home)) && (item.away === null || teamIds.has(item.away)) &&
      (item.winner === null || teamIds.has(item.winner)) &&
      (item.score === null || Array.isArray(item.score) && item.score.length === 2 && item.score.every(Number.isInteger))
    ));
  }
  if (!tournament || !Array.isArray(tournament.teams) || tournament.teams.length !== clubs.length + 1) return false;
  if (!Array.isArray(tournament.rounds) || tournament.rounds.length !== 5 || !Number.isInteger(tournament.currentRound) || tournament.currentRound < 0 || tournament.currentRound > 4) return false;
  if (!["active", "champion", "eliminated"].includes(tournament.status)) return false;
  if (tournament.rounds.some((round, index) => !Array.isArray(round) || round.length !== 16 / (2 ** index))) return false;
  const teamIds = new Set(tournament.teams.map((team) => team.id));
  if (teamIds.size !== tournament.teams.length || !teamIds.has("your-xi")) return false;
  return validPlayerStats(tournament.playerStats) && tournament.rounds.every((round) => round.every((fixture) =>
    fixture && ["ready", "complete", "bye", "pending", "user-ready"].includes(fixture.status) &&
    (fixture.home === null || teamIds.has(fixture.home)) &&
    (fixture.away === null || teamIds.has(fixture.away)) &&
    (fixture.winner === null || teamIds.has(fixture.winner)) &&
    (fixture.score === null || Array.isArray(fixture.score) && fixture.score.length === 2 && fixture.score.every(Number.isInteger))
  ));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialState();
    const parsed = JSON.parse(saved);
    if (isValidState(parsed)) {
      parsed.playedSquads ||= [];
      parsed.bench ||= [];
      if (parsed.tournament) parsed.tournament.playerStats ||= [];
      else if (parsed.phase === "complete" && parsed.match === null && parsed.round === formations[parsed.formation].length && parsed.bench.length < benchSlots.length) {
        parsed.phase = "bench";
      }
      if (parsed.match) {
        parsed.match.lineup ||= parsed.squad.map((pick) => ({ ...pick }));
        parsed.match.substitutions ??= 0;
        parsed.match.usedSubstitutes ||= [];
        parsed.match.substitutedOut ||= [];
      }
      return { ...parsed, competition: parsed.competition || "superlig" };
    }
    storageWarning = "The saved game was invalid for the current season, so a fresh game has been loaded.";
    return initialState();
  } catch (error) {
    storageWarning = "Saved game data could not be read. A fresh draft is ready.";
    console.error("Unable to load saved draft:", error);
    return initialState();
  }
}

function saveState() {
  try {
    state.draftId ||= createId();
    if (state.tournament) {
      state.tournament.id ||= createId();
      state.tournament.draftId ||= state.draftId;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageWarning = "";
    window.XIDraftCloud?.queueSave(state);
  } catch (error) {
    storageWarning = "This game could not be saved in your browser. Your current draft is still playable.";
    console.error("Unable to save draft:", error);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function getPickedPlayer(slotId) {
  const pick = state.squad.find((item) => item.slotId === slotId);
  return pick ? players.find((item) => item.id === pick.playerId) : null;
}

function getCurrentSlot() {
  if (state.phase === "bench") return benchSlots[state.bench.length] || null;
  const selected = new Set(state.squad.map((item) => item.slotId));
  return formations[state.formation].find((slot) => !selected.has(slot.id));
}

function playerFitsSlot(player, slot) {
  return slot.roles ? player.roles.some((role) => slot.roles.includes(role)) : player.roles.includes(slot.role);
}

function positionGroupForRole(role) {
  if (role === "GK") return "GK";
  if (["CB", "LB", "RB", "LWB", "RWB"].includes(role)) return "DEF";
  if (["CDM", "CM", "CAM", "LM", "RM"].includes(role)) return "MID";
  if (["LW", "RW", "ST", "CF"].includes(role)) return "FWD";
  return null;
}

function renderBenchRoster() {
  const picks = state.bench || [];
  return `<section class="bench-roster">
    <div class="bench-roster-head"><strong>BENCH</strong><span>${picks.length} / ${benchSlots.length}</span></div>
    <div class="bench-player-list">${benchSlots.map((slot, index) => {
      const pick = picks[index];
      const player = pick && players.find((item) => item.id === pick.playerId);
      return `<div class="bench-player ${player ? "selected" : ""}"><span class="bench-role">${escapeHtml(slot.label)}</span>${player
        ? `<span class="bench-name">${escapeHtml(player.name)}</span><span class="bench-club">${escapeHtml(player.club)}</span><strong>${player.rating}</strong>`
        : `<span class="bench-empty">Waiting for draft</span>`}</div>`;
    }).join("")}</div>
  </section>`;
}

function getOptions(slot) {
  const picked = new Set([...state.squad, ...(state.bench || [])].map((item) => item.playerId));
  const eligible = players.filter((player) => playerFitsSlot(player, slot) && !picked.has(player.id));
  const options = [];
  while (eligible.length && options.length < 5) {
    const weights = eligible.map((player) => player.rating >= 76 ? 4 : 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let draw = Math.random() * totalWeight;
    const selectedIndex = weights.findIndex((weight) => {
      draw -= weight;
      return draw < 0;
    });
    options.push(eligible.splice(selectedIndex < 0 ? eligible.length - 1 : selectedIndex, 1)[0]);
  }
  return options;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function clubInitials(club) {
  return club.split(/\s+/).map((word) => word[0]).join("").slice(0, 3).toUpperCase();
}

function playerInitials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function playerPortrait(player, extraClass = "") {
  return `<span class="player-portrait ${extraClass}" aria-hidden="true">
    <span class="portrait-fallback">${escapeHtml(playerInitials(player.name))}</span>
    ${player.photo ? `<img src="${escapeHtml(player.photo)}" alt="" loading="lazy" decoding="async" />` : ""}
  </span>`;
}

function clubMiniBadge(player) {
  return player.clubLogo
    ? `<img class="club-mini-badge" src="${escapeHtml(player.clubLogo)}" alt="" loading="lazy" decoding="async" />`
    : "";
}

function playerSeasonSummary(player) {
  const stats = globalTeamStats[player.teamId];
  if (!stats) return "";
  const current = stats["2026-27"];
  const previous = stats["2025-26"];
  const asOf = stats.meta?.["2026-27"]?.asOf;
  const currentLabel = current
    ? `26/27 in progress #${current.position} · ${current.points} pts`
    : "26/27 results unavailable";
  const previousLabel = previous
    ? `${stats.meta?.["2025-26"]?.complete ? "25/26 final" : "25/26 partial"} #${previous.position} · ${previous.points} pts`
    : "25/26 table unavailable";
  return `<span class="choice-team-stats" title="Calculated from ESPN completed league score results${asOf ? ` as of ${escapeHtml(asOf)}` : ""}. Positions rank points, goal difference, then goals scored.">${currentLabel} <span aria-hidden="true">·</span> ${previousLabel}</span>`;
}

function competitionLogo(competition, className = "") {
  const fallback = competition.short === "SÜPER LİG" ? "TR" : competition.short.split(" ").map((word) => word[0]).join("");
  return `<span class="competition-logo ${className}"><span class="competition-logo-fallback">${escapeHtml(fallback)}</span><img src="${escapeHtml(competition.logo)}" alt="" loading="lazy" decoding="async" /></span>`;
}

function bindCompetitionLogos() {
  document.querySelectorAll(".competition-logo img").forEach((image) => {
    const fallback = image.previousElementSibling;
    image.addEventListener("load", () => { fallback.style.display = "none"; }, { once: true });
    image.addEventListener("error", () => { image.style.display = "none"; }, { once: true });
    if (image.complete) {
      if (image.naturalWidth) fallback.style.display = "none";
      else image.style.display = "none";
    }
  });
}

function bindPlayerPortraits() {
  document.querySelectorAll(".player-portrait img").forEach((image) => {
    const showFallback = () => {
      image.style.display = "none";
      image.previousElementSibling.style.display = "";
    };
    const showImage = () => {
      image.style.display = "";
      image.previousElementSibling.style.display = "none";
    };
    image.addEventListener("error", showFallback, { once: true });
    image.addEventListener("load", showImage, { once: true });
    if (image.complete) {
      if (image.naturalWidth) showImage();
      else showFallback();
    }
  });
}

function warningMarkup() {
  return storageWarning ? `<div class="error-banner" role="alert">${escapeHtml(storageWarning)}</div>` : "";
}

function miniPitch(rows) {
  return `<span class="mini-pitch" aria-hidden="true">${rows.map((count) => `<span class="mini-row">${Array.from({ length: count }, () => '<i class="mini-dot"></i>').join("")}</span>`).join("")}</span>`;
}

function renderLanding() {
  const hasGame = state.phase !== "setup";
  const featuredPlayer = [...players].sort((a, b) => b.rating - a.rating)[0];
  app.innerHTML = `
    ${warningMarkup()}
    <section class="landing">
      <div class="landing-copy">
        <div class="eyebrow"><span class="live-dot"></span>THE 2026/27 GLOBAL DRAFT ROOM</div>
        <h1 class="display">YOUR XI.<br /><span>YOUR RULES.</span></h1>
        <p>Fifteen picks. Five options every round. Draft an XI plus four substitutes from the Süper Lig, Europe's top five leagues and European competition clubs, then take your squad into a tournament.</p>
        <div class="hero-actions">
          <button class="primary-button" id="start-draft">${hasGame ? "Continue your draft" : "Enter the draft room"} <span aria-hidden="true">↗</span></button>
          ${hasGame ? '<button class="text-button" id="landing-reset">Start a new draft</button>' : ""}
        </div>
        <div class="hero-note">
          <div><strong>15</strong>PLAYERS TO PICK</div>
          <div><strong>5</strong>OPTIONS EACH ROUND</div>
          <div><strong>100%</strong>YOUR CALL</div>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-orbit"></div><div class="hero-ball"></div>
        <div class="floating-tag tag-one">2026/27 · EUROPE + TÜRKİYE</div>
        <div class="hero-card">
          <div class="hero-card-top"><span>XI DRAFT</span><span>${escapeHtml(featuredPlayer.roles[0])}</span></div>
          <div class="hero-card-rating">${featuredPlayer.rating}</div><div class="hero-card-position">${featuredPlayer.ratingSource?.startsWith("EA") ? "EA FC 27 RATING" : "GAMEPLAY ESTIMATE"}</div>
          ${playerPortrait(featuredPlayer, "hero-player-portrait")}
          <div class="hero-card-name">${escapeHtml(featuredPlayer.name)}</div>
          <div class="hero-card-club">${escapeHtml(featuredPlayer.club.toUpperCase())} · ${escapeHtml(featuredPlayer.league || "SÜPER LİG")}</div>
        </div>
        <div class="floating-tag tag-two">PICK YOUR MOMENT. MAKE YOUR TEAM.</div>
      </div>
    </section>`;
  bindPlayerPortraits();
  document.querySelector("#start-draft").addEventListener("click", () => {
    if (hasGame) render();
    else renderSetup();
  });
  document.querySelector("#landing-reset")?.addEventListener("click", resetDraft);
}

function renderSetup() {
  const competitionChoices = Object.entries(competitionCatalog).map(([id, competition]) => {
    const count = id === "superlig" ? competition.teams.length : competition.teams.length;
    const detail = id === "superlig"
      ? `${count} current-season clubs · domestic cup`
      : `36 official 2026/27 entrants · 8-match league phase`;
    return `<button type="button" class="competition-option ${state.competition === id ? "selected" : ""}" data-competition="${id}">
      ${competitionLogo(competition)}
      <span><strong>${escapeHtml(competition.title)}</strong><small>${detail}</small></span>
      <span class="competition-check" aria-hidden="true">${state.competition === id ? "✓" : ""}</span>
    </button>`;
  }).join("");
  app.innerHTML = `
    ${warningMarkup()}
    <div class="setup-top">
      <div><div class="eyebrow">BEFORE THE WHISTLE</div><h1 class="display">SET YOUR SHAPE.</h1></div>
      <button class="text-button" id="back-home">← BACK HOME</button>
    </div>
    <section class="setup-layout">
      <div class="panel setup-main">
        <div class="section-label">CHOOSE YOUR FORMATION <small>All 11 roles must be filled</small></div>
        <div class="formation-options">
          <button class="formation-option ${state.formation === "4-3-3" ? "selected" : ""}" data-formation="4-3-3">
            ${miniPitch([3, 3, 4, 1])}<span><strong>4-3-3</strong><span>Width &amp; attacking balance</span></span>
          </button>
          <button class="formation-option ${state.formation === "4-2-3-1" ? "selected" : ""}" data-formation="4-2-3-1">
            ${miniPitch([1, 3, 2, 4, 1])}<span><strong>4-2-3-1</strong><span>Control the middle</span></span>
          </button>
        </div>
        <div class="section-label competition-label">CHOOSE YOUR COMPETITION <small>Play the Turkish cup or a European route</small></div>
        <div class="competition-options">${competitionChoices}</div>
        <div class="rule-list">
          <div class="rule"><span class="rule-mark">01</span><span>Five player options appear each round, with the draw weighted toward players rated 76+. Lower-rated picks can still appear.</span></div>
          <div class="rule"><span class="rule-mark">02</span><span>Draft an 11-player starting XI plus four reserves: a goalkeeper, defender, midfielder and forward.</span></div>
          <div class="rule"><span class="rule-mark">03</span><span>Your squad and draft progress save automatically to this browser. You can resume at any time.</span></div>
        </div>
      </div>
      <aside class="panel setup-side">
        <div><div class="eyebrow">READY WHEN YOU ARE</div><h2>Pick your path<br />to the perfect XI.</h2>        <p>Draft across six domestic leagues and UEFA entrant squads, then play an interactive tournament. Player cards include ESPN-score-derived 2025/26 and current 2026/27 league snapshots where club names match. Your XI takes one entrant's place to keep the 36-team league phase balanced.</p></div>
        <div>
          <div class="pool-count"><strong>${players.length.toLocaleString()}</strong><span>PLAYERS · GLOBAL CLUB POOL</span></div>
          <p class="rating-disclosure">${escapeHtml(RATING_NOTE)} Club positions are calculated from completed ESPN score results as of the snapshot date; they may differ from official tables, and some previous-season feeds are incomplete.</p>
          <button class="primary-button full-button" id="begin-draft">Start drafting <span aria-hidden="true">→</span></button>
        </div>
      </aside>
    </section>`;
  document.querySelector("#back-home").addEventListener("click", renderLanding);
  bindCompetitionLogos();
  document.querySelectorAll("[data-formation]").forEach((button) => {
    button.addEventListener("click", () => {
      state.formation = button.dataset.formation;
      renderSetup();
    });
  });
  document.querySelectorAll("[data-competition]").forEach((button) => {
    button.addEventListener("click", () => {
      state.competition = button.dataset.competition;
      renderSetup();
    });
  });
  document.querySelector("#begin-draft").addEventListener("click", () => {
    state = { ...initialState(), phase: "draft", formation: state.formation, competition: state.competition };
    saveState();
    render();
  });
}

function renderPitch() {
  const groups = Array.from({ length: Math.max(...formations[state.formation].map((slot) => slot.row)) + 1 }, (_, row) => formations[state.formation].filter((slot) => slot.row === row));
  return `<div class="pitch"><div class="pitch-circle"></div><div class="pitch-rows">${groups.map((group) => `
    <div class="pitch-row">${group.map((slot) => {
      const player = getPickedPlayer(slot.id);
      const current = state.phase === "draft" && getCurrentSlot()?.id === slot.id;
      return `<div class="pitch-slot ${player ? "filled" : ""} ${current ? "current" : ""}" aria-label="${player ? `${slot.role}: ${escapeHtml(player.name)}, ${escapeHtml(player.club)}` : `${slot.role}, ${current ? "current pick" : "empty"}`}">
        <span class="slot-shirt ${player?.photo ? "has-portrait" : ""}">${player ? player.photo ? `${playerPortrait(player)}<span class="slot-rating">${player.rating}</span>` : player.rating : `<span class="slot-empty">${slot.role}</span>`}</span>
        ${player ? `<span class="slot-name">${escapeHtml(player.name)}</span><span class="slot-club">${escapeHtml(clubInitials(player.club))}</span>` : ""}
      </div>`;
    }).join("")}</div>`).join("")}</div></div>`;
}

function choiceCard(player, role) {
  const labels = player.roles.includes("GK") ? ["DIV", "HAN", "KIC", "REF", "SPD", "POS"] : ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"];
  return `<button class="player-choice" data-player="${escapeHtml(player.id)}" type="button" aria-label="Draft ${escapeHtml(player.name)}, rating ${player.rating}, ${escapeHtml(player.club)}">
    <span class="choice-visual">${playerPortrait(player, "choice-portrait")}<span class="choice-rating"><strong>${player.rating}</strong><span>${role}</span></span></span>
    <span class="choice-detail">
      <span class="choice-position">${escapeHtml(player.position || player.roles.join(" · "))}</span>
      <span class="choice-name">${escapeHtml(player.name)}</span>
      <span class="choice-club">${clubMiniBadge(player)}${escapeHtml(player.club)} <span aria-hidden="true">·</span> ${escapeHtml(player.league || "Trendyol Süper Lig")}</span>
      ${playerSeasonSummary(player)}
      <span class="rating-source ${player.ratingSource?.startsWith("EA") ? "official" : ""}">${player.ratingSource?.startsWith("EA") ? "EA FC 27" : "ESTIMATED RATING"}</span>
      <span class="choice-stats">${player.stats.map((value, index) => `<span><b>${labels[index]}</b>${value}</span>`).join("")}</span>
    </span>
  </button>`;
}

function renderDraft() {
  const slot = getCurrentSlot();
  const options = slot ? getOptions(slot) : [];
  const isBenchRound = state.phase === "bench";
  const totalPicks = state.squad.length + (state.bench || []).length;
  const average = state.squad.length ? Math.round(state.squad.reduce((sum, pick) => sum + players.find((player) => player.id === pick.playerId).rating, 0) / state.squad.length) : "—";
  const clubs = new Set(state.squad.map((pick) => players.find((player) => player.id === pick.playerId).club)).size;
  app.innerHTML = `
    ${warningMarkup()}
    <section class="draft-wrap">
      <div class="draft-heading">
        <div><div class="eyebrow">YOUR SQUAD IS TAKING SHAPE</div><h1 class="display">BUILD YOUR SQUAD.</h1></div>
        <div class="round-counter"><strong>${String(totalPicks).padStart(2, "0")}<span style="color:var(--faint)"> / 15</span></strong><span>${isBenchRound ? `BENCH PICK ${state.bench.length + 1} OF 4` : `STARTING XI · ROUND ${Math.min(state.round + 1, 11)} OF 11`}</span></div>
      </div>
      <div class="draft-status"><span>FORMATION <strong>${state.formation}</strong></span><span>${escapeHtml(RATING_NOTE)}</span></div>
      <div class="draft-grid">
        <section class="panel squad-panel">
          <div class="panel-head"><h2>THE STARTING XI</h2><span>${state.squad.length} / 11 DRAFTED</span></div>
          <div class="squad-summary">
            <div class="summary-metric"><span>AVG RATING</span><strong class="lime">${average}</strong></div>
            <div class="summary-metric"><span>CLUBS</span><strong>${clubs}</strong></div>
            <div class="summary-metric"><span>FORMATION</span><strong>${state.formation}</strong></div>
          </div>
          ${renderPitch()}
          ${renderBenchRoster()}
        </section>
        <section class="panel choice-panel">
          <div class="choice-intro">
            <div class="eyebrow">${isBenchRound ? `BENCH · PICK ${state.bench.length + 1} OF 4` : `ROUND ${String(state.round + 1).padStart(2, "0")} · PLAYER PICK`}</div>
            <h2>${slot ? `Pick ${isBenchRound ? "a" : "your"} ${escapeHtml(slot.label || slot.role)}.` : "Squad complete."}</h2>
            <p>${slot ? isBenchRound ? `Add a ${escapeHtml(slot.label.toLowerCase())} to your matchday bench.` : `Choose one player to fill the ${escapeHtml(slot.role)} spot.` : "Your 15-player squad is ready."}</p>
          </div>
          ${options.length ? `<div class="player-options">${options.map((player) => choiceCard(player, slot.label || slot.role)).join("")}</div>` : `<div class="empty-picks">No available player fits this spot in the pool.</div>`}
          <div class="draft-actions">
            <button class="text-button" id="quit-draft">← LEAVE DRAFT</button>
            <button class="primary-button small-button" id="restart-draft">Restart ↻</button>
          </div>
        </section>
      </div>
    </section>`;
  bindPlayerPortraits();
  document.querySelectorAll("[data-player]").forEach((button) => button.addEventListener("click", () => pickPlayer(button.dataset.player, slot)));
  document.querySelector("#quit-draft").addEventListener("click", renderLanding);
  document.querySelector("#restart-draft").addEventListener("click", resetDraft);
}

function pickPlayer(playerId, slot) {
  const player = players.find((item) => item.id === playerId);
  const alreadyPicked = [...state.squad, ...(state.bench || [])];
  if (!slot || !player || !playerFitsSlot(player, slot) || alreadyPicked.some((pick) => pick.playerId === playerId) || alreadyPicked.some((pick) => pick.slotId === slot.id)) {
    showToast("That pick is no longer available.");
    return;
  }
  if (state.phase === "bench") {
    state.bench.push({ slotId: slot.id, playerId });
    state.phase = state.bench.length === benchSlots.length ? "complete" : "bench";
  } else {
    state.squad.push({ slotId: slot.id, playerId });
    state.round += 1;
    state.phase = state.round === formations[state.formation].length ? "bench" : "draft";
  }
  if (state.phase === "complete") {
    state.draftId ||= createId();
  }
  saveState();
  render();
  playPickSound();
}

function renderComplete() {
  const orderedPicks = formations[state.formation].map((slot) => ({ slot, player: getPickedPlayer(slot.id) })).filter((item) => item.player);
  const average = Math.round(orderedPicks.reduce((sum, item) => sum + item.player.rating, 0) / orderedPicks.length);
  const alreadyPlayed = state.playedSquads.includes(squadSignature(state.squad));
  const campaignFinished = state.tournament && state.tournament.status !== "active";
  const campaignMessage = campaignFinished
    ? "This campaign is complete. Review your results, then draft a fresh XI to compete again."
    : state.tournament
      ? "Your campaign is saved. Return to its fixtures to continue."
      : alreadyPlayed
        ? "This exact XI has already entered a competition. Draft a fresh team before entering another."
        : "";
  app.innerHTML = `
    ${warningMarkup()}
    <div class="setup-top">
      <div><div class="eyebrow">FULL TIME · YOUR 15-PLAYER SQUAD IS LOCKED IN</div><h1 class="display">THAT'S YOUR TEAM.</h1></div>
      <button class="text-button" id="back-home">← BACK HOME</button>
    </div>
    <section class="complete-layout">
      <div class="panel">
        <div class="panel-head"><h2>THE STARTING XI</h2><span>${state.formation} FORMATION</span></div>
        <div class="roster-list">${orderedPicks.map(({ slot, player }) => `
          <div class="roster-row">${playerPortrait(player, "roster-portrait")}<span class="roster-pos">${slot.role}</span><span class="roster-name">${escapeHtml(player.name)}<small>${clubMiniBadge(player)}${escapeHtml(player.club)}</small></span><span class="roster-rating">${player.rating}</span></div>`).join("")}
        </div>
        ${renderBenchRoster()}
      </div>
      <aside class="panel complete-side">
        <div class="eyebrow">DRAFT COMPLETE</div>
        <h2>Dream team.<br />Now make it count.</h2>
        <p>${state.tournament ? "Your competition campaign is saved. You can review the fixtures and player stats, or draft a new XI." : `Your XI is ready. Enter the ${escapeHtml(competitionCatalog[state.competition]?.title || "Süper Lig Cup")} and play interactive matches. Pick tactics every 15 minutes and see how far your draft can go.`}</p>
        <div class="final-rating"><div><strong>${average}</strong><br /><span>SQUAD RATING</span></div><span>${new Set(orderedPicks.map(({ player }) => player.club)).size}<br />CLUBS</span></div>
        <div class="season-record"><span>SEASON RECORD</span><strong>${state.record.wins}W · ${state.record.draws}D · ${state.record.losses}L</strong></div>
        ${campaignMessage ? `<p class="campaign-lock-note">${escapeHtml(campaignMessage)}</p>` : ""}
        <div class="complete-buttons">
          ${state.tournament
            ? `<button class="primary-button full-button" id="enter-tournament">Review ${campaignFinished ? "completed campaign" : "saved campaign"} <span aria-hidden="true">→</span></button>`
            : `<button class="primary-button full-button" id="enter-tournament" ${alreadyPlayed ? "disabled" : ""}>${alreadyPlayed ? "Draft a fresh XI to compete" : `Enter ${escapeHtml(competitionCatalog[state.competition]?.title || "the cup")}`} <span aria-hidden="true">→</span></button>`}
          ${!state.tournament ? `<button class="text-button" id="play-friendly">${state.match && state.match.number === state.record.played + 1 && state.match.minute < 90 ? "Resume friendly" : "Play a friendly"}</button>` : ""}
          <button class="text-button" id="new-draft">${campaignFinished || alreadyPlayed ? "Draft a fresh XI ↻" : "Draft another XI ↻"}</button>
          <button class="text-button" id="copy-team">COPY FULL SQUAD</button>
        </div>
      </aside>
    </section>
    <p class="footer-note">${escapeHtml(RATING_NOTE)}</p>`;
  bindPlayerPortraits();
  document.querySelector("#back-home").addEventListener("click", renderLanding);
  document.querySelector("#new-draft").addEventListener("click", resetDraft);
  document.querySelector("#copy-team").addEventListener("click", copyTeam);
  document.querySelector("#enter-tournament").addEventListener("click", () => {
    if (state.tournament) {
      state.phase = "tournament";
      saveState();
      render();
    } else startTournament();
  });
  document.querySelector("#play-friendly")?.addEventListener("click", startMatch);
}

function getTeamPlayers(picks = state.squad, slots = formations[state.formation]) {
  return picks.map((pick) => players.find((player) => player.id === pick.playerId));
}

function clubLineup(club) {
  const used = new Set();
  const lineup = [];
  for (const slot of formations[state.formation]) {
    const preferredRoles = [slot.role, ...(roleFallbacks[slot.role] || [])];
    const options = players.filter((player) => normalizeClubName(player.club) === normalizeClubName(club) && player.roles.some((role) => preferredRoles.includes(role)) && !used.has(player.id));
    if (!options.length) return null;
    const sorted = options.sort((a, b) => b.rating - a.rating);
    const player = sorted[Math.floor(Math.random() * Math.min(sorted.length, 3))];
    used.add(player.id);
    lineup.push({ slotId: slot.id, playerId: player.id });
  }
  return lineup;
}

function createOpponent() {
  const userAverage = getTeamPlayers().reduce((total, player) => total + player.rating, 0) / state.squad.length;
  const teams = [...new Set(players.map((player) => player.club))];
  const candidates = teams.map((club) => {
    const lineup = clubLineup(club);
    if (!lineup) return null;
    const average = getTeamPlayers(lineup).reduce((total, player) => total + player.rating, 0) / lineup.length;
    return { club, lineup, difference: Math.abs(average - userAverage) };
  }).filter(Boolean).sort((a, b) => a.difference - b.difference);
  if (!candidates.length) throw new Error("No current-season club can field this formation.");
  const shortlist = candidates.slice(0, Math.min(5, candidates.length));
  return shortlist[Math.floor(Math.random() * shortlist.length)];
}

const tournamentRoundNames = ["ROUND OF 32", "ROUND OF 16", "QUARTER-FINAL", "SEMI-FINAL", "FINAL"];

function getTournamentTeam(teamId, tournament = state.tournament) {
  return tournament?.teams.find((team) => team.id === teamId) || null;
}

function fixture(home, away, status = "pending") {
  return { home, away, status, score: null, winner: null, penalties: null };
}

function ratingForPicks(picks) {
  return Math.round(getTeamPlayers(picks).reduce((sum, player) => sum + player.rating, 0) / picks.length);
}

function addTournamentPlayerStat(tournament, playerId, key) {
  if (!playerId) return;
  tournament.playerStats ||= [];
  let row = tournament.playerStats.find((item) => item.playerId === playerId);
  if (!row) {
    row = { playerId, goals: 0, assists: 0 };
    tournament.playerStats.push(row);
  }
  row[key] += 1;
}

function chooseGoalParticipants(picks) {
  const lineup = picks.map((pick) => ({
    player: players.find((candidate) => candidate.id === pick.playerId),
    role: formations[state.formation].find((slot) => slot.id === pick.slotId)?.role,
  })).filter((entry) => entry.player);
  const weightedPick = (entries, valueFor) => {
    const weights = entries.map((entry) => Math.max(1, valueFor(entry)));
    let draw = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    const index = weights.findIndex((weight) => {
      draw -= weight;
      return draw < 0;
    });
    return entries[index < 0 ? entries.length - 1 : index];
  };
  const scorerEntry = weightedPick(lineup, ({ player, role }) =>
    player.stats[1] + player.rating * 0.2 + (["ST", "CF", "LW", "RW", "CAM"].includes(role) ? 18 : 0)
  );
  const scorer = scorerEntry.player;
  const assistOptions = lineup.filter((entry) => entry.player.id !== scorer.id);
  const assister = Math.random() < 0.72
    ? weightedPick(assistOptions, ({ player, role }) =>
      player.stats[2] + player.rating * 0.15 + (["CM", "CAM", "LM", "RM", "LW", "RW"].includes(role) ? 18 : 0)
    ).player
    : null;
  return { scorer, assister };
}

function recordGeneratedPlayerStats(tournament, homeId, awayId, score) {
  for (const [teamId, goals] of [[homeId, score[0]], [awayId, score[1]]]) {
    if (teamId === "your-xi") continue;
    const team = getTournamentTeam(teamId, tournament);
    for (let index = 0; index < goals; index += 1) {
      const { scorer, assister } = chooseGoalParticipants(team.lineup);
      addTournamentPlayerStat(tournament, scorer.id, "goals");
      if (assister) addTournamentPlayerStat(tournament, assister.id, "assists");
    }
  }
}

function recordPlayedGoal(scorer, assister) {
  if (!state.match?.tournament || !state.tournament) return;
  addTournamentPlayerStat(state.tournament, scorer.id, "goals");
  if (assister) addTournamentPlayerStat(state.tournament, assister.id, "assists");
}

function tournamentScore(home, away, tournament) {
  const homeRating = getTournamentTeam(home, tournament).rating;
  const awayRating = getTournamentTeam(away, tournament).rating;
  const difference = homeRating - awayRating;
  const goals = (expected) => {
    const threshold = Math.min(2.5, Math.max(0.35, expected));
    let n = 0;
    let product = 1;
    const limit = Math.exp(-threshold);
    do { n += 1; product *= Math.random(); } while (product > limit && n < 7);
    return n - 1;
  };
  let score = [goals(1.25 + Math.max(-0.5, Math.min(0.5, difference * 0.055))), goals(1.15 - Math.max(-0.5, Math.min(0.5, difference * 0.055)))];
  let penalties = null;
  let winner = score[0] > score[1] ? home : away;
  if (score[0] === score[1]) {
    const homeChance = 0.5 + Math.max(-0.08, Math.min(0.08, difference * 0.012));
    penalties = [Math.random() < homeChance ? 5 : 4, Math.random() < homeChance ? 4 : 5];
    if (penalties[0] === penalties[1]) penalties[0] += 1;
    winner = penalties[0] > penalties[1] ? home : away;
  }
  return { score, penalties, winner };
}

function europeanScore(home, away, tournament) {
  const difference = getTournamentTeam(home, tournament).rating - getTournamentTeam(away, tournament).rating;
  const goals = (expected) => {
    let count = 0;
    let product = 1;
    const limit = Math.exp(-Math.max(0.25, Math.min(3, expected)));
    do { count += 1; product *= Math.random(); } while (product > limit && count < 7);
    return count - 1;
  };
  const edge = Math.max(-0.55, Math.min(0.55, difference * 0.045));
  return [goals(1.35 + edge), goals(1.2 - edge)];
}

function createEuropeanSchedule(teamIds) {
  const rotation = [...teamIds];
  const rounds = [];
  for (let roundIndex = 0; roundIndex < 8; roundIndex += 1) {
    const fixtures = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      fixtures.push({
        home: (roundIndex + index) % 2 ? second : first,
        away: (roundIndex + index) % 2 ? first : second,
        status: "pending",
        score: null,
        winner: null,
      });
    }
    rounds.push(fixtures);
    rotation.splice(1, 0, rotation.pop());
  }
  return rounds;
}

function europeanStandings(tournament) {
  return [...tournament.table].sort((a, b) =>
    b.points - a.points ||
    (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor ||
    getTournamentTeam(b.teamId, tournament).rating - getTournamentTeam(a.teamId, tournament).rating ||
    getTournamentTeam(a.teamId, tournament).name.localeCompare(getTournamentTeam(b.teamId, tournament).name)
  );
}

function recordEuropeanResult(tournament, current, score) {
  current.score = score;
  current.winner = score[0] > score[1] ? current.home : score[1] > score[0] ? current.away : null;
  current.status = "complete";
  recordGeneratedPlayerStats(tournament, current.home, current.away, score);
  const home = tournament.table.find((row) => row.teamId === current.home);
  const away = tournament.table.find((row) => row.teamId === current.away);
  home.played += 1;
  away.played += 1;
  home.goalsFor += score[0];
  home.goalsAgainst += score[1];
  away.goalsFor += score[1];
  away.goalsAgainst += score[0];
  if (score[0] > score[1]) {
    home.wins += 1;
    away.losses += 1;
    home.points += 3;
  } else if (score[0] < score[1]) {
    away.wins += 1;
    home.losses += 1;
    away.points += 3;
  } else {
    home.draws += 1;
    away.draws += 1;
    home.points += 1;
    away.points += 1;
  }
}

function prepareEuropeanLeagueRound(tournament, roundIndex) {
  const round = tournament.schedule[roundIndex];
  const userIndex = round.findIndex((current) => current.home === "your-xi" || current.away === "your-xi");
  if (userIndex < 0) throw new Error("Your XI is missing from this European matchday.");
  round.forEach((current, index) => {
    if (index === userIndex) return;
    recordEuropeanResult(tournament, current, europeanScore(current.home, current.away, tournament));
  });
  round[userIndex].status = "user-ready";
  tournament.leagueRound = roundIndex;
  tournament.currentLeagueFixture = userIndex;
}

function simulateEuropeanKnockoutRound(tournament, roundIndex) {
  tournament.rounds[roundIndex].forEach((current) => {
    if (current.status !== "pending" || !current.home || !current.away) return;
    const result = tournamentScore(current.home, current.away, tournament);
    current.score = result.score;
    current.penalties = result.penalties;
    current.winner = result.winner;
    current.status = "complete";
    recordGeneratedPlayerStats(tournament, current.home, current.away, current.score);
  });
}

function createEuropeanRoundOf16(tournament) {
  const standings = europeanStandings(tournament);
  const playoffWinners = tournament.rounds[0].map((current) => current.winner);
  if (playoffWinners.some((teamId) => !teamId)) throw new Error("The European play-off round is incomplete.");
  tournament.rounds[1] = standings.slice(0, 8).map((standing, index) =>
    fixture(standing.teamId, playoffWinners[7 - index], "pending")
  );
}

function prepareEuropeanKnockouts(tournament) {
  const standings = europeanStandings(tournament);
  const userRank = standings.findIndex((row) => row.teamId === "your-xi") + 1;
  tournament.userLeagueRank = userRank;
  tournament.rounds = [
    Array.from({ length: 8 }, () => fixture(null, null)),
    Array.from({ length: 8 }, () => fixture(null, null)),
    Array.from({ length: 4 }, () => fixture(null, null)),
    Array.from({ length: 2 }, () => fixture(null, null)),
    [fixture(null, null)],
  ];
  const playoffTeams = standings.slice(8, 24);
  tournament.rounds[0] = Array.from({ length: 8 }, (_, index) =>
    fixture(playoffTeams[index].teamId, playoffTeams[15 - index].teamId, "pending")
  );
  tournament.phaseType = "knockout";
  tournament.status = "active";
  if (userRank > 24) {
    tournament.phaseType = "eliminated";
    tournament.status = "eliminated";
    tournament.leagueRound = 8;
    return;
  }
  if (userRank <= 8) {
    simulateEuropeanKnockoutRound(tournament, 0);
    createEuropeanRoundOf16(tournament);
    prepareTournamentRound(tournament, 1);
    return;
  }
  prepareTournamentRound(tournament, 0);
}

function startEuropeanTournament() {
  try {
    const competition = competitionCatalog[state.competition];
    const clubTeams = competition.teams.map((team) => {
      const lineup = clubLineup(team.rosterClub || team.name);
      if (!lineup) throw new Error(`${team.name} does not have enough sourced players to build a ${state.formation} lineup.`);
      return {
        id: team.id,
        name: team.name,
        short: team.short,
        logo: team.logo,
        rosterClub: team.rosterClub || team.name,
        rating: ratingForPicks(lineup),
        lineup,
        user: false,
      };
    });
    const replacedTeam = [...clubTeams].sort((a, b) => a.rating - b.rating || a.name.localeCompare(b.name))[0];
    const userTeam = {
      id: "your-xi",
      name: "YOUR XI",
      short: "XI",
      logo: null,
      user: true,
      rating: ratingForPicks(state.squad),
      lineup: state.squad.map((pick) => ({ ...pick })),
    };
    const teams = [userTeam, ...clubTeams.filter((team) => team.id !== replacedTeam.id)];
    const table = teams.map((team) => ({
      teamId: team.id, played: 0, wins: 0, draws: 0, losses: 0,
      points: 0, goalsFor: 0, goalsAgainst: 0,
    }));
    const tournament = {
      id: createId(),
      draftId: state.draftId || createId(),
      competition: state.competition,
      formatVersion: 1,
      phaseType: "league",
      status: "active",
      playerStats: [],
      leagueRound: 0,
      currentLeagueFixture: 0,
      currentRound: 0,
      currentFixture: 0,
      champion: null,
      replacedTeam: replacedTeam.name,
      teams,
      table,
      schedule: createEuropeanSchedule(teams.map((team) => team.id)),
      rounds: [
        Array.from({ length: 8 }, () => fixture(null, null)),
        Array.from({ length: 8 }, () => fixture(null, null)),
        Array.from({ length: 4 }, () => fixture(null, null)),
        Array.from({ length: 2 }, () => fixture(null, null)),
        [fixture(null, null)],
      ],
    };
    prepareEuropeanLeagueRound(tournament, 0);
    state.tournament = tournament;
    state.playedSquads.push(squadSignature(state.squad));
    state.match = null;
    state.phase = "tournament";
    saveState();
    render();
  } catch (error) {
    console.error("Unable to start European tournament:", error);
    showToast(error.message || "Unable to create the European competition.");
  }
}

function simulateTournamentFixture(tournament, roundIndex, fixtureIndex) {
  const current = tournament.rounds[roundIndex][fixtureIndex];
  if (current.status !== "pending" || !current.home || !current.away) return;
  const result = tournamentScore(current.home, current.away, tournament);
  current.score = result.score;
  current.penalties = result.penalties;
  current.winner = result.winner;
  current.status = "complete";
  recordGeneratedPlayerStats(tournament, current.home, current.away, current.score);
}

function prepareTournamentRound(tournament, roundIndex) {
  const round = tournament.rounds[roundIndex];
  round.forEach((current) => {
    if (current.away === null && current.home !== null) {
      current.status = "bye";
      current.winner = current.home;
    }
  });
  const userFixtureIndex = round.findIndex((current) => current.home === "your-xi" || current.away === "your-xi");
  if (userFixtureIndex < 0) throw new Error("Your XI did not advance into the next tournament round.");
  round.forEach((current, index) => {
    if (index !== userFixtureIndex) simulateTournamentFixture(tournament, roundIndex, index);
  });
  round[userFixtureIndex].status = "user-ready";
  tournament.currentRound = roundIndex;
  tournament.currentFixture = userFixtureIndex;
}

function startTournament() {
  if (state.tournament) {
    showToast(state.tournament.status === "active"
      ? "Your campaign is already underway. Return to its saved fixtures."
      : "This XI has finished its campaign. Draft a fresh squad to compete again.");
    return;
  }
  const signature = squadSignature(state.squad);
  if (state.playedSquads.includes(signature)) {
    showToast("This exact XI has already entered a competition. Draft a fresh squad to compete again.");
    return;
  }
  if (state.competition !== "superlig") {
    startEuropeanTournament();
    return;
  }
  try {
    const userTeam = {
      id: "your-xi", name: "YOUR XI", short: "XI", logo: null, user: true,
      rating: ratingForPicks(state.squad), lineup: state.squad.map((pick) => ({ ...pick })),
    };
    const clubTeams = clubs.map((club) => {
      const lineup = clubLineup(club.name);
      if (!lineup) throw new Error(`${club.name} cannot field a ${state.formation} lineup from the current squad pool.`);
      return { id: club.id, name: club.name, short: club.short, logo: club.logo, user: false, rating: ratingForPicks(lineup), lineup };
    });
    const allClubTeams = shuffle(clubTeams);
    const lowerSeeded = allClubTeams.sort((a, b) => a.rating - b.rating).slice(0, 5);
    const byeTeams = allClubTeams.filter((team) => !lowerSeeded.includes(team)).sort((a, b) => b.rating - a.rating);
    const qualifiers = shuffle([...lowerSeeded, userTeam]);
    const openingRound = [];
    for (let i = 0; i < 3; i += 1) openingRound.push(fixture(qualifiers[i].id, qualifiers[i + 3].id, "pending"));
    for (const team of byeTeams) openingRound.push(fixture(team.id, null, "bye"));
    const rounds = [openingRound, ...[8, 4, 2, 1].map((count) => Array.from({ length: count }, () => fixture(null, null)))];
    const tournament = {
      id: createId(), draftId: state.draftId || createId(), status: "active", currentRound: 0, currentFixture: 0, champion: null,
      teams: [userTeam, ...clubTeams], rounds, playerStats: [],
    };
    prepareTournamentRound(tournament, 0);
    state.tournament = tournament;
    state.playedSquads.push(signature);
    state.match = null;
    state.phase = "tournament";
    saveState();
    render();
  } catch (error) {
    console.error("Unable to start tournament:", error);
    showToast(error.message || "Unable to create the tournament bracket.");
  }
}

function teamLineup(teamId) {
  return getTournamentTeam(teamId).lineup;
}

function startTournamentMatch() {
  const tournament = state.tournament;
  if (tournament.competition && tournament.competition !== "superlig" && tournament.phaseType === "league") {
    if (state.match?.tournamentStage === "league" && state.match.minute < 90) {
      state.phase = "match";
      saveState();
      render();
      return;
    }
    const current = tournament.schedule[tournament.leagueRound][tournament.currentLeagueFixture];
    if (current.status !== "user-ready") {
      showToast("Your next European match is not ready.");
      return;
    }
    const opponentId = current.home === "your-xi" ? current.away : current.home;
    const opponent = getTournamentTeam(opponentId, tournament);
    state.match = {
      number: tournament.leagueRound + 1,
      minute: 0,
      score: [0, 0],
      lineup: state.squad.map((pick) => ({ ...pick })),
      substitutions: 0,
      usedSubstitutes: [],
      substitutedOut: [],
      opponent: teamLineup(opponentId).map((pick) => ({ ...pick })),
      opponentClub: opponent.name,
      opponentTeamId: opponent.id,
      tournament: true,
      tournamentStage: "league",
      log: [{ minute: 0, text: `Kick-off! Your XI face ${opponent.name} in matchday ${tournament.leagueRound + 1}.`, kind: "start" }],
      shots: [0, 0],
      possession: [50, 50],
      tactic: "balanced",
    };
    state.phase = "match";
    saveState();
    render();
    return;
  }
  const current = tournament.rounds[tournament.currentRound][tournament.currentFixture];
  if (state.match?.tournament && state.match.minute < 90 && state.match.number === tournament.currentRound + 1) {
    state.phase = "match";
    saveState();
    render();
    return;
  }
  if (current.status !== "user-ready") {
    showToast("Your next tournament fixture is not ready.");
    return;
  }
  const opponentId = current.home === "your-xi" ? current.away : current.home;
  const opponent = getTournamentTeam(opponentId);
  state.match = {
    number: tournament.currentRound + 1,
    minute: 0,
    score: [0, 0],
    lineup: state.squad.map((pick) => ({ ...pick })),
    substitutions: 0,
    usedSubstitutes: [],
    substitutedOut: [],
    opponent: teamLineup(opponentId).map((pick) => ({ ...pick })),
    opponentClub: opponent.name,
    opponentTeamId: opponent.id,
    tournament: true,
    log: [{ minute: 0, text: `Cup kick-off! Your XI face ${opponent.name} in the ${tournamentRoundNames[tournament.currentRound]}.`, kind: "start" }],
    shots: [0, 0],
    possession: [50, 50],
    tactic: "balanced",
  };
  state.phase = "match";
  saveState();
  render();
}

function finishTournamentMatch() {
  const tournament = state.tournament;
  if (tournament.competition && tournament.competition !== "superlig") {
    finishEuropeanMatch();
    return;
  }
  const current = tournament.rounds[tournament.currentRound][tournament.currentFixture];
  const userIsHome = current.home === "your-xi";
  current.score = userIsHome ? [...state.match.score] : [...state.match.score].reverse();
  recordGeneratedPlayerStats(tournament, current.home, current.away, current.score);
  current.penalties = state.match.penalties ? userIsHome ? [...state.match.penalties] : [...state.match.penalties].reverse() : null;
  const userWon = state.match.penalties ? state.match.penalties[0] > state.match.penalties[1] : state.match.score[0] > state.match.score[1];
  if (!userWon) {
    current.winner = current.home === "your-xi" ? current.away : current.home;
    current.status = "complete";
    tournament.status = "eliminated";
    return;
  }
  current.winner = "your-xi";
  current.status = "complete";
  if (tournament.currentRound === tournamentRoundNames.length - 1) {
    tournament.status = "champion";
    tournament.champion = "your-xi";
    return;
  }
  const winners = tournament.rounds[tournament.currentRound].map((match) => match.winner);
  if (winners.some((teamId) => !teamId)) throw new Error("The tournament round cannot advance before every fixture has a winner.");
  const nextRound = tournament.rounds[tournament.currentRound + 1];
  for (let index = 0; index < nextRound.length; index += 1) {
    nextRound[index] = fixture(winners[index * 2], winners[index * 2 + 1]);
  }
  prepareTournamentRound(tournament, tournament.currentRound + 1);
}

function finishEuropeanMatch() {
  const tournament = state.tournament;
  if (tournament.phaseType === "league") {
    const current = tournament.schedule[tournament.leagueRound][tournament.currentLeagueFixture];
    const score = current.home === "your-xi" ? [...state.match.score] : [...state.match.score].reverse();
    recordEuropeanResult(tournament, current, score);
    if (tournament.leagueRound === 7) {
      tournament.leagueRound = 8;
      prepareEuropeanKnockouts(tournament);
    } else {
      prepareEuropeanLeagueRound(tournament, tournament.leagueRound + 1);
    }
    return;
  }
  const current = tournament.rounds[tournament.currentRound][tournament.currentFixture];
  const userIsHome = current.home === "your-xi";
  current.score = userIsHome ? [...state.match.score] : [...state.match.score].reverse();
  recordGeneratedPlayerStats(tournament, current.home, current.away, current.score);
  current.penalties = state.match.penalties
    ? userIsHome ? [...state.match.penalties] : [...state.match.penalties].reverse()
    : null;
  const userWon = current.penalties
    ? current.penalties[0] > current.penalties[1]
    : current.score[0] > current.score[1];
  current.winner = userWon ? "your-xi" : current.home === "your-xi" ? current.away : current.home;
  current.status = "complete";
  if (!userWon) {
    tournament.status = "eliminated";
    tournament.phaseType = "eliminated";
    return;
  }
  if (tournament.currentRound === 4) {
    tournament.status = "champion";
    tournament.champion = "your-xi";
    return;
  }
  if (tournament.currentRound === 0) {
    createEuropeanRoundOf16(tournament);
    prepareTournamentRound(tournament, 1);
    return;
  }
  const winners = tournament.rounds[tournament.currentRound].map((match) => match.winner);
  if (winners.some((teamId) => !teamId)) throw new Error("The European knockout round is incomplete.");
  const nextRound = tournament.rounds[tournament.currentRound + 1];
  for (let index = 0; index < nextRound.length; index += 1) {
    nextRound[index] = fixture(winners[index * 2], winners[index * 2 + 1]);
  }
  prepareTournamentRound(tournament, tournament.currentRound + 1);
}

function teamBadge(team, extraClass = "") {
  if (!team) return `<span class="team-badge bye-badge ${extraClass}" aria-label="To be determined">·</span>`;
  const fallback = `<span class="badge-fallback">${escapeHtml(team.short || clubInitials(team.name))}</span>`;
  return `<span class="team-badge ${team.user ? "user-badge" : ""} ${extraClass}">${team.logo ? `<img src="${escapeHtml(team.logo)}" alt="" loading="lazy" />` : ""}${fallback}</span>`;
}

function fixtureMarkup(current, roundIndex, fixtureIndex) {
  const tournament = state.tournament;
  const home = getTournamentTeam(current.home);
  const away = getTournamentTeam(current.away);
  const userInFixture = current.home === "your-xi" || current.away === "your-xi";
  const liveFixture = userInFixture && tournament.status === "active" && roundIndex === tournament.currentRound;
  const matchScore = current.score ? `${current.score[0]}–${current.score[1]}${current.penalties ? ` (${current.penalties.join("–")} pens)` : ""}` : current.status === "user-ready" ? "VS" : "·";
  return `<div class="tree-fixture ${userInFixture ? "user-fixture" : ""} ${current.status === "bye" ? "bye-fixture" : ""} ${current.status === "complete" ? "played-fixture" : ""}">
    <div class="tree-team ${current.winner === current.home && current.status === "complete" || current.winner === current.home && current.status === "bye" ? "winner" : ""}">${teamBadge(home)}<span>${home ? escapeHtml(home.name) : "TBD"}</span></div>
    ${current.status !== "bye" ? `<div class="tree-result">${escapeHtml(matchScore)}</div><div class="tree-team ${current.winner === current.away && current.status === "complete" ? "winner" : ""}">${teamBadge(away)}<span>${away ? escapeHtml(away.name) : "TBD"}</span></div>` : '<div class="tree-result bye-result">BYE → R16</div>'}
    ${liveFixture ? `<button class="primary-button tree-play" data-round="${roundIndex}" data-fixture="${fixtureIndex}">${state.match?.tournament && roundIndex === tournament.currentRound && state.tournament.currentFixture === fixtureIndex && state.match.minute < 90 ? "Resume match" : "Play match"} →</button>` : ""}
  </div>`;
}

function renderLeaderTable(tournament, stat, title) {
  const rows = [...(tournament.playerStats || [])]
    .filter((entry) => entry[stat] > 0)
    .sort((a, b) => b[stat] - a[stat] ||
      (stat === "goals" ? b.assists - a.assists : b.goals - a.goals) ||
      (players.find((player) => player.id === a.playerId)?.name || "").localeCompare(
        players.find((player) => player.id === b.playerId)?.name || "",
      ))
    .slice(0, 5);
  return `<section class="panel leader-panel">
    <div class="panel-head"><h2>${title}</h2><span>THIS CAMPAIGN</span></div>
    ${rows.length ? `<ol class="leader-list">${rows.map((entry, index) => {
      const player = players.find((candidate) => candidate.id === entry.playerId);
      const isUserPlayer = [...state.squad, ...(state.bench || [])].some((pick) => pick.playerId === entry.playerId);
      return `<li><span class="leader-rank">${String(index + 1).padStart(2, "0")}</span>
        ${playerPortrait(player, "leader-portrait")}<span class="leader-player">${escapeHtml(player.name)}${isUserPlayer ? '<b class="leader-team-tag">YOUR XI</b>' : ""}<small>${escapeHtml(player.club)}</small></span>
        <strong class="leader-total">${entry[stat]}</strong></li>`;
    }).join("")}</ol>` : '<p class="leader-empty">The first goal is waiting to be scored.</p>'}
  </section>`;
}

function renderUserLeaderTable(tournament, stat, title) {
  const userIds = new Set([...state.squad, ...(state.bench || [])].map((pick) => pick.playerId));
  const rows = [...(tournament.playerStats || [])]
    .filter((entry) => entry[stat] > 0 && userIds.has(entry.playerId))
    .sort((a, b) => b[stat] - a[stat] ||
      (stat === "goals" ? b.assists - a.assists : b.goals - a.goals) ||
      (players.find((player) => player.id === a.playerId)?.name || "").localeCompare(
        players.find((player) => player.id === b.playerId)?.name || "",
      ));
  return `<section class="panel leader-panel user-leader-panel">
    <div class="panel-head"><h2>${title}</h2><span>${rows.length} PLAYERS</span></div>
    ${rows.length ? `<ol class="leader-list">${rows.map((entry, index) => {
      const player = players.find((candidate) => candidate.id === entry.playerId);
      return `<li><span class="leader-rank">${String(index + 1).padStart(2, "0")}</span>
        ${playerPortrait(player, "leader-portrait")}<span class="leader-player">${escapeHtml(player.name)}<b class="leader-team-tag">YOUR XI</b><small>${escapeHtml(player.club)}</small></span>
        <strong class="leader-total">${entry[stat]}</strong></li>`;
    }).join("")}</ol>` : `<p class="leader-empty">Your players' ${stat === "goals" ? "goals" : "assists"} will appear here after they contribute in campaign matches.</p>`}
  </section>`;
}

function renderTournamentLeaders(tournament) {
  return `<section class="leaderboards">
    ${renderLeaderTable(tournament, "goals", "TOP SCORERS")}
    ${renderLeaderTable(tournament, "assists", "TOP ASSISTERS")}
    ${renderUserLeaderTable(tournament, "goals", "YOUR XI · SCORERS")}
    ${renderUserLeaderTable(tournament, "assists", "YOUR XI · ASSISTS")}
  </section>`;
}

function renderTournament() {
  const tournament = state.tournament;
  if (tournament.competition && tournament.competition !== "superlig") {
    renderEuropeanTournament(tournament);
    return;
  }
  const isChampion = tournament.status === "champion";
  const isOut = tournament.status === "eliminated";
  app.innerHTML = `
    ${warningMarkup()}
    <section class="tournament-wrap" data-competition-theme="superlig">
      <div class="draft-heading">
        <div><div class="eyebrow">2026/27 SÜPER LİG CUP · 19 ENTRANTS</div><h1 class="display">${isChampion ? "CUP CHAMPIONS." : isOut ? "CUP RUN ENDED." : "THE ROAD TO THE FINAL."}</h1></div>
        <button class="text-button" id="team-from-bracket">← YOUR SQUAD</button>
      </div>
      <div class="tournament-banner panel">
        ${competitionLogo(competitionCatalog.superlig, "banner-competition-logo")}
        <div><span class="eyebrow">${isChampion ? "TROPHY SECURED" : isOut ? "ELIMINATED" : `${tournamentRoundNames[tournament.currentRound]} · ${tournament.currentRound + 1} / ${tournamentRoundNames.length}`}</span>
          <h2>${isChampion ? "You are the champions." : isOut ? `${escapeHtml(getTournamentTeam(tournament.rounds[tournament.currentRound][tournament.currentFixture].winner)?.name || "Opponents")} knocked you out.` : "One match at a time."}</h2>
          <p>${isChampion ? "Your drafted XI beat every rival on the way to the cup." : isOut ? "The bracket is yours to review—or start a fresh cup with this XI." : "Beat the league clubs and follow your badge all the way through the tournament tree."}</p></div>
        <div class="tournament-count"><strong>${tournament.teams.length}</strong><span>TEAMS</span></div>
      </div>
      <div class="bracket-scroll"><div class="tournament-bracket">${tournament.rounds.map((round, roundIndex) => `
        <section class="bracket-round ${roundIndex === tournament.currentRound ? "active-round" : ""}">
          <div class="bracket-round-head"><span>${tournamentRoundNames[roundIndex]}</span><small>${roundIndex === 0 ? "3 QUALIFIERS · 13 BYES" : `${round.length} FIXTURES`}</small></div>
          <div class="bracket-matches">${round.map((current, fixtureIndex) => fixtureMarkup(current, roundIndex, fixtureIndex)).join("")}</div>
        </section>`).join("")}</div></div>
      ${renderTournamentLeaders(tournament)}
      <div class="tournament-footer">
        <span>ALL 18 2026/27 SÜPER LİG CLUBS · 32-SLOT CUP BRACKET · BYES INTO THE ROUND OF 16</span>
        <div>
          ${isOut || isChampion ? '<button class="primary-button small-button" id="new-cup-squad">Draft a fresh XI to compete again ↻</button>' : ""}
        </div>
      </div>
      <p class="footer-note">${isOut || isChampion ? "Campaign complete: this XI cannot enter another competition. Review the bracket and leaderboards, then draft a fresh XI to play again." : "Other cup fixtures are simulated automatically. Scorer and assister rankings are gameplay estimates across the campaign, not official records. Player cards distinguish EA FC 27 ratings-page values from clearly labeled gameplay estimates."}</p>
    </section>`;
  document.querySelector("#team-from-bracket").addEventListener("click", () => { state.phase = "complete"; saveState(); render(); });
  bindCompetitionLogos();
  bindPlayerPortraits();
  document.querySelectorAll(".team-badge img").forEach((image) => {
    image.addEventListener("load", () => { image.nextElementSibling.style.display = "none"; });
    image.addEventListener("error", () => { image.style.display = "none"; });
  });
  document.querySelectorAll(".tree-play").forEach((button) => button.addEventListener("click", startTournamentMatch));
  document.querySelector("#new-cup-squad")?.addEventListener("click", resetDraft);
}

function renderEuropeanTournament(tournament) {
  const competition = competitionCatalog[tournament.competition];
  const standings = europeanStandings(tournament);
  const isChampion = tournament.status === "champion";
  const isOut = tournament.status === "eliminated";
  const phaseLabel = tournament.phaseType === "league"
    ? `LEAGUE PHASE · MATCHDAY ${tournament.leagueRound + 1} / 8`
    : tournament.phaseType === "eliminated"
      ? "LEAGUE PHASE COMPLETE"
      : ["PLAY-OFF ROUND", "ROUND OF 16", "QUARTER-FINAL", "SEMI-FINAL", "FINAL"][tournament.currentRound];
  const currentFixtures = tournament.phaseType === "league"
    ? tournament.schedule[tournament.leagueRound] || []
    : [];
  const fixtureRows = currentFixtures.map((current) => {
    const home = getTournamentTeam(current.home, tournament);
    const away = getTournamentTeam(current.away, tournament);
    const score = current.score ? `${current.score[0]}–${current.score[1]}` : "vs";
    const isUser = current.home === "your-xi" || current.away === "your-xi";
    return `<div class="europe-fixture ${isUser ? "user-fixture" : ""}">
      ${teamBadge(home)}<strong>${escapeHtml(home?.name || "TBD")}</strong>
      <span class="europe-score">${score}</span>
      ${teamBadge(away)}<strong>${escapeHtml(away?.name || "TBD")}</strong>
      ${isUser && current.status === "user-ready" ? '<button class="primary-button small-button europe-play" type="button">Play match →</button>' : ""}
    </div>`;
  }).join("");
  const tableRows = standings.map((row, index) => {
    const team = getTournamentTeam(row.teamId, tournament);
    const goalDifference = row.goalsFor - row.goalsAgainst;
    return `<tr class="${row.teamId === "your-xi" ? "your-table-row" : ""} ${index === 7 || index === 23 ? "table-cut" : ""}">
      <td>${index + 1}</td><td>${teamBadge(team)}<span>${escapeHtml(team.name)}</span></td>
      <td>${row.played}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td>
      <td>${goalDifference > 0 ? "+" : ""}${goalDifference}</td><td><strong>${row.points}</strong></td>
    </tr>`;
  }).join("");
  const bracket = tournament.phaseType === "knockout" ? `<div class="bracket-scroll"><div class="tournament-bracket">${tournament.rounds.map((round, roundIndex) => `
    <section class="bracket-round ${roundIndex === tournament.currentRound ? "active-round" : ""}">
      <div class="bracket-round-head"><span>${["PLAY-OFF", "ROUND OF 16", "QUARTER-FINAL", "SEMI-FINAL", "FINAL"][roundIndex]}</span>
        <small>${roundIndex === 0 ? "RANKS 9–24" : `${round.length} FIXTURES`}</small></div>
      <div class="bracket-matches">${round.map((current, fixtureIndex) => fixtureMarkup(current, roundIndex, fixtureIndex)).join("")}</div>
    </section>`).join("")}</div></div>` : "";
  let headline = "Eight matchdays. One European crown.";
  if (isChampion) headline = "European champions.";
  else if (isOut && tournament.userLeagueRank > 24) headline = "League phase complete.";
  else if (isOut) headline = "Your European run has ended.";
  else if (tournament.phaseType === "knockout") headline = "The knockout road.";
  const subhead = isChampion
    ? "Your XI won the final and lifted the trophy."
    : tournament.phaseType === "league"
      ? `Your XI replaces ${tournament.replacedTeam} in this saved 36-team simulation.`
      : isOut && tournament.userLeagueRank > 24
        ? `Your XI finished ${tournament.userLeagueRank}${ordinalSuffix(tournament.userLeagueRank)} and did not qualify for the knockouts.`
        : isOut ? "Review the standings and bracket, or start a fresh run." : "Top eight qualify directly; places 9–24 enter the play-offs.";
  app.innerHTML = `
    ${warningMarkup()}
    <section class="tournament-wrap" data-competition-theme="${escapeHtml(tournament.competition)}">
      <div class="draft-heading">
        <div><div class="eyebrow">2026/27 · ${escapeHtml(competition.short)} · 36-TEAM FORMAT</div><h1 class="display">${isChampion ? "EUROPEAN CHAMPIONS." : isOut ? "CAMPAIGN COMPLETE." : "THE EUROPEAN ROAD."}</h1></div>
        <button class="text-button" id="team-from-bracket">← YOUR SQUAD</button>
      </div>
      <div class="tournament-banner panel">
        ${competitionLogo(competition, "banner-competition-logo")}
        <div><span class="eyebrow">${escapeHtml(phaseLabel)}</span><h2>${escapeHtml(headline)}</h2><p>${escapeHtml(subhead)}</p></div>
        <div class="tournament-count"><strong>36</strong><span>ENTRANTS</span></div>
      </div>
      ${tournament.phaseType === "league" || tournament.phaseType === "eliminated" || isChampion ? `<section class="panel europe-table-panel">
        <div class="panel-head"><h2>LEAGUE PHASE TABLE</h2><span>TOP 8 DIRECT · 9–24 PLAY-OFFS</span></div>
        <div class="europe-table-scroll"><table class="europe-table"><thead><tr><th>#</th><th>CLUB</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th></tr></thead><tbody>${tableRows}</tbody></table></div>
      </section>` : `<section class="panel europe-table-panel">
        <div class="panel-head"><h2>LEAGUE PHASE FINISH</h2><span>YOUR XI · ${tournament.userLeagueRank}${ordinalSuffix(tournament.userLeagueRank)} PLACE</span></div>
        <div class="qualification-strip"><span>8 MATCHES</span><strong>${tournament.userLeagueRank <= 8 ? "DIRECT TO ROUND OF 16" : "QUALIFIED THROUGH PLAY-OFFS"}</strong><span>${standings.find((row) => row.teamId === "your-xi")?.points || 0} POINTS</span></div>
      </section>`}
      ${tournament.phaseType === "league" ? `<section class="panel europe-matchday">
        <div class="panel-head"><h2>MATCHDAY ${tournament.leagueRound + 1}</h2><span>SIMULATED FIXTURES</span></div>
        <div class="europe-fixtures">${fixtureRows}</div>
      </section>` : ""}
      ${bracket}
      ${renderTournamentLeaders(tournament)}
      <div class="tournament-footer">
        <span>OFFICIAL 2026/27 PARTICIPANTS · SIMULATED SCHEDULES AND SCORES · SINGLE-MATCH KNOCKOUTS</span>
        <div>${isOut || isChampion ? '<button class="primary-button small-button" id="new-cup-squad">Draft a fresh XI to compete again ↻</button>' : ""}</div>
      </div>
      <p class="footer-note">${isOut || isChampion ? "Campaign complete: this XI cannot enter another competition. Review the standings and player leaderboards, then draft a fresh XI to play again." : "European entrant lists are sourced from ESPN's 2026/27 competition data. Each team plays eight generated league-phase matches; this is not the official fixture draw. Scorer and assister rankings are gameplay estimates across the campaign, not official records. Knockout ties are single-match simulations for gameplay. EA FC ratings and estimated-rating labels are shown on player cards."}</p>
    </section>`;
  document.querySelector("#team-from-bracket").addEventListener("click", () => { state.phase = "complete"; saveState(); render(); });
  bindCompetitionLogos();
  bindPlayerPortraits();
  document.querySelectorAll(".team-badge img").forEach((image) => {
    image.addEventListener("load", () => { image.nextElementSibling.style.display = "none"; });
    image.addEventListener("error", () => { image.style.display = "none"; });
  });
  document.querySelector(".europe-play")?.addEventListener("click", startTournamentMatch);
  document.querySelectorAll(".tree-play").forEach((button) => button.addEventListener("click", startTournamentMatch));
  document.querySelector("#new-cup-squad")?.addEventListener("click", resetDraft);
}

function ordinalSuffix(number) {
  if (number % 100 >= 11 && number % 100 <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" })[number % 10] || "th";
}

function startMatch() {
  if (state.tournament) {
    showToast(state.tournament.status === "active"
      ? "Finish or review your current campaign before starting a friendly."
      : "This campaign is saved for review. Draft a fresh XI to compete again.");
    return;
  }
  if (state.match?.tournament) state.match = null;
  if (state.match && state.match.number === state.record.played + 1 && state.match.minute < 90) {
    state.phase = "match";
    saveState();
    render();
    return;
  }
  let opponent;
  try {
    opponent = createOpponent();
  } catch (error) {
    console.error("Unable to build match opponent:", error);
    showToast(error.message);
    return;
  }
  state.match = {
    number: state.record.played + 1,
    minute: 0,
    score: [0, 0],
    lineup: state.squad.map((pick) => ({ ...pick })),
    substitutions: 0,
    usedSubstitutes: [],
    substitutedOut: [],
    opponent: opponent.lineup,
    opponentClub: opponent.club,
    log: [{ minute: 0, text: `Kick-off! Your XI host ${opponent.club}.`, kind: "start" }],
    shots: [0, 0],
    possession: [50, 50],
    tactic: "balanced",
  };
  state.phase = "match";
  saveState();
  render();
}

function teamStrength(picks) {
  const values = picks.map((pick, index) => {
    const player = players.find((item) => item.id === pick.playerId);
    const slot = formations[state.formation][index];
    return { player, role: slot.role };
  });
  const attackPlayers = values.filter(({ role }) => ["ST", "LW", "RW", "LM", "RM", "CAM"].includes(role));
  const defensePlayers = values.filter(({ role }) => ["CB", "LB", "RB", "CDM", "GK"].includes(role));
  const average = (list, select) => list.length ? list.reduce((sum, item) => sum + select(item), 0) / list.length : 70;
  return {
    attack: average(attackPlayers, ({ player }) => player.rating * 0.45 + player.stats[1] * 0.25 + player.stats[3] * 0.15 + player.stats[2] * 0.15),
    defense: average(defensePlayers, ({ player, role }) => role === "GK" ? player.rating * 0.45 + player.stats[3] * 0.35 + player.stats[5] * 0.2 : player.rating * 0.35 + player.stats[4] * 0.45 + player.stats[5] * 0.2),
  };
}

function matchEvent(text, kind, minute) {
  state.match.log.push({ minute, text, kind });
}

function simulateTeamChance(teamIndex, minute, attack, defense) {
  const match = state.match;
  const userTeam = teamIndex === 0;
  const tactics = match.tactic;
  const attackModifier = userTeam ? (tactics === "attack" ? 0.09 : tactics === "defend" ? -0.08 : 0) : (tactics === "attack" ? 0.035 : tactics === "defend" ? -0.065 : 0);
  const shotChance = Math.max(0.18, Math.min(0.72, 0.48 + (attack.attack - defense.defense) * 0.012 + attackModifier));
  const picks = userTeam ? match.lineup || state.squad : match.opponent;
  const { scorer, assister } = chooseGoalParticipants(picks);
  const defendingKeeper = getTeamPlayers(userTeam ? match.opponent : match.lineup || state.squad)[
    formations[state.formation].findIndex((slot) => slot.role === "GK")
  ];
  if (Math.random() >= shotChance) return false;

  match.shots[teamIndex] += 1;
  const minuteInSpell = minute - 15 + 1 + Math.floor(Math.random() * 15);
  const finishModifier = userTeam && tactics === "attack" ? 0.025 : 0;
  const scoreChance = Math.max(0.12, Math.min(0.53, 0.29 + (attack.attack - defense.defense) * 0.018 + finishModifier - (defendingKeeper.rating - 75) * 0.009));
  const teamName = userTeam ? "Your XI" : match.opponentClub;
  if (Math.random() < scoreChance) {
    match.score[teamIndex] += 1;
    if (userTeam) recordPlayedGoal(scorer, assister);
    const assistText = assister ? ` Assisted by ${assister.name}.` : "";
    match.log.push({
      minute: minuteInSpell,
      text: `${scorer.name} scores for ${teamName}!${assistText}`,
      kind: "goal",
      teamIndex,
      scorerId: scorer.id,
      assistId: assister?.id || null,
    });
  } else {
    const outcomes = ["fires just wide", "is denied by the goalkeeper", "sends the effort over the bar"];
    matchEvent(`${scorer.name} ${outcomes[Math.floor(Math.random() * outcomes.length)]}.`, "shot", minuteInSpell);
  }
  return true;
}

function playPeriod() {
  const match = state.match;
  if (state.phase !== "match" || match.minute >= 90) return;
  const userStrength = teamStrength(match.lineup || state.squad);
  const opponentStrength = teamStrength(match.opponent);
  const endMinute = match.minute + 15;
  const homeChance = simulateTeamChance(0, endMinute, userStrength, opponentStrength);
  const awayChance = simulateTeamChance(1, endMinute, opponentStrength, userStrength);
  if (!homeChance && !awayChance) matchEvent("Both sides battle for control in midfield.", "play", endMinute);
  const possessionTilt = match.tactic === "attack" ? 4 : match.tactic === "defend" ? -5 : 1;
  match.possession[0] = Math.max(35, Math.min(65, match.possession[0] + possessionTilt + (Math.random() < 0.5 ? 1 : -1)));
  match.possession[1] = 100 - match.possession[0];
  match.minute = endMinute;
  if (match.minute === 45) matchEvent("Half-time. Regroup and choose your approach for the second half.", "break", 45);
  if (match.minute === 90) {
    matchEvent("Full-time.", "break", 90);
    if (match.tournament) {
      try {
        if (match.tournamentStage !== "league" && match.score[0] === match.score[1]) {
          const userRating = ratingForPicks(match.lineup || state.squad);
          const opponentRating = ratingForPicks(match.opponent);
          const chance = 0.5 + Math.max(-0.08, Math.min(0.08, (userRating - opponentRating) * 0.012));
          const userGoals = Math.random() < chance ? 5 : 4;
          match.penalties = [userGoals, userGoals === 5 ? 4 : 5];
          matchEvent(`Penalty shoot-out: ${match.penalties[0]}–${match.penalties[1]}.`, "break", 90);
        }
        finishTournamentMatch();
        state.phase = "tournament";
      } catch (error) {
        console.error("Unable to advance tournament:", error);
        showToast(error.message);
      }
    } else {
      state.phase = "match-result";
      state.record.played += 1;
      if (match.score[0] > match.score[1]) state.record.wins += 1;
      else if (match.score[0] === match.score[1]) state.record.draws += 1;
      else state.record.losses += 1;
    }
  }
  saveState();
  render();
}

function substitutionOptions(match) {
  const used = new Set(match.usedSubstitutes || []);
  const unavailable = new Set(match.substitutedOut || []);
  return (state.bench || []).filter((benchPick) => !used.has(benchPick.playerId)).flatMap((benchPick) => {
    const incoming = players.find((player) => player.id === benchPick.playerId);
    if (!incoming) return [];
    return (match.lineup || state.squad).flatMap((outgoingPick) => {
      const slot = formations[state.formation].find((item) => item.id === outgoingPick.slotId);
      const outgoing = players.find((player) => player.id === outgoingPick.playerId);
      if (!slot || !outgoing || unavailable.has(outgoing.id) ||
          positionGroupForRole(slot.role) !== positionGroupForRole(benchSlots.find((item) => item.id === benchPick.slotId)?.roles[0]) ||
          !incoming.roles.some((role) => positionGroupForRole(role) === positionGroupForRole(slot.role))) return [];
      return [{ incoming, outgoing, slot }];
    });
  });
}

function makeSubstitution(incomingId, slotId) {
  const match = state.match;
  const currentMinute = match?.minute;
  if (state.phase !== "match" || !match || currentMinute <= 0 || currentMinute >= 90 ||
      ![15, 30, 45, 60, 75].includes(currentMinute)) {
    showToast("Substitutions are only available between match periods.");
    return;
  }
  const used = new Set(match.usedSubstitutes || []);
  const outgoingIndex = (match.lineup || state.squad).findIndex((pick) => pick.slotId === slotId);
  const incomingPick = (state.bench || []).find((pick) => pick.playerId === incomingId);
  const outgoingPick = (match.lineup || state.squad)[outgoingIndex];
  const incoming = players.find((player) => player.id === incomingId);
  const outgoing = players.find((player) => player.id === outgoingPick?.playerId);
  const slot = formations[state.formation].find((item) => item.id === slotId);
  if (match.substitutions >= 5 || used.has(incomingId) || !incomingPick || !outgoing || !slot ||
      (match.substitutedOut || []).includes(outgoing.id) ||
      !incoming.roles.some((role) => positionGroupForRole(role) === positionGroupForRole(slot.role))) {
    showToast("That substitution is no longer available.");
    return;
  }
  match.lineup[outgoingIndex] = { slotId, playerId: incomingId };
  match.substitutions = (match.substitutions || 0) + 1;
  match.usedSubstitutes ||= [];
  match.usedSubstitutes.push(incomingId);
  match.substitutedOut ||= [];
  match.substitutedOut.push(outgoing.id);
  match.log.push({
    minute: currentMinute,
    text: `Substitution: ${incoming.name} replaces ${outgoing.name}.`,
    kind: "substitution",
  });
  saveState();
  renderMatch();
}

function renderMatch() {
  const match = state.match;
  const live = state.phase === "match";
  const competitionLabel = match.tournament
    ? competitionCatalog[state.tournament.competition]?.short || "SÜPER LİG CUP"
    : "FRIENDLY";
  const fixtureLabel = match.tournamentStage === "league" ? `LEAGUE MATCHDAY ${match.number}` : match.tournament ? "KNOCKOUT MATCH" : `MATCH ${match.number}`;
  const resultText = match.score[0] === match.score[1] ? "LEVEL AT FULL-TIME" : match.score[0] > match.score[1] ? "A WIN FOR YOUR XI" : "YOUR XI WILL GO AGAIN";
  const scorerEvents = match.log.filter((event) => event.kind === "goal").sort((a, b) => a.minute - b.minute);
  const scorerMarkup = scorerEvents.length
    ? scorerEvents.map((event) => {
      const scorer = players.find((player) => player.id === event.scorerId);
      const assister = players.find((player) => player.id === event.assistId);
      const fallbackText = event.text.replace(/!.*$/, "");
      return `<span class="scorer-chip"><strong>${event.minute}'</strong><span>${scorer ? escapeHtml(scorer.name) : escapeHtml(fallbackText)}${assister ? `<small>Assist: ${escapeHtml(assister.name)}</small>` : ""}</span><em>${event.teamIndex === 0 ? "YOUR XI" : escapeHtml(match.opponentClub)}</em></span>`;
    }).join("")
    : '<span class="scorers-empty">No goals yet</span>';
  const tactics = [
    { id: "attack", name: "Go for it", detail: "More chances · More counter risk" },
    { id: "balanced", name: "Stay balanced", detail: "Measured risk and control" },
    { id: "defend", name: "Shut it down", detail: "Protect the goal · Fewer breaks" },
  ];
  const isSubstitutionBreak = live && match.minute > 0 && match.minute < 90;
  const subOptions = isSubstitutionBreak ? substitutionOptions(match) : [];
  const subsRemaining = Math.max(0, Math.min(5, (state.bench || []).length) - (match.substitutions || 0));
  app.innerHTML = `
    ${warningMarkup()}
    <section class="match-wrap" data-competition-theme="${match.tournament ? escapeHtml(state.tournament.competition || "superlig") : "friendly"}">
      <div class="draft-heading">
        <div><div class="eyebrow"><span class="match-competition-label">${match.tournament ? competitionLogo(competitionCatalog[state.tournament.competition || "superlig"], "match-competition-logo") : ""}${escapeHtml(fixtureLabel)} · ${escapeHtml(competitionLabel)}</span></div><h1 class="display">${live ? "MATCH DAY." : "FULL TIME."}</h1></div>
        <button class="text-button" id="back-to-team">← YOUR SQUAD</button>
      </div>
      <section class="match-scoreboard panel">
        <div class="match-team"><span class="team-crest">${clubInitials(state.squad.map((pick) => players.find((player) => player.id === pick.playerId).club).sort((a, b) => state.squad.filter((pick) => players.find((player) => player.id === pick.playerId).club === b).length - state.squad.filter((pick) => players.find((player) => player.id === pick.playerId).club === a).length)[0])}</span><strong>YOUR XI</strong><small>${state.formation} · YOUR DRAFT</small></div>
        <div class="score-center"><div class="score-line"><strong>${match.score[0]}</strong><span>–</span><strong>${match.score[1]}</strong></div><span class="match-clock">${live ? `${match.minute}'` : "90' · FT"}</span><span class="score-subtitle">${live ? `MATCH ${match.number}` : resultText}</span></div>
        <div class="match-team away"><span class="team-crest opponent-crest">${clubInitials(match.opponentClub)}</span><strong>${escapeHtml(match.opponentClub)}</strong><small>${escapeHtml(competitionLabel)} · 2026/27</small></div>
      </section>
      <section class="score-scorers panel"><div class="scorers-heading">GOALSCORERS</div><div class="scorers-list">${scorerMarkup}</div></section>
      <div class="match-columns">
        <section class="panel match-play-panel">
          <div class="panel-head"><h2>${live ? match.minute < 45 ? "FIRST HALF" : "SECOND HALF" : "MATCH REPORT"}</h2><span>${live ? "15-MINUTE TACTICAL SIM" : "FINAL WHISTLE"}</span></div>
          <div class="match-stats">
            <div><strong>${match.shots[0]}</strong><span>SHOTS</span><strong>${match.shots[1]}</strong></div>
            <div class="possession-bar"><span>${match.possession[0]}%</span><i><b style="width:${match.possession[0]}%"></b></i><span>${match.possession[1]}%</span></div>
            <div><span>YOUR XI</span><span>POSSESSION</span><span>${escapeHtml(match.opponentClub)}</span></div>
          </div>
          ${live ? `<div class="tactics-label"><span class="eyebrow">SET YOUR TACTICS</span><span>CHOICE AFFECTS CHANCES THIS PERIOD</span></div>
            <div class="tactics-grid">${tactics.map((tactic) => `<button type="button" data-tactic="${tactic.id}" class="tactic-card ${match.tactic === tactic.id ? "selected" : ""}"><strong>${tactic.name}</strong><span>${tactic.detail}</span></button>`).join("")}</div>
            ${isSubstitutionBreak ? `<div class="substitution-panel"><div class="substitution-heading"><strong>MAKE A SUBSTITUTION</strong><span>${subsRemaining} LEFT · MAX 5</span></div>
              ${subOptions.length ? `<label class="substitution-select-label" for="substitution-pair">Replace a player with one of your unused bench picks</label>
                <select id="substitution-pair" class="substitution-select">${subOptions.map(({ incoming, outgoing, slot }) => `<option value="${escapeHtml(incoming.id)}|${escapeHtml(slot.id)}">${escapeHtml(incoming.name)} for ${escapeHtml(outgoing.name)} · ${slot.role}</option>`).join("")}</select>
                <button class="text-button substitution-submit" id="make-substitution" type="button" ${subsRemaining === 0 ? "disabled" : ""}>Confirm substitution ↗</button>`
                : `<p class="substitution-empty">${subsRemaining ? "No compatible unused bench player is available for this lineup." : "All available substitutes have been used."}</p>`}
              <p class="substitution-note">Substitutions are available at each 15-minute break. Players who leave cannot return.</p></div>` : ""}
            <button class="primary-button full-button period-button" id="play-period">${match.minute === 0 ? "Kick off · Play 15 minutes" : `Play ${match.minute + 1}–${match.minute + 15} minutes`} <span aria-hidden="true">→</span></button>`
            : `<div class="result-callout"><span class="eyebrow">${resultText}</span><p>${match.shots[0]} shots · ${match.possession[0]}% possession · Season record ${state.record.wins}W ${state.record.draws}D ${state.record.losses}L</p></div>
              <div class="complete-buttons"><button class="primary-button full-button" id="next-match">Play next match <span aria-hidden="true">→</span></button><button class="text-button" id="back-to-draft">Back to your XI</button></div>`}
        </section>
        <section class="panel match-commentary">
          <div class="panel-head"><h2>LIVE COMMENTARY</h2><span>${match.log.length} EVENTS</span></div>
          <div class="commentary-list">${[...match.log].reverse().map((event) => `<div class="commentary-event ${event.kind === "goal" ? "goal-event" : ""}"><strong>${event.minute === 0 ? "KO" : `${event.minute}'`}</strong><span>${escapeHtml(event.text)}</span></div>`).join("")}</div>
        </section>
      </div>
      <p class="footer-note">Match outcomes are simulated from estimated player attributes and your tactical decisions. ${escapeHtml(RATING_NOTE)}</p>
    </section>`;
  document.querySelector("#back-to-team").addEventListener("click", () => {
    state.phase = match.tournament ? "tournament" : "complete";
    saveState();
    render();
  });
  bindCompetitionLogos();
  document.querySelector("#back-to-draft")?.addEventListener("click", () => { state.phase = "complete"; saveState(); render(); });
  document.querySelector("#next-match")?.addEventListener("click", startMatch);
  document.querySelectorAll("[data-tactic]").forEach((button) => button.addEventListener("click", () => {
    match.tactic = button.dataset.tactic;
    saveState();
    renderMatch();
  }));
  document.querySelector("#make-substitution")?.addEventListener("click", () => {
    const [incomingId, slotId] = document.querySelector("#substitution-pair").value.split("|");
    makeSubstitution(incomingId, slotId);
  });
  document.querySelector("#play-period")?.addEventListener("click", playPeriod);
}

async function copyTeam() {
  const rows = formations[state.formation].map((slot) => `${slot.role}: ${getPickedPlayer(slot.id).name} (${getPickedPlayer(slot.id).club})`);
  const bench = (state.bench || []).map((pick) => {
    const player = players.find((item) => item.id === pick.playerId);
    const slot = benchSlots.find((item) => item.id === pick.slotId);
    return `${slot.label}: ${player.name} (${player.club})`;
  });
  try {
    await navigator.clipboard.writeText(`My XI Draft · ${state.formation}\n${rows.join("\n")}\n\nBench\n${bench.join("\n")}`);
    showToast("Your full squad is copied to the clipboard.");
  } catch (error) {
    console.error("Unable to copy draft:", error);
    showToast("Clipboard access is unavailable in this browser.");
  }
}

function resetDraft() {
  const formation = state.formation;
  const competition = state.competition || "superlig";
  const playedSquads = state.playedSquads || [];
  state = { ...initialState(), formation, competition, playedSquads };
  saveState();
  renderSetup();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function playPickSound() {
  if (!soundOn) return;
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 620;
    gain.gain.setValueAtTime(0.04, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.12);
    oscillator.onended = () => audioContext.close();
  } catch (error) {
    console.error("Unable to play pick sound:", error);
    soundOn = false;
    document.querySelector("#sound-toggle").classList.remove("active");
    showToast("Sound is unavailable in this browser.");
  }
}

document.querySelector("#sound-toggle").addEventListener("click", (event) => {
  soundOn = !soundOn;
  event.currentTarget.classList.toggle("active", soundOn);
  event.currentTarget.title = soundOn ? "Turn sound effects off" : "Turn sound effects on";
  showToast(soundOn ? "Pick sound effects enabled." : "Pick sound effects muted.");
});

function render() {
  if (state.phase === "setup") return renderLanding();
  if (state.phase === "draft" || state.phase === "bench") return renderDraft();
  if (state.phase === "tournament") return renderTournament();
  if (state.phase === "match" || state.phase === "match-result") return renderMatch();
  return renderComplete();
}

window.XIDraft = {
  getState: () => state,
  restoreState(value) {
    if (!isValidState(value)) throw new Error("That cloud save is not valid for this game version.");
    state = { ...value, draftId: value.draftId || createId(), bench: value.bench || [] };
    state.playedSquads ||= [];
    if (!state.tournament && state.match === null && state.phase === "complete" && state.round === formations[state.formation].length &&
        state.bench.length < benchSlots.length) state.phase = "bench";
    if (state.match) {
      state.match.lineup ||= state.squad.map((pick) => ({ ...pick }));
      state.match.substitutions ??= 0;
      state.match.usedSubstitutes ||= [];
      state.match.substitutedOut ||= [];
    }
    if (state.tournament) {
      state.tournament.playerStats ||= [];
      const signature = squadSignature(state.squad, state.formation);
      if (!state.playedSquads.includes(signature)) state.playedSquads.push(signature);
    }
    saveState();
    render();
  },
  clearLocalSave() {
    localStorage.removeItem(STORAGE_KEY);
    state = initialState();
    render();
  },
  getPlayer: (playerId) => players.find((player) => player.id === playerId) || null,
};

render();
