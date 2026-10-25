import { useEffect, useState } from 'react';
import { getLeagueStats } from '../sleeper';
import type { LeagueStats, Record3 } from '../sleeper';
import type { Standing } from '../types';
import '../styles/Stats.css';

// Hand-entered Firestore standings from before the league moved to Sleeper,
// mapped team name -> manager. Later seasons come from Sleeper instead.
const PRE_SLEEPER_TEAM_OWNERS: Record<string, Record<string, string>> = {
  '2022': {
    'Team Slye': 'Slye',
    'Diet Caulk': 'Finnboi',
    'Connecticut DuckLords': 'Bloq',
    'Team Goose': 'Goose',
    "Jub's Big Boys": 'Jub',
    'Bru 32': 'Bruno',
    'Penguin Pizza': 'Rich',
    'Team Plourde': 'Plourde',
    'TaylorGang (Konark Patel)': 'Konark Patel',
    "Owner Of Finn's Dome": 'Simmons',
    'The Patel Cartel': 'Patel Cartel',
    'Team Day': 'Day',
  },
  '2023': {
    'Bru 32': 'Bruno',
    'Penguin Pizza': 'Rich',
    'Bridal Blitzkrieg': 'Bloq',
    'Team Day': 'Day',
    'Gluebobaroonie': 'Goose',
    'CaterKillers': 'Caleb',
    'ragglehans': 'Noah',
    "Jub's injured men": 'Jub',
    'Zynbabwe Pouching Club': 'Finnboi',
    "Owner Of Finn's Dome": 'Simmons',
    'Team Plourde': 'Plourde',
    'The Terrance Bates Foundation': 'Chuck',
    'Jerkin Goff': 'BYung',
    'Team Slye': 'Slye',
  },
};

interface AllTimeRow extends Record3 {
  name: string;
  seasons: number;
  former: boolean;
}

const winPct = (r: Record3) => {
  const total = r.wins + r.losses + r.ties;
  return total ? (r.wins + r.ties / 2) / total : 0;
};

const computeAllTime = (stats: LeagueStats, standings: Standing[]): AllTimeRow[] => {
  const rows = new Map<string, AllTimeRow>();
  const add = (name: string, r: Record3) => {
    const row = rows.get(name) ?? { name, wins: 0, losses: 0, ties: 0, seasons: 0, former: false };
    row.wins += r.wins;
    row.losses += r.losses;
    row.ties += r.ties;
    row.seasons++;
    rows.set(name, row);
  };

  for (const s of standings) {
    const owners = PRE_SLEEPER_TEAM_OWNERS[s.year];
    if (!owners) continue;
    const teamName = s.teamName.trim();
    add(owners[teamName] ?? teamName, { wins: s.wins ?? 0, losses: s.losses ?? 0, ties: s.ties ?? 0 });
  }

  for (const season of stats.seasonStandings) {
    for (const row of season.standings) add(stats.managerNames[row.managerId] ?? 'Unknown', row);
  }

  // Anyone without a roster in the current Sleeper season has left the league
  const current = new Set(stats.standings.map(row => stats.managerNames[row.managerId]));
  for (const row of rows.values()) row.former = !current.has(row.name);

  return [...rows.values()].sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins);
};

export const AllTimeStandings = ({ standings }: { standings: Standing[] }) => {
  const [stats, setStats] = useState<LeagueStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getLeagueStats()
      .then(result => { if (!cancelled) setStats(result); })
      .catch(err => {
        console.error('Error loading Sleeper standings:', err);
        if (!cancelled) setError('Could not load standings from Sleeper. Check your connection and try again.');
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = () => {
    setError(null);
    setAttempt(a => a + 1);
  };

  if (error) {
    return (
      <div className="stats-error">
        <p>{error}</p>
        <button className="stats-retry" onClick={retry}>Try again</button>
      </div>
    );
  }

  if (!stats) {
    return <p className="empty">Loading standings from Sleeper...</p>;
  }

  const rows = computeAllTime(stats, standings);
  const firstSeason = Object.keys(PRE_SLEEPER_TEAM_OWNERS).sort()[0] ?? stats.firstSeason;

  return (
    <>
      <p className="stats-note">
        Regular-season records, {firstSeason}–{stats.currentSeason} (includes {stats.currentSeason} to date)
      </p>
      <div className="stats-table-wrap pinned-wrap">
        <table className="stats-table pinned-table">
          <thead>
            <tr>
              <th className="left sticky-col">Manager</th>
              <th>W-L-T</th>
              <th>Win %</th>
              <th>Seasons</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.name} className={row.former ? 'former' : ''}>
                <th className="left sticky-col">
                  <span className="rank">{i + 1}</span>
                  {row.name}
                  {row.former && <span className="former-badge">former</span>}
                </th>
                <td>{row.wins}-{row.losses}-{row.ties}</td>
                <td>{winPct(row).toFixed(3).replace(/^0/, '')}</td>
                <td>{row.seasons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};
