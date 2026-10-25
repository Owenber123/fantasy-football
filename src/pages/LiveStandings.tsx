import { useEffect, useState } from 'react';
import { getLeagueStats } from '../sleeper';
import type { LeagueStats } from '../sleeper';
import '../styles/Stats.css';

const formatPoints = (n: number) => n.toFixed(2);

export const LiveStandings = () => {
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

  const name = (id: string) => stats.managerNames[id] ?? 'Unknown';

  return (
    <>
      <p className="stats-note">Live from Sleeper, through week {stats.lastScoredWeek}</p>
      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="left">Manager</th>
              <th>W-L-T</th>
              <th>PF</th>
              <th>PA</th>
            </tr>
          </thead>
          <tbody>
            {stats.standings.map((row, i) => (
              <tr key={row.managerId}>
                <td>{i + 1}</td>
                <td className="left strong">{name(row.managerId)}</td>
                <td>{row.wins}-{row.losses}-{row.ties}</td>
                <td>{formatPoints(row.pointsFor)}</td>
                <td>{formatPoints(row.pointsAgainst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};
