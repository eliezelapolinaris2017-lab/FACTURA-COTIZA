// FACTURA-COTIZA — Firebase (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ⚠️ Config de tu proyecto FACTURA-COTIZA (con bucket en .appspot.com)
const firebaseConfig = {
  apiKey: "AIzaSyCIcLnP7dAnmcx3NATjc89k437nDk_L8Dg",
  authDomain: "factura-cotiza.firebaseapp.com",
  projectId: "factura-cotiza",
  storageBucket: "factura-cotiza.appspot.com",
  messagingSenderId: "943650863605",
  appId: "1:943650863605:web:75519eef24fb5e350e08bc"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
const provider    = new GoogleAuthProvider();

// Helpers sencillos
export const login  = () => signInWithPopup(auth, provider);
export const logout = () => signOut(auth);
export const onUser = (cb) => onAuthStateChanged(auth, cb);
