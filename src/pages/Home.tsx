import { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { seedDatabase } from '../seedData';
import type { DraftPick, Punishment, LeagueInfo, Standing } from '../types';
import '../styles/Home.css';

const AVAILABLE_YEARS = ['2025', '2024', '2023', '2022', '2021'];

const getOrdinalSuffix = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

export const Home = () => {
  const { user, member, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });
  const [selectedYear, setSelectedYear] = useState(AVAILABLE_YEARS[0]);
  const [activeTab, setActiveTab] = useState<'home' | 'punishments' | 'standings'>('home');

  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);
  const [draftOrder, setDraftOrder] = useState<DraftPick[]>([]);
  const [allPunishments, setAllPunishments] = useState<Punishment[]>([]);
  const [allStandings, setAllStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [newDraftMember, setNewDraftMember] = useState('');
  const [newPunishment, setNewPunishment] = useState({ title: '', description: '', assignedTo: '' });
  const [editingPunishmentId, setEditingPunishmentId] = useState<string | null>(null);
  const [editPunishmentForm, setEditPunishmentForm] = useState({ title: '', description: '', assignedTo: '', year: '', completed: false });

  
  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Fetch data once on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch league info
        try {
          const leagueSnap = await getDocs(collection(db, 'league'));
          if (!leagueSnap.empty) {
            setLeagueInfo(leagueSnap.docs[0].data() as LeagueInfo);
          }
        } catch (e) {
          console.log('No league data yet');
        }

        // Fetch all draft picks (filter client-side to avoid index requirement)
        try {
          const draftSnap = await getDocs(collection(db, 'draftOrder'));
          const allPicks = draftSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DraftPick));
          setDraftOrder(allPicks);
        } catch (e) {
          console.log('No draft data yet');
        }

        // Fetch all punishments
        try {
          const punishSnap = await getDocs(collection(db, 'punishments'));
          setAllPunishments(punishSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Punishment)));
        } catch (e) {
          console.log('No punishment data yet');
        }

        // Fetch all standings
        try {
          const standingsSnap = await getDocs(collection(db, 'standings'));
          setAllStandings(standingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Standing)));
        } catch (e) {
          console.log('No standings data yet');
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleSeedDatabase = async () => {
    if (!confirm('This will import data from the old website. Continue?')) return;
    setSeeding(true);
    try {
      await seedDatabase();
      alert('Data imported! Refreshing...');
      window.location.reload();
    } catch (err) {
      console.error('Error seeding:', err);
      alert('Failed to import data. Check console for errors.');
    } finally {
      setSeeding(false);
    }
  };

  // Draft order editing functions
  const addMemberToDraft = async () => {
    if (!newDraftMember.trim()) return;
    const currentYearPicks = draftOrder.filter(p => p.year === selectedYear);
    const newPosition = currentYearPicks.length + 1;
    const pickId = `pick-${selectedYear}-${newPosition}-${Date.now()}`;
    const newPick: DraftPick = {
      id: pickId,
      position: newPosition,
      memberId: newDraftMember.toLowerCase().replace(/\s+/g, '-'),
      memberName: newDraftMember.trim(),
      year: selectedYear
    };
    try {
      await setDoc(doc(db, 'draftOrder', pickId), newPick);
      setDraftOrder([...draftOrder, newPick]);
      setNewDraftMember('');
    } catch (err) {
      console.error('Error adding to draft:', err);
    }
  };

  const removeDraftPick = async (pickId: string) => {
    try {
      await deleteDoc(doc(db, 'draftOrder', pickId));
      const remaining = draftOrder.filter(p => p.id !== pickId);
      const thisYearPicks = remaining.filter(p => p.year === selectedYear).sort((a, b) => a.position - b.position);
      const renumbered = thisYearPicks.map((pick, idx) => ({ ...pick, position: idx + 1 }));
      for (const pick of renumbered) {
        await setDoc(doc(db, 'draftOrder', pick.id), pick);
      }
      const otherYearPicks = remaining.filter(p => p.year !== selectedYear);
      setDraftOrder([...otherYearPicks, ...renumbered]);
    } catch (err) {
      console.error('Error removing pick:', err);
    }
  };

  const moveDraftPick = async (pickId: string, direction: 'up' | 'down') => {
    const currentOrder = draftOrder.filter(p => p.year === selectedYear).sort((a, b) => a.position - b.position);
    const idx = currentOrder.findIndex(p => p.id === pickId);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === currentOrder.length - 1)) return;
    const newOrder = [...currentOrder];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    const renumbered = newOrder.map((pick, i) => ({ ...pick, position: i + 1 }));
    try {
      for (const pick of renumbered) {
        await setDoc(doc(db, 'draftOrder', pick.id), pick);
      }
      const otherYearPicks = draftOrder.filter(p => p.year !== selectedYear);
      setDraftOrder([...otherYearPicks, ...renumbered]);
    } catch (err) {
      console.error('Error moving pick:', err);
    }
  };

  // Punishment editing functions
  const addPunishment = async () => {
    if (!newPunishment.title) return;
    const punishment: Omit<Punishment, 'id'> = {
      title: newPunishment.title,
      description: newPunishment.description,
      assignedTo: newPunishment.assignedTo || undefined,
      assignedToName: newPunishment.assignedTo || undefined,
      completed: false,
      year: 'future'
    };
    try {
      const docRef = doc(collection(db, 'punishments'));
      await setDoc(docRef, punishment);
      setAllPunishments([...allPunishments, { id: docRef.id, ...punishment }]);
      setNewPunishment({ title: '', description: '', assignedTo: '' });
    } catch (err) {
      console.error('Error adding punishment:', err);
    }
  };

  const deletePunishment = async (id: string) => {
    if (!confirm('Delete this punishment?')) return;
    try {
      await deleteDoc(doc(db, 'punishments', id));
      setAllPunishments(allPunishments.filter(p => p.id !== id));
    } catch (err) {
      console.error('Error deleting punishment:', err);
    }
  };

  const startEditPunishment = (punishment: Punishment) => {
    setEditingPunishmentId(punishment.id);
    setEditPunishmentForm({
      title: punishment.title,
      description: punishment.description,
      assignedTo: punishment.assignedToName || '',
      year: punishment.year,
      completed: punishment.completed
    });
  };

  const saveEditPunishment = async (punishment: Punishment) => {
    try {
      const assignedValue = editPunishmentForm.assignedTo.trim();

      // Build the document data for Firestore
      const firestoreData: Record<string, any> = {
        title: editPunishmentForm.title,
        description: editPunishmentForm.description,
        year: editPunishmentForm.year,
        completed: editPunishmentForm.completed,
        assignedTo: assignedValue || deleteField(),
        assignedToName: assignedValue || deleteField()
      };

      await setDoc(doc(db, 'punishments', punishment.id), firestoreData, { merge: true });

      // Update local state
      const updated: Punishment = {
        id: punishment.id,
        title: editPunishmentForm.title,
        description: editPunishmentForm.description,
        year: editPunishmentForm.year,
        completed: editPunishmentForm.completed,
        assignedTo: assignedValue || undefined,
        assignedToName: assignedValue || undefined
      };
      setAllPunishments(allPunishments.map(p => p.id === punishment.id ? updated : p));
      setEditingPunishmentId(null);
    } catch (err) {
      console.error('Error updating punishment:', err);
    }
  };

  const isEmpty = draftOrder.length === 0 && allPunishments.length === 0;

  // Filter draft order by selected year and sort by position
  const filteredDraftOrder = draftOrder
    .filter(pick => pick.year === selectedYear)
    .sort((a, b) => a.position - b.position);

  const userDraftPick = filteredDraftOrder.find(pick => pick.memberId === member?.id);

  // Separate punishments with assigned years from future (unassigned) ones
  const assignedPunishments = allPunishments.filter(p => p.year && p.year !== 'future');
  const futurePunishments = allPunishments.filter(p => !p.year || p.year === 'future');

  // Group assigned punishments by year (should be one per year)
  const punishmentsByYear = assignedPunishments.reduce((acc, p) => {
    if (!acc[p.year]) acc[p.year] = [];
    acc[p.year].push(p);
    return acc;
  }, {} as Record<string, Punishment[]>);

  const sortedYears = Object.keys(punishmentsByYear).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="home">
      <header className="header">
        <div className="header-top">
          <h1>Washed Up - Fantasy Football</h1>
          <div className="header-right">
            {user && <span className="user-name">{member?.name}</span>}
            {isAdmin && (
              <>
                <button
                  className={`header-btn edit-toggle ${editMode ? 'active' : ''}`}
                  onClick={() => setEditMode(!editMode)}
                >
                  {editMode ? 'Done' : 'Edit'}
                </button>
                <button className="header-btn admin" onClick={() => navigate('/admin')}>
                  Admin
                </button>
              </>
            )}
            {user && (
              <button className="header-btn" onClick={logout}>
                Logout
              </button>
            )}
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
              {theme === 'light' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {isEmpty && isAdmin && (
        <div className="seed-banner">
          <h3>Welcome! Your database is empty.</h3>
          <p>Click below to import data from the old website.</p>
          <button onClick={handleSeedDatabase} disabled={seeding} className="seed-btn">
            {seeding ? 'Importing...' : 'Import Data'}
          </button>
        </div>
      )}

      <nav className="tabs">
        <button
          className={activeTab === 'home' ? 'active' : ''}
          onClick={() => setActiveTab('home')}
        >
          Home
        </button>
        <button
          className={activeTab === 'standings' ? 'active' : ''}
          onClick={() => setActiveTab('standings')}
        >
          Standings
        </button>
        <button
          className={activeTab === 'punishments' ? 'active' : ''}
          onClick={() => setActiveTab('punishments')}
        >
          Punishments
        </button>
      </nav>

      <main className="content">
        {activeTab === 'home' && (
          <>
            <div className="year-selector">
              <select
                className="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {AVAILABLE_YEARS.map(year => (
                  <option key={year} value={year}>{year} Season</option>
                ))}
              </select>
            </div>

            <div className="welcome-section">
              <h2>Welcome to Washed Up Fantasy Football</h2>
              <p>{selectedYear} Season</p>
            </div>

            {(leagueInfo?.draftDate || (user && userDraftPick)) && (
              <div className="card draft-info">
                <h3>📅 Draft Day</h3>
                {leagueInfo?.draftDate && (
                  <div className="draft-datetime">
                    {leagueInfo.draftDate}
                    {leagueInfo.draftTime && ` @ ${leagueInfo.draftTime}`}
                  </div>
                )}
                {user && userDraftPick && (
                  <div className="your-pick">
                    <div className="your-pick-label">Your Draft Pick</div>
                    <div className="your-pick-number">
                      {userDraftPick.position}
                      <span className="pick-suffix">{getOrdinalSuffix(userDraftPick.position)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <h3>📋 Draft Order</h3>
              {filteredDraftOrder.length === 0 && !editMode ? (
                <p className="empty">Draft order not set yet for {selectedYear}</p>
              ) : (
                <ol className="draft-list">
                  {filteredDraftOrder.map((pick) => (
                    <li
                      key={pick.id}
                      className={`draft-item ${pick.memberId === member?.id ? 'is-you' : ''} ${editMode ? 'edit-mode' : ''}`}
                    >
                      {editMode && (
                        <div className="edit-actions">
                          <button
                            className="move-btn"
                            onClick={() => moveDraftPick(pick.id, 'up')}
                            disabled={pick.position === 1}
                          >
                            ↑
                          </button>
                          <button
                            className="move-btn"
                            onClick={() => moveDraftPick(pick.id, 'down')}
                            disabled={pick.position === filteredDraftOrder.length}
                          >
                            ↓
                          </button>
                        </div>
                      )}
                      <span className="position">{pick.position}</span>
                      <span className="name">{pick.memberName}</span>
                      {pick.memberId === member?.id && !editMode && (
                        <span className="you-badge">You</span>
                      )}
                      {editMode && (
                        <button className="delete-btn" onClick={() => removeDraftPick(pick.id)}>×</button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {editMode && (
                <div className="add-draft-form">
                  <input
                    type="text"
                    placeholder="Add member name"
                    value={newDraftMember}
                    onChange={(e) => setNewDraftMember(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addMemberToDraft()}
                  />
                  <button onClick={addMemberToDraft}>Add</button>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'standings' && (
          <>
            <div className="year-selector">
              <select
                className="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {AVAILABLE_YEARS.map(year => (
                  <option key={year} value={year}>{year} Season</option>
                ))}
              </select>
            </div>

            <div className="card">
              <h3>Leaderboard</h3>
              {(() => {
                const yearStandings = allStandings
                  .filter(s => s.year === selectedYear)
                  .sort((a, b) => a.position - b.position);

                if (yearStandings.length === 0) {
                  return <p className="empty">No standings available for {selectedYear}</p>;
                }

                return (
                  <ol className="standings-list">
                    {yearStandings.map((standing) => (
                      <li
                        key={standing.id}
                        className={`standing-item ${standing.position === 1 ? 'champion' : ''} ${standing.position === 2 ? 'silver' : ''} ${standing.position === 3 ? 'bronze' : ''} ${standing.position === yearStandings.length ? 'last-place' : ''}`}
                      >
                        <span className="position">{standing.position}</span>
                        <div className="standing-team">
                          <span className="standing-team-name">{standing.teamName}</span>
                        </div>
                        <span className="standing-record">
                          {standing.wins}-{standing.losses}-{standing.ties}
                        </span>
                        {standing.pointsFor && (
                          <span className="standing-points">{standing.pointsFor} pts</span>
                        )}
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </div>
          </>
        )}

        {activeTab === 'punishments' && (
          <>
            {editMode && (
              <div className="card add-punishment-card">
                <h3>Add Future Punishment</h3>
                <input
                  type="text"
                  placeholder="Title"
                  value={newPunishment.title}
                  onChange={(e) => setNewPunishment({ ...newPunishment, title: e.target.value })}
                />
                <textarea
                  placeholder="Description"
                  value={newPunishment.description}
                  onChange={(e) => setNewPunishment({ ...newPunishment, description: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Assigned to"
                  value={newPunishment.assignedTo}
                  onChange={(e) => setNewPunishment({ ...newPunishment, assignedTo: e.target.value })}
                />
                <button onClick={addPunishment} className="add-btn">Add Punishment</button>
              </div>
            )}
            {allPunishments.length === 0 && !editMode ? (
              <p className="empty">No punishments yet</p>
            ) : (
              <>
                {/* Assigned punishments by year */}
                {sortedYears.map(year => (
                  <div key={year} className="punishment-year-group">
                    <h3>{year} Season</h3>
                    <div className="punishment-list">
                      {punishmentsByYear[year].map(p => (
                        <div key={p.id} className={`punishment-item ${p.completed ? 'completed' : ''}`}>
                          {editMode && editingPunishmentId === p.id ? (
                            <div className="punishment-edit-form">
                              <input
                                type="text"
                                value={editPunishmentForm.title}
                                onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, title: e.target.value })}
                                placeholder="Title"
                              />
                              <textarea
                                value={editPunishmentForm.description}
                                onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, description: e.target.value })}
                                placeholder="Description"
                              />
                              <input
                                type="text"
                                value={editPunishmentForm.assignedTo}
                                onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, assignedTo: e.target.value })}
                                placeholder="Assigned to"
                              />
                              <select
                                value={editPunishmentForm.year}
                                onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, year: e.target.value })}
                                className="year-select"
                              >
                                <option value="future">Future (unassigned)</option>
                                {AVAILABLE_YEARS.map(y => (
                                  <option key={y} value={y}>{y} Season</option>
                                ))}
                              </select>
                              <label className="completed-toggle">
                                <input
                                  type="checkbox"
                                  checked={editPunishmentForm.completed}
                                  onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, completed: e.target.checked })}
                                />
                                Completed
                              </label>
                              <div className="edit-form-actions">
                                <button type="button" onClick={() => saveEditPunishment(p)} className="save-btn">Save</button>
                                <button type="button" onClick={() => setEditingPunishmentId(null)} className="cancel-btn">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="punishment-left">
                                <span className="punishment-title">{p.title}</span>
                                {p.completed && <span className="punishment-badge">Completed</span>}
                                {p.assignedToName && (
                                  <span className="punishment-assigned">{p.assignedToName}</span>
                                )}
                                {editMode && (
                                  <div className="punishment-actions">
                                    <button onClick={() => startEditPunishment(p)} className="edit-btn">Edit</button>
                                    <button onClick={() => deletePunishment(p.id)} className="delete-btn">Delete</button>
                                  </div>
                                )}
                              </div>
                              <div className="punishment-right">
                                <p className="punishment-desc">{p.description || 'No description'}</p>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Future Punishments */}
                {futurePunishments.length > 0 && (
                  <div className="punishment-year-group">
                    <h3>Future Punishments</h3>
                    <div className="punishment-list">
                      {futurePunishments.map(p => (
                        <div key={p.id} className="punishment-item">
                          {editMode && editingPunishmentId === p.id ? (
                            <div className="punishment-edit-form">
                              <input
                                type="text"
                                value={editPunishmentForm.title}
                                onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, title: e.target.value })}
                                placeholder="Title"
                              />
                              <textarea
                                value={editPunishmentForm.description}
                                onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, description: e.target.value })}
                                placeholder="Description"
                              />
                              <input
                                type="text"
                                value={editPunishmentForm.assignedTo}
                                onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, assignedTo: e.target.value })}
                                placeholder="Assigned to"
                              />
                              <select
                                value={editPunishmentForm.year}
                                onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, year: e.target.value })}
                                className="year-select"
                              >
                                <option value="future">Future (unassigned)</option>
                                {AVAILABLE_YEARS.map(y => (
                                  <option key={y} value={y}>{y} Season</option>
                                ))}
                              </select>
                              <label className="completed-toggle">
                                <input
                                  type="checkbox"
                                  checked={editPunishmentForm.completed}
                                  onChange={(e) => setEditPunishmentForm({ ...editPunishmentForm, completed: e.target.checked })}
                                />
                                Completed
                              </label>
                              <div className="edit-form-actions">
                                <button type="button" onClick={() => saveEditPunishment(p)} className="save-btn">Save</button>
                                <button type="button" onClick={() => setEditingPunishmentId(null)} className="cancel-btn">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="punishment-left">
                                <span className="punishment-title">{p.title}</span>
                                {p.assignedToName && (
                                  <span className="punishment-assigned">{p.assignedToName}</span>
                                )}
                                {editMode && (
                                  <div className="punishment-actions">
                                    <button onClick={() => startEditPunishment(p)} className="edit-btn">Edit</button>
                                    <button onClick={() => deletePunishment(p.id)} className="delete-btn">Delete</button>
                                  </div>
                                )}
                              </div>
                              <div className="punishment-right">
                                <p className="punishment-desc">{p.description || 'No description'}</p>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};
