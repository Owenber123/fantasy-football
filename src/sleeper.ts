// Live league stats from the public Sleeper API (no key needed).
// Data is fetched in the browser on demand and kept in memory only.

const SLEEPER_API = 'https://api.sleeper.app/v1';

// Current season's league; older seasons are found by walking previous_league_id.
export const CURRENT_LEAGUE_ID = '1389694421427036160';
export const CURRENT_SEASON = '2026';

// Sleeper display name -> league nickname
export const MANAGER_NICKNAMES: Record<string, string> = {
  nomah98: 'Noah',
  thebigap: 'Plourde',
  nickelia: 'Elia',
  TKoop2: 'Tanner',
  charliemalone: 'Chuck',
  bloqus: 'Bloq',
  Ryanmd211: 'Day',
  bru32: 'Bruno',
  JubbysGiants: 'Jub',
  LeNimmonz: 'Simmons',
  barryyung: 'BYung',
  finnmaloney96: 'Finnboi',
};

interface SleeperLeague {
  league_id: string;
  season: string;
  status: string;
  previous_league_id: string | null;
  settings: {
    playoff_week_start: number;
    last_scored_leg?: number;
  };
}

interface SleeperUser {
  user_id: string;
  display_name: string;
}

interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
  };
}

interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
}

interface SleeperBracketMatch {
  m: number;
  r: number;
  p?: number;
  t1: number | null;
  t2: number | null;
  w: number | null;
  l: number | null;
}

export interface Game {
  season: string;
  week: number;
  playoffs: boolean;
  homeId: string;
  homePoints: number;
  awayId: string;
  awayPoints: number;
}

export interface StandingRow {
  managerId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface ScoreRecord {
  managerId: string;
  points: number;
  season: string;
  week: number;
}

export interface GameRecord {
  game: Game;
  margin: number;
}

export interface StreakRecord {
  managerId: string;
  length: number;
  season: string;
  startWeek: number;
  endWeek: number;
}

export interface AllPlayRow {
  managerId: string;
  allPlay: Record3;
  actual: Record3;
}

export interface Record3 {
  wins: number;
  losses: number;
  ties: number;
}

export interface SeasonResult {
  season: string;
  championId: string | null;
  runnerUpId: string | null;
  lastPlaceId: string | null;
  complete: boolean;
}

export interface LeagueStats {
  currentSeason: string;
  lastScoredWeek: number;
  firstSeason: string;
  managerNames: Record<string, string>;
  standings: StandingRow[];
  // Regular-season standings for every Sleeper season, newest first
  seasonStandings: { season: string; standings: StandingRow[] }[];
  records: {
    highScore: ScoreRecord | null;
    lowScore: ScoreRecord | null;
    biggestBlowout: GameRecord | null;
    closestGame: GameRecord | null;
    longestWinStreak: StreakRecord | null;
    longestLossStreak: StreakRecord | null;
  };
  allPlay: AllPlayRow[];
  headToHead: {
    managerIds: string[];
    records: Record<string, Record<string, Record3>>;
  };
  seasonResults: SeasonResult[];
}

interface SeasonData {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  rosterOwner: Map<number, string>;
  games: Game[];
  winnersBracket: SleeperBracketMatch[];
  losersBracket: SleeperBracketMatch[];
}

const fetchJson = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`${SLEEPER_API}${path}`);
  if (!res.ok) throw new Error(`Sleeper request failed (${res.status}): ${path}`);
  return res.json() as Promise<T>;
};

const withDecimal = (whole = 0, decimal = 0) => whole + decimal / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;
const emptyRecord = (): Record3 => ({ wins: 0, losses: 0, ties: 0 });

const addResult = (record: Record3, mine: number, theirs: number) => {
  if (mine > theirs) record.wins++;
  else if (mine < theirs) record.losses++;
  else record.ties++;
};

const fetchSeason = async (leagueId: string, managerNames: Record<string, string>): Promise<SeasonData> => {
  const [league, users, rosters, winnersBracket, losersBracket] = await Promise.all([
    fetchJson<SleeperLeague>(`/league/${leagueId}`),
    fetchJson<SleeperUser[]>(`/league/${leagueId}/users`),
    fetchJson<SleeperRoster[]>(`/league/${leagueId}/rosters`),
    fetchJson<SleeperBracketMatch[] | null>(`/league/${leagueId}/winners_bracket`),
    fetchJson<SleeperBracketMatch[] | null>(`/league/${leagueId}/losers_bracket`),
  ]);

  for (const user of users) {
    if (!managerNames[user.user_id]) {
      managerNames[user.user_id] = MANAGER_NICKNAMES[user.display_name] ?? user.display_name;
    }
  }

  // Managers are identified by Sleeper user id so they line up across seasons
  const rosterOwner = new Map<number, string>();
  for (const roster of rosters) {
    const ownerId = roster.owner_id ?? `roster-${roster.roster_id}`;
    rosterOwner.set(roster.roster_id, ownerId);
    if (!managerNames[ownerId]) managerNames[ownerId] = `Team ${roster.roster_id}`;
  }

  // Only weeks Sleeper has finished scoring; unplayed weeks of the current season are skipped
  const lastScoredWeek = league.settings.last_scored_leg ?? 0;
  const weeks = Array.from({ length: lastScoredWeek }, (_, i) => i + 1);
  const weeklyMatchups = await Promise.all(
    weeks.map(week => fetchJson<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`))
  );

  const games: Game[] = [];
  weeklyMatchups.forEach((matchups, i) => {
    const week = weeks[i];
    const byMatchup = new Map<number, SleeperMatchup[]>();
    for (const m of matchups) {
      // matchup_id is null for bye weeks and teams eliminated from the playoffs
      if (m.matchup_id == null) continue;
      byMatchup.set(m.matchup_id, [...(byMatchup.get(m.matchup_id) ?? []), m]);
    }
    for (const [home, away] of byMatchup.values()) {
      if (!home || !away) continue;
      const homePoints = home.points ?? 0;
      const awayPoints = away.points ?? 0;
      if (homePoints === 0 && awayPoints === 0) continue;
      games.push({
        season: league.season,
        week,
        playoffs: week >= league.settings.playoff_week_start,
        homeId: rosterOwner.get(home.roster_id)!,
        homePoints,
        awayId: rosterOwner.get(away.roster_id)!,
        awayPoints,
      });
    }
  });

  return {
    league,
    rosters,
    rosterOwner,
    games,
    winnersBracket: winnersBracket ?? [],
    losersBracket: losersBracket ?? [],
  };
};

const computeStandings = (season: SeasonData): StandingRow[] =>
  season.rosters
    .map(roster => ({
      managerId: season.rosterOwner.get(roster.roster_id)!,
      wins: roster.settings.wins,
      losses: roster.settings.losses,
      ties: roster.settings.ties,
      pointsFor: withDecimal(roster.settings.fpts, roster.settings.fpts_decimal),
      pointsAgainst: withDecimal(roster.settings.fpts_against, roster.settings.fpts_against_decimal),
    }))
    // Same order as Sleeper: record first, then points for
    .sort((a, b) => (b.wins + b.ties / 2) - (a.wins + a.ties / 2) || b.pointsFor - a.pointsFor);

const computeStreaks = (seasons: SeasonData[]): Pick<LeagueStats['records'], 'longestWinStreak' | 'longestLossStreak'> => {
  let longestWinStreak: StreakRecord | null = null;
  let longestLossStreak: StreakRecord | null = null;

  // Streaks are counted within a single regular season; a tie ends a streak
  for (const season of seasons) {
    const results = new Map<string, { week: number; result: 'W' | 'L' | 'T' }[]>();
    for (const game of season.games) {
      if (game.playoffs) continue;
      const push = (id: string, mine: number, theirs: number) => {
        const result = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
        results.set(id, [...(results.get(id) ?? []), { week: game.week, result }]);
      };
      push(game.homeId, game.homePoints, game.awayPoints);
      push(game.awayId, game.awayPoints, game.homePoints);
    }

    for (const [managerId, list] of results) {
      list.sort((a, b) => a.week - b.week);
      let run = 0;
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        run = i > 0 && list[i - 1].result === entry.result ? run + 1 : 1;
        const streak: StreakRecord = {
          managerId,
          length: run,
          season: season.league.season,
          startWeek: list[i - run + 1].week,
          endWeek: entry.week,
        };
        if (entry.result === 'W' && run > (longestWinStreak?.length ?? 0)) longestWinStreak = streak;
        if (entry.result === 'L' && run > (longestLossStreak?.length ?? 0)) longestLossStreak = streak;
      }
    }
  }

  return { longestWinStreak, longestLossStreak };
};

const computeAllPlay = (season: SeasonData): AllPlayRow[] => {
  const rows = new Map<string, AllPlayRow>();
  const row = (managerId: string) => {
    if (!rows.has(managerId)) rows.set(managerId, { managerId, allPlay: emptyRecord(), actual: emptyRecord() });
    return rows.get(managerId)!;
  };

  const scoresByWeek = new Map<number, { managerId: string; points: number }[]>();
  for (const game of season.games) {
    if (game.playoffs) continue;
    addResult(row(game.homeId).actual, game.homePoints, game.awayPoints);
    addResult(row(game.awayId).actual, game.awayPoints, game.homePoints);
    scoresByWeek.set(game.week, [
      ...(scoresByWeek.get(game.week) ?? []),
      { managerId: game.homeId, points: game.homePoints },
      { managerId: game.awayId, points: game.awayPoints },
    ]);
  }

  for (const scores of scoresByWeek.values()) {
    for (const me of scores) {
      for (const other of scores) {
        if (other.managerId !== me.managerId) addResult(row(me.managerId).allPlay, me.points, other.points);
      }
    }
  }

  const pct = (r: Record3) => {
    const total = r.wins + r.losses + r.ties;
    return total ? (r.wins + r.ties / 2) / total : 0;
  };
  return [...rows.values()].sort((a, b) => pct(b.allPlay) - pct(a.allPlay));
};

const computeSeasonResult = (season: SeasonData): SeasonResult => {
  const final = season.winnersBracket.find(m => m.p === 1);
  // In this league's losers bracket (toilet bowl) the team that LOSES advances,
  // so the "winner" of the losers bracket's p=1 match is last place.
  const toiletBowl = season.losersBracket.find(m => m.p === 1);
  const complete = season.league.status === 'complete' && final?.w != null;
  const owner = (rosterId: number | null | undefined) =>
    complete && rosterId != null ? season.rosterOwner.get(rosterId) ?? null : null;

  return {
    season: season.league.season,
    championId: owner(final?.w),
    runnerUpId: owner(final?.l),
    lastPlaceId: owner(toiletBowl?.w),
    complete,
  };
};

const loadLeagueStats = async (): Promise<LeagueStats> => {
  const managerNames: Record<string, string> = {};
  const seasons: SeasonData[] = [];
  let leagueId: string | null = CURRENT_LEAGUE_ID;
  while (leagueId) {
    const season = await fetchSeason(leagueId, managerNames);
    seasons.push(season);
    leagueId = season.league.previous_league_id;
  }

  const current = seasons[0];
  const allGames = seasons.flatMap(s => s.games);

  const scores: ScoreRecord[] = allGames.flatMap(g => [
    { managerId: g.homeId, points: g.homePoints, season: g.season, week: g.week },
    { managerId: g.awayId, points: g.awayPoints, season: g.season, week: g.week },
  ]);
  const margins: GameRecord[] = allGames.map(game => ({
    game,
    margin: round2(Math.abs(game.homePoints - game.awayPoints)),
  }));
  const pick = <T,>(items: T[], better: (a: T, b: T) => boolean) =>
    items.reduce<T | null>((best, item) => (best === null || better(item, best) ? item : best), null);

  const headToHead: Record<string, Record<string, Record3>> = {};
  const h2h = (a: string, b: string) => {
    headToHead[a] ??= {};
    headToHead[a][b] ??= emptyRecord();
    return headToHead[a][b];
  };
  for (const game of allGames) {
    addResult(h2h(game.homeId, game.awayId), game.homePoints, game.awayPoints);
    addResult(h2h(game.awayId, game.homeId), game.awayPoints, game.homePoints);
  }
  const managerIds = Object.keys(headToHead).sort((a, b) => managerNames[a].localeCompare(managerNames[b]));

  return {
    currentSeason: current.league.season,
    lastScoredWeek: current.league.settings.last_scored_leg ?? 0,
    firstSeason: seasons[seasons.length - 1].league.season,
    managerNames,
    standings: computeStandings(current),
    seasonStandings: seasons.map(s => ({ season: s.league.season, standings: computeStandings(s) })),
    records: {
      highScore: pick(scores, (a, b) => a.points > b.points),
      lowScore: pick(scores, (a, b) => a.points < b.points),
      biggestBlowout: pick(margins, (a, b) => a.margin > b.margin),
      closestGame: pick(margins, (a, b) => a.margin < b.margin),
      ...computeStreaks(seasons),
    },
    allPlay: computeAllPlay(current),
    headToHead: { managerIds, records: headToHead },
    seasonResults: seasons.map(computeSeasonResult),
  };
};

let cachedStats: Promise<LeagueStats> | null = null;

// Fetches once per page load; a failed load is retried on the next call.
export const getLeagueStats = (): Promise<LeagueStats> => {
  if (!cachedStats) {
    cachedStats = loadLeagueStats().catch(err => {
      cachedStats = null;
      throw err;
    });
  }
  return cachedStats;
};
