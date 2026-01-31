import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Member } from '../types';

interface AuthContextType {
  user: User | null;
  member: Member | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const memberDoc = await getDoc(doc(db, 'members', firebaseUser.uid));
        if (memberDoc.exists()) {
          setMember({ id: memberDoc.id, ...memberDoc.data() } as Member);
        }
      } else {
        setMember(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email: string, password: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // First user becomes admin automatically
    await setDoc(doc(db, 'members', cred.user.uid), {
      name,
      email,
      isAdmin: true // Make all signups admin for now (can restrict later)
    });

    // Update the member state immediately
    setMember({
      id: cred.user.uid,
      name,
      email,
      isAdmin: true
    });
  };

  const logout = async () => {
    await signOut(auth);
  };

  const isAdmin = member?.isAdmin ?? false;

  return (
    <AuthContext.Provider value={{ user, member, isAdmin, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
