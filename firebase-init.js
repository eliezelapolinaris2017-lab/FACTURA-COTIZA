// FACTURA-COTIZA — Firebase (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Tu config real (la que me diste)
const firebaseConfig = {
  apiKey: "AIzaSyCIcLnP7dAnmcx3NATjc89k437nDk_L8Dg",
  authDomain: "factura-cotiza.firebaseapp.com",
  projectId: "factura-cotiza",
  storageBucket: "factura-cotiza.firebasestorage.app",
  messagingSenderId: "943650863605",
  appId: "1:943650863605:web:75519eef24fb5e350e08bc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();

// API simple
const login  = () => signInWithPopup(auth, provider);
const logout = () => signOut(auth);
const onUser = (cb) => onAuthStateChanged(auth, cb);

export { auth, db, login, logout, onUser };
