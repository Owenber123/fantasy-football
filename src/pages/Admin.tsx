import { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { seedDatabase } from '../seedData';
import type { DraftPick, Punishment, LeagueInfo, Member, Standing } from '../types';
import '../styles/Admin.css';

const AVAILABLE_YEARS = ['2025', '2024', '2023', '2022', '2021'];

export const Admin = () => {
  const { isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'league' | 'draft' | 'punishments' | 'standings' | 'members'>('league');
  const [selectedYear, setSelectedYear] = useState(AVAILABLE_YEARS[0]);

  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo>({ name: '', season: '', draftDate: '', draftTime: '' });
  const [allDraftPicks, setAllDraftPicks] = useState<DraftPick[]>([]);
  const [punishments, setPunishments] = useState<Punishment[]>([]);
  const [allStandings, setAllStandings] = useState<Standing[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // New standing form
  const [newStanding, setNewStanding] = useState({ teamName: '', wins: '', losses: '', ties: '', pointsFor: '' });

  // New punishment form
  const [newPunishment, setNewPunishment] = useState({ title: '', description: '', assignedTo: '', year: AVAILABLE_YEARS[0] });

  // Edit punishment state
  const [editingPunishmentId, setEditingPunishmentId] = useState<string | null>(null);
  const [editPunishmentForm, setEditPunishmentForm] = useState({ title: '', description: '', assignedTo: '' });

  // New draft member form
  const [newDraftMember, setNewDraftMember] = useState('');

  // Filter draft order by year
  const draftOrder = allDraftPicks
    .filter(pick => pick.year === selectedYear)
    .sort((a, b) => a.position - b.position);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch league info
      try {
        const leagueSnap = await getDocs(collection(db, 'league'));
        if (!leagueSnap.empty) {
          setLeagueInfo(leagueSnap.docs[0].data() as LeagueInfo);
        }
      } catch (e) {
        console.log('No league data');
      }

      // Fetch all draft picks
      try {
        const draftSnap = await getDocs(collection(db, 'draftOrder'));
        setAllDraftPicks(draftSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DraftPick)));
      } catch (e) {
        console.log('No draft data');
      }

      // Fetch punishments
      try {
        const punishSnap = await getDocs(collection(db, 'punishments'));
        setPunishments(punishSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Punishment)));
      } catch (e) {
        console.log('No punishment data');
      }

      // Fetch members
      try {
        const membersSnap = await getDocs(collection(db, 'members'));
        setMembers(membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member)));
      } catch (e) {
        console.log('No member data');
      }

      // Fetch standings
      try {
        const standingsSnap = await getDocs(collection(db, 'standings'));
        setAllStandings(standingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Standing)));
      } catch (e) {
        console.log('No standings data');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDatabase = async () => {
    if (!confirm('This will add sample data to your database. Continue?')) return;
    setSeeding(true);
    try {
      await seedDatabase();
      alert('Database seeded successfully! Refreshing data...');
      await fetchAllData();
    } catch (err) {
      console.error('Error seeding:', err);
      alert('Failed to seed database');
    } finally {
      setSeeding(false);
    }
  };

  const saveLeagueInfo = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'league', 'info'), leagueInfo);
      alert('League info saved!');
    } catch (err) {
      console.error('Error saving:', err);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addMemberToDraft = async (memberName: string) => {
    if (!memberName.trim()) return;

    const newPosition = draftOrder.length + 1;
    const pickId = `pick-${selectedYear}-${newPosition}-${Date.now()}`;
    const newPick: DraftPick = {
      id: pickId,
      position: newPosition,
      memberId: memberName.toLowerCase().replace(/\s+/g, '-'),
      memberName: memberName.trim(),
      year: selectedYear
    };

    try {
      await setDoc(doc(db, 'draftOrder', pickId), newPick);
      setAllDraftPicks([...allDraftPicks, newPick]);
      setNewDraftMember('');
    } catch (err) {
      console.error('Error adding to draft:', err);
    }
  };

  const removeDraftPick = async (pickId: string) => {
    try {
      await deleteDoc(doc(db, 'draftOrder', pickId));
      const remaining = allDraftPicks.filter(p => p.id !== pickId);

      // Re-number positions for this year only
      const thisYearPicks = remaining
        .filter(p => p.year === selectedYear)
        .sort((a, b) => a.position - b.position);

      const renumbered = thisYearPicks.map((pick, idx) => ({ ...pick, position: idx + 1 }));

      for (const pick of renumbered) {
        await setDoc(doc(db, 'draftOrder', pick.id), pick);
      }

      // Update state with renumbered picks
      const otherYearPicks = remaining.filter(p => p.year !== selectedYear);
      setAllDraftPicks([...otherYearPicks, ...renumbered]);
    } catch (err) {
      console.error('Error removing pick:', err);
    }
  };

  const moveDraftPick = async (pickId: string, direction: 'up' | 'down') => {
    const idx = draftOrder.findIndex(p => p.id === pickId);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === draftOrder.length - 1)) return;

    const newOrder = [...draftOrder];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];

    // Update positions
    const renumbered = newOrder.map((pick, i) => ({ ...pick, position: i + 1 }));

    try {
      for (const pick of renumbered) {
        await setDoc(doc(db, 'draftOrder', pick.id), pick);
      }

      // Update state
      const otherYearPicks = allDraftPicks.filter(p => p.year !== selectedYear);
      setAllDraftPicks([...otherYearPicks, ...renumbered]);
    } catch (err) {
      console.error('Error moving pick:', err);
    }
  };

  const addPunishment = async () => {
    if (!newPunishment.title) return;

    const member = members.find(m => m.id === newPunishment.assignedTo);
    const punishment: Omit<Punishment, 'id'> = {
      title: newPunishment.title,
      description: newPunishment.description,
      assignedTo: newPunishment.assignedTo || undefined,
      assignedToName: newPunishment.assignedTo ? (member?.name || newPunishment.assignedTo) : undefined,
      completed: false,
      year: newPunishment.year
    };

    try {
      const docRef = doc(collection(db, 'punishments'));
      await setDoc(docRef, punishment);
      setPunishments([...punishments, { id: docRef.id, ...punishment }]);
      setNewPunishment({ title: '', description: '', assignedTo: '', year: newPunishment.year });
    } catch (err) {
      console.error('Error adding punishment:', err);
    }
  };

  const togglePunishmentComplete = async (punishment: Punishment) => {
    try {
      const updated = { ...punishment, completed: !punishment.completed };
      await setDoc(doc(db, 'punishments', punishment.id), updated);
      setPunishments(punishments.map(p => p.id === punishment.id ? updated : p));
    } catch (err) {
      console.error('Error updating punishment:', err);
    }
  };

  const deletePunishment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this punishment?')) return;
    try {
      await deleteDoc(doc(db, 'punishments', id));
      setPunishments(punishments.filter(p => p.id !== id));
    } catch (err) {
      console.error('Error deleting punishment:', err);
    }
  };

  const startEditPunishment = (punishment: Punishment) => {
    setEditingPunishmentId(punishment.id);
    setEditPunishmentForm({
      title: punishment.title,
      description: punishment.description,
      assignedTo: punishment.assignedToName || ''
    });
  };

  const cancelEditPunishment = () => {
    setEditingPunishmentId(null);
    setEditPunishmentForm({ title: '', description: '', assignedTo: '' });
  };

  const saveEditPunishment = async (punishment: Punishment) => {
    try {
      const updated = {
        ...punishment,
        title: editPunishmentForm.title,
        description: editPunishmentForm.description,
        assignedToName: editPunishmentForm.assignedTo || undefined
      };
      await setDoc(doc(db, 'punishments', punishment.id), updated);
      setPunishments(punishments.map(p => p.id === punishment.id ? updated : p));
      setEditingPunishmentId(null);
      setEditPunishmentForm({ title: '', description: '', assignedTo: '' });
    } catch (err) {
      console.error('Error updating punishment:', err);
    }
  };

  // Standings CRUD
  const standings = allStandings
    .filter(s => s.year === selectedYear)
    .sort((a, b) => a.position - b.position);

  const addStanding = async () => {
    if (!newStanding.teamName.trim()) return;

    const newPosition = standings.length + 1;
    const standingId = `standing-${selectedYear}-${newPosition}-${Date.now()}`;
    const standing: Standing = {
      id: standingId,
      position: newPosition,
      teamName: newStanding.teamName.trim(),
      wins: parseInt(newStanding.wins) || 0,
      losses: parseInt(newStanding.losses) || 0,
      ties: parseInt(newStanding.ties) || 0,
      year: selectedYear,
      ...(newStanding.pointsFor ? { pointsFor: parseInt(newStanding.pointsFor) } : {})
    };

    try {
      await setDoc(doc(db, 'standings', standingId), standing);
      setAllStandings([...allStandings, standing]);
      setNewStanding({ teamName: '', wins: '', losses: '', ties: '', pointsFor: '' });
    } catch (err) {
      console.error('Error adding standing:', err);
    }
  };

  const removeStanding = async (standingId: string) => {
    try {
      await deleteDoc(doc(db, 'standings', standingId));
      const remaining = allStandings.filter(s => s.id !== standingId);

      // Re-number positions for this year only
      const thisYearStandings = remaining
        .filter(s => s.year === selectedYear)
        .sort((a, b) => a.position - b.position);

      const renumbered = thisYearStandings.map((s, idx) => ({ ...s, position: idx + 1 }));

      for (const s of renumbered) {
        await setDoc(doc(db, 'standings', s.id), s);
      }

      const otherYearStandings = remaining.filter(s => s.year !== selectedYear);
      setAllStandings([...otherYearStandings, ...renumbered]);
    } catch (err) {
      console.error('Error removing standing:', err);
    }
  };

  const moveStanding = async (standingId: string, direction: 'up' | 'down') => {
    const idx = standings.findIndex(s => s.id === standingId);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === standings.length - 1)) return;

    const newOrder = [...standings];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];

    const renumbered = newOrder.map((s, i) => ({ ...s, position: i + 1 }));

    try {
      for (const s of renumbered) {
        await setDoc(doc(db, 'standings', s.id), s);
      }

      const otherYearStandings = allStandings.filter(s => s.year !== selectedYear);
      setAllStandings([...otherYearStandings, ...renumbered]);
    } catch (err) {
      console.error('Error moving standing:', err);
    }
  };

  // Group punishments by year for display
  const punishmentsByYear = punishments.reduce((acc, p) => {
    if (!acc[p.year]) acc[p.year] = [];
    acc[p.year].push(p);
    return acc;
  }, {} as Record<string, Punishment[]>);

  const sortedPunishmentYears = Object.keys(punishmentsByYear).sort((a, b) => b.localeCompare(a));

  const isEmpty = allDraftPicks.length === 0 && punishments.length === 0 && !leagueInfo.name;

  if (!isAdmin) {
    return (
      <div className="admin-container">
        <div className="access-denied">
          <h2>Access Denied</h2>
          <p>You don't have admin access.</p>
          <button onClick={() => navigate('/')} className="back-btn">Go back home</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="admin-container">
      <header className="admin-header">
        <h1>Admin Panel</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/')} className="header-btn">Home</button>
          <button onClick={logout} className="header-btn logout">Logout</button>
        </div>
      </header>

      {isEmpty && (
        <div className="seed-banner">
          <p>Your database is empty. Would you like to import the data from the old website?</p>
          <button onClick={handleSeedDatabase} disabled={seeding} className="seed-btn">
            {seeding ? 'Importing...' : 'Import Data'}
          </button>
        </div>
      )}

      <nav className="tabs">
        <button className={activeTab === 'league' ? 'active' : ''} onClick={() => setActiveTab('league')}>League</button>
        <button className={activeTab === 'draft' ? 'active' : ''} onClick={() => setActiveTab('draft')}>Draft</button>
        <button className={activeTab === 'standings' ? 'active' : ''} onClick={() => setActiveTab('standings')}>Standings</button>
        <button className={activeTab === 'punishments' ? 'active' : ''} onClick={() => setActiveTab('punishments')}>Punishments</button>
        <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>Members</button>
      </nav>

      <main className="admin-content">
        {activeTab === 'league' && (
          <section className="admin-section">
            <h2>League Settings</h2>
            <div className="form-group">
              <label>League Name</label>
              <input
                type="text"
                value={leagueInfo.name}
                onChange={(e) => setLeagueInfo({ ...leagueInfo, name: e.target.value })}
                placeholder="Enter league name"
              />
            </div>
            <div className="form-group">
              <label>Season</label>
              <input
                type="text"
                value={leagueInfo.season}
                onChange={(e) => setLeagueInfo({ ...leagueInfo, season: e.target.value })}
                placeholder="e.g., 2025"
              />
            </div>
            <div className="form-group">
              <label>Draft Date</label>
              <input
                type="text"
                value={leagueInfo.draftDate || ''}
                onChange={(e) => setLeagueInfo({ ...leagueInfo, draftDate: e.target.value })}
                placeholder="e.g., September 3rd"
              />
            </div>
            <div className="form-group">
              <label>Draft Time</label>
              <input
                type="text"
                value={leagueInfo.draftTime || ''}
                onChange={(e) => setLeagueInfo({ ...leagueInfo, draftTime: e.target.value })}
                placeholder="e.g., 8:00 PM"
              />
            </div>
            <button onClick={saveLeagueInfo} disabled={saving} className="save-btn">
              {saving ? 'Saving...' : 'Save League Info'}
            </button>

            {!isEmpty && (
              <div className="danger-zone">
                <h3>Data Management</h3>
                <button onClick={handleSeedDatabase} disabled={seeding} className="seed-btn secondary">
                  {seeding ? 'Importing...' : 'Re-import Data from Old Site'}
                </button>
              </div>
            )}
          </section>
        )}

        {activeTab === 'draft' && (
          <section className="admin-section">
            <div className="section-header">
              <h2>Draft Order</h2>
              <select
                className="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {AVAILABLE_YEARS.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {draftOrder.length === 0 ? (
              <p className="empty-state">No draft order set for {selectedYear}</p>
            ) : (
              <div className="draft-order-list">
                {draftOrder.map((pick) => (
                  <div key={pick.id} className="draft-order-item">
                    <span className="position">{pick.position}</span>
                    <span className="name">{pick.memberName}</span>
                    <div className="actions">
                      <button onClick={() => moveDraftPick(pick.id, 'up')} disabled={pick.position === 1}>↑</button>
                      <button onClick={() => moveDraftPick(pick.id, 'down')} disabled={pick.position === draftOrder.length}>↓</button>
                      <button onClick={() => removeDraftPick(pick.id)} className="delete">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3>Add to {selectedYear} Draft</h3>
            <div className="add-member-form">
              <input
                type="text"
                placeholder="Enter member name"
                value={newDraftMember}
                onChange={(e) => setNewDraftMember(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMemberToDraft(newDraftMember)}
              />
              <button onClick={() => addMemberToDraft(newDraftMember)} className="add-btn">
                Add
              </button>
            </div>

            {members.length > 0 && (
              <>
                <p className="note">Or select from registered members:</p>
                <div className="member-chips">
                  {members
                    .filter(m => !draftOrder.find(d => d.memberId === m.id))
                    .map(member => (
                      <button key={member.id} className="chip" onClick={() => addMemberToDraft(member.name)}>
                        + {member.name}
                      </button>
                    ))}
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === 'punishments' && (
          <section className="admin-section">
            <h2>Punishments</h2>

            <div className="add-punishment">
              <h3>Add New Punishment</h3>
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
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Assigned to (name)"
                  value={newPunishment.assignedTo}
                  onChange={(e) => setNewPunishment({ ...newPunishment, assignedTo: e.target.value })}
                />
                <select
                  value={newPunishment.year}
                  onChange={(e) => setNewPunishment({ ...newPunishment, year: e.target.value })}
                >
                  {AVAILABLE_YEARS.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <button onClick={addPunishment} className="add-btn">Add Punishment</button>
            </div>

            {sortedPunishmentYears.length === 0 ? (
              <p className="empty-state">No punishments yet</p>
            ) : (
              sortedPunishmentYears.map(year => (
                <div key={year} className="punishment-year-section">
                  <h3>{year} Season</h3>
                  <div className="punishment-list">
                    {punishmentsByYear[year].map((p) => (
                      <div key={p.id} className={`punishment-item ${p.completed ? 'completed' : ''}`}>
                        {editingPunishmentId === p.id ? (
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
                            <div className="edit-actions">
                              <button onClick={() => saveEditPunishment(p)} className="save-btn">Save</button>
                              <button onClick={cancelEditPunishment} className="cancel-btn">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="punishment-info">
                              <strong>{p.title}</strong>
                              {p.description && <p>{p.description}</p>}
                              {p.assignedToName && <small>Assigned to: {p.assignedToName}</small>}
                            </div>
                            <div className="actions">
                              <button onClick={() => startEditPunishment(p)} className="edit-btn">Edit</button>
                              <button onClick={() => togglePunishmentComplete(p)}>
                                {p.completed ? 'Undo' : 'Done'}
                              </button>
                              <button onClick={() => deletePunishment(p.id)} className="delete">Delete</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === 'standings' && (
          <section className="admin-section">
            <div className="section-header">
              <h2>Standings</h2>
              <select
                className="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {AVAILABLE_YEARS.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {standings.length === 0 ? (
              <p className="empty-state">No standings for {selectedYear}</p>
            ) : (
              <div className="draft-order-list">
                {standings.map((s) => (
                  <div key={s.id} className="draft-order-item">
                    <span className="position">{s.position}</span>
                    <span className="name">{s.teamName}</span>
                    <span className="record">{s.wins}-{s.losses}-{s.ties}</span>
                    {s.pointsFor && <span className="points">{s.pointsFor} pts</span>}
                    <div className="actions">
                      <button onClick={() => moveStanding(s.id, 'up')} disabled={s.position === 1}>↑</button>
                      <button onClick={() => moveStanding(s.id, 'down')} disabled={s.position === standings.length}>↓</button>
                      <button onClick={() => removeStanding(s.id)} className="delete">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3>Add to {selectedYear} Standings</h3>
            <div className="add-standing-form">
              <input
                type="text"
                placeholder="Team name"
                value={newStanding.teamName}
                onChange={(e) => setNewStanding({ ...newStanding, teamName: e.target.value })}
              />
              <div className="record-inputs">
                <input
                  type="number"
                  placeholder="W"
                  value={newStanding.wins}
                  onChange={(e) => setNewStanding({ ...newStanding, wins: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="L"
                  value={newStanding.losses}
                  onChange={(e) => setNewStanding({ ...newStanding, losses: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="T"
                  value={newStanding.ties}
                  onChange={(e) => setNewStanding({ ...newStanding, ties: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Pts (optional)"
                  value={newStanding.pointsFor}
                  onChange={(e) => setNewStanding({ ...newStanding, pointsFor: e.target.value })}
                />
              </div>
              <button onClick={addStanding} className="add-btn">Add</button>
            </div>
          </section>
        )}

        {activeTab === 'members' && (
          <section className="admin-section">
            <h2>Members</h2>
            {members.length === 0 ? (
              <p className="empty-state">No registered members yet. Members are created when users sign up.</p>
            ) : (
              <div className="members-list">
                {members.map((m) => (
                  <div key={m.id} className="member-item">
                    <span className="member-name">{m.name}</span>
                    <span className="email">{m.email}</span>
                    {m.isAdmin && <span className="badge">Admin</span>}
                  </div>
                ))}
              </div>
            )}
            <p className="note">To add members, have them sign up on the app. To make someone an admin, edit their document in Firebase Console and add isAdmin: true</p>
          </section>
        )}
      </main>
    </div>
  );
};
