/* ===== JS: js/firebase-config.js ===== */
const V = '10.12.0';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAvUbT_0edq8INmGGef00Dre1ztoCvRl8E",
  authDomain: "quiz-engine-35ae4.firebaseapp.com",
  projectId: "quiz-engine-35ae4",
  storageBucket: "quiz-engine-35ae4.firebasestorage.app",
  messagingSenderId: "53083615592",
  appId: "1:53083615592:web:60a788ebd4e0f8548de6dd"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const FIXED_EMAIL = 'sync@quiz.app';

export { auth, db, FIXED_EMAIL };

export async function loginWithCode(code) {
  return signInWithEmailAndPassword(auth, FIXED_EMAIL, code);
}

export async function logout() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function isLoggedIn() {
  return auth.currentUser !== null;
}
