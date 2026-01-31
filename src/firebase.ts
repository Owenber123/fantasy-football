import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDC1nx596-Li-m7AEjLP3nusM94vjvR3pI",
  authDomain: "fantasy-football-bccc2.firebaseapp.com",
  projectId: "fantasy-football-bccc2",
  storageBucket: "fantasy-football-bccc2.firebasestorage.app",
  messagingSenderId: "227548242622",
  appId: "1:227548242622:web:77580b0f533c1a7cc074ef",
  measurementId: "G-EHH88X99HE"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
