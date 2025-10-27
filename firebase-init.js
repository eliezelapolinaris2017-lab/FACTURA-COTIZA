/* Firebase inicializado con tu proyecto FACTURA-COTIZA */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/* Usa exactamente tu config de Firebase (la que mostraste) */
const firebaseConfig = {
  apiKey: "AIzaSyCIcLnP7dAnmcx3NATjc89k437nDk_L8Dg",
  authDomain: "factura-cotiza.firebaseapp.com",
  projectId: "factura-cotiza",
  storageBucket: "factura-cotiza.firebasestorage.app",
  messagingSenderId: "943650863605",
  appId: "1:943650863605:web:75519eef24fb5e350e08bc"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

const provider = new GoogleAuthProvider();

export function login(){ return signInWithPopup(auth, provider); }
export function logout(){ return signOut(auth); }
export function onUser(cb){ return onAuthStateChanged(auth, cb); }
