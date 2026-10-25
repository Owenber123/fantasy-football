import { useEffect, useState } from 'react';
import { getLeagueStats } from '../sleeper';
import type { LeagueStats, Record3 } from '../sleeper';
import '../styles/Stats.css';

const formatPoints = (n: number) => n.toFixed(2);
const formatRecord = (r: Record3) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
const formatPct = (r: Record3) => {
  const total = r.wins + r.losses + r.ties;
  return total ? ((r.wins + r.ties / 2) / total).toFixed(3).replace(/^0/, '') : '-';
};

// Seasons played before the league moved to Sleeper
const PRE_SLEEPER_RESULTS = [
  { season: '2023', champion: 'Bruno', lastPlace: 'Slye', complete: true },
  { season: '2022', champion: 'Slye', lastPlace: 'Day', complete: true },
];

export const Stats = () => {
  const [stats, setStats] = useState<LeagueStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getLeagueStats()
      .then(result => { if (!cancelled) setStats(result); })
      .catch(err => {
        console.error('Error loading Sleeper stats:', err);
        if (!cancelled) setError('Could not load stats from Sleeper. Check your connection and try again.');
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = () => {
    setError(null);
    setAttempt(a => a + 1);
  };

  if (error) {
    return (
      <div className="card stats-error">
        <p>{error}</p>
        <button className="stats-retry" onClick={retry}>Try again</button>
      </div>
    );
  }

  if (!stats) {
    return <p className="empty">Loading stats from Sleeper...</p>;
  }

  const name = (id: string | null) => (id ? stats.managerNames[id] ?? 'Unknown' : 'TBD');
  const { records } = stats;
  const seasonResults = [
    ...stats.seasonResults.map(r => ({
      season: r.season,
      champion: name(r.championId),
      lastPlace: name(r.lastPlaceId),
      complete: r.complete,
    })),
    ...PRE_SLEEPER_RESULTS.filter(r => !stats.seasonResults.some(s => s.season === r.season)),
  ].sort((a, b) => Number(b.season) - Number(a.season));
  const sinceLabel = `${stats.firstSeason}–${stats.currentSeason}`;

  return (
    <>
      <div className="card">
        <h3>🏆 Champions &amp; Last Place</h3>
        <ul className="season-results">
          {seasonResults.map(result => (
            <li key={result.season} className="season-result">
              <span className="season-year">{result.season}</span>
              {result.complete ? (
                <>
                  <span className="season-champ">🥇 {result.champion}</span>
                  <span className="season-last">🚽 {result.lastPlace}</span>
                </>
              ) : (
                <span className="season-tbd">In progress — TBD</span>
              )}
            </li>
          ))}
        </ul>
        <p className="stats-note">Last place is the loser of the toilet bowl final.</p>
      </div>

      <div className="card">
        <h3>📖 Record Book</h3>
        <p className="stats-note">All Sleeper seasons ({sinceLabel}), playoffs included</p>
        <dl className="record-book">
          {records.highScore && (
            <div className="record">
              <dt>Highest score</dt>
              <dd>
                <span className="record-value">{formatPoints(records.highScore.points)}</span>
                {name(records.highScore.managerId)} · {records.highScore.season} wk {records.highScore.week}
              </dd>
            </div>
          )}
          {records.lowScore && (
            <div className="record">
              <dt>Lowest score</dt>
              <dd>
                <span className="record-value">{formatPoints(records.lowScore.points)}</span>
                {name(records.lowScore.managerId)} · {records.lowScore.season} wk {records.lowScore.week}
              </dd>
            </div>
          )}
          {[
            { label: 'Biggest blowout', record: records.biggestBlowout },
            { label: 'Closest game', record: records.closestGame },
          ].map(({ label, record }) => {
            if (!record) return null;
            const { game } = record;
            const homeWon = game.homePoints >= game.awayPoints;
            const [winId, winPts, loseId, losePts] = homeWon
              ? [game.homeId, game.homePoints, game.awayId, game.awayPoints]
              : [game.awayId, game.awayPoints, game.homeId, game.homePoints];
            return (
              <div className="record" key={label}>
                <dt>{label}</dt>
                <dd>
                  <span className="record-value">{formatPoints(record.margin)} pts</span>
                  {name(winId)} {formatPoints(winPts)} – {formatPoints(losePts)} {name(loseId)} · {game.season} wk {game.week}
                </dd>
              </div>
            );
          })}
          {[
            { label: 'Longest win streak', record: records.longestWinStreak },
            { label: 'Longest losing streak', record: records.longestLossStreak },
          ].map(({ label, record }) => record && (
            <div className="record" key={label}>
              <dt>{label}</dt>
              <dd>
                <span className="record-value">{record.length} games</span>
                {name(record.managerId)} · {record.season} wk {record.startWeek}–{record.endWeek}
              </dd>
            </div>
          ))}
        </dl>
        <p className="stats-note">Streaks count regular-season games within one season.</p>
      </div>

      <div className="card">
        <h3>🍀 Luck Standings</h3>
        <p className="stats-note">
          {stats.currentSeason} record if every team played everyone each week (regular season)
        </p>
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">Manager</th>
                <th>All-play</th>
                <th>Pct</th>
                <th>Actual</th>
                <th>Luck</th>
              </tr>
            </thead>
            <tbody>
              {stats.allPlay.map((row, i) => {
                const games = row.actual.wins + row.actual.losses + row.actual.ties;
                const allPlayGames = row.allPlay.wins + row.allPlay.losses + row.allPlay.ties;
                const expectedWins = allPlayGames ? ((row.allPlay.wins + row.allPlay.ties / 2) / allPlayGames) * games : 0;
                const luck = row.actual.wins + row.actual.ties / 2 - expectedWins;
                return (
                  <tr key={row.managerId}>
                    <td>{i + 1}</td>
                    <td className="left strong">{name(row.managerId)}</td>
                    <td>{formatRecord(row.allPlay)}</td>
                    <td>{formatPct(row.allPlay)}</td>
                    <td>{formatRecord(row.actual)}</td>
                    <td className={luck > 0.05 ? 'lucky' : luck < -0.05 ? 'unlucky' : ''}>
                      {luck > 0 ? '+' : ''}{luck.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="stats-note">Luck = actual wins minus wins expected from all-play win %.</p>
      </div>

      <div className="card">
        <h3>⚔️ Head-to-Head</h3>
        <p className="stats-note">All-time record of the row manager vs the column manager ({sinceLabel}, playoffs included)</p>
        <div className="stats-table-wrap h2h-wrap">
          <table className="stats-table h2h-table">
            <thead>
              <tr>
                <th className="left sticky-col">vs</th>
                {stats.headToHead.managerIds.map(id => (
                  <th key={id}>{name(id)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.headToHead.managerIds.map(rowId => (
                <tr key={rowId}>
                  <th className="left sticky-col">{name(rowId)}</th>
                  {stats.headToHead.managerIds.map(colId => {
                    if (rowId === colId) return <td key={colId} className="h2h-self">—</td>;
                    const r = stats.headToHead.records[rowId]?.[colId];
                    if (!r) return <td key={colId} className="h2h-none">0-0</td>;
                    const cls = r.wins > r.losses ? 'lucky' : r.wins < r.losses ? 'unlucky' : '';
                    return <td key={colId} className={cls}>{formatRecord(r)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
