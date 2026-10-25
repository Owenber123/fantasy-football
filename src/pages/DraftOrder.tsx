import { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { CURRENT_SEASON } from '../sleeper';
import type { DraftPick } from '../types';

export const DraftOrder = ({ editMode }: { editMode: boolean }) => {
  const { member } = useAuth();
  const [draftOrder, setDraftOrder] = useState<DraftPick[]>([]);
  const [selectedYear, setSelectedYear] = useState(CURRENT_SEASON);
  const [newDraftMember, setNewDraftMember] = useState('');

  // Fetch all draft picks (filter client-side to avoid index requirement)
  useEffect(() => {
    getDocs(collection(db, 'draftOrder'))
      .then(snap => setDraftOrder(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DraftPick))))
      .catch(() => console.log('No draft data yet'));
  }, []);

  const years = [...new Set([CURRENT_SEASON, ...draftOrder.map(p => p.year)])].sort((a, b) => b.localeCompare(a));

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

  const filteredDraftOrder = draftOrder
    .filter(pick => pick.year === selectedYear)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="card">
      <div className="card-header-row">
        <h3>📋 Draft Order</h3>
        <select
          className="year-select"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          {years.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>
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
  );
};
