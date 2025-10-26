// app.js — FACTURA-COTIZA (crear, listar, duplicar, anular, CSV)
import { auth, db, login, logout, onUser } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, query, orderBy, doc, updateDoc, setDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const $ = (id)=>document.getElementById(id);

// UI
const btnLogin   = $("btnLogin");
const btnLogout  = $("btnLogout");
const authState  = $("authState");
const uidSpan    = $("uid");
const secNuevo   = $("secNuevo");
const secHist    = $("secHist");
const listDocs   = $("listDocs");
const formDoc    = $("formDoc");
const docDate    = $("docDate");
const btnCsv     = $("btnCsv");   // botón exportar CSV
const btnReload  = $("btnReload"); // botón recargar

// Fecha por defecto = hoy
function setToday(){
  if(!docDate) return;
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  docDate.value = d.toISOString().slice(0,10);
}
setToday();

btnLogin.onclick  = ()=> login().catch(e=>alert(e.message));
btnLogout.onclick = ()=> logout();

onUser(async (u)=>{
  if(u){
    authState.textContent = "Conectado";
    uidSpan.textContent   = u.uid;
    btnLogin.style.display = "none";
    btnLogout.style.display = "";
    secNuevo.style.display = "";
    secHist.style.display  = "";
    await loadDocs();
  }else{
    authState.textContent = "Sin sesión";
    uidSpan.textContent   = "—";
    btnLogin.style.display = "";
    btnLogout.style.display = "none";
    secNuevo.style.display = "none";
    secHist.style.display  = "none";
    listDocs.innerHTML = "";
  }
});

// --- Crear documento ---
formDoc?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const u = auth.currentUser;
  if(!u) return alert("Inicia sesión primero");

  const data = sanitizeDoc({
    type:   $("docType").value,                         // FAC | COT
    client: $("docClient").value.trim(),
    amount: Number($("docAmount").value || 0),
    payment:$("docPay").value,                          // Efectivo/ATH/...
    date:   $("docDate").value || isoToday(),
    notes:  $("docNotes").value || "",
    status: "final"                                     // final | borrador | anulado
  });

  await addDoc(collection(db, `users/${u.uid}/documents`), data);
  alert("✅ Documento guardado");
  formDoc.reset();
  setToday();
  await loadDocs();
});

// --- Listar historial ---
async function loadDocs(){
  const u = auth.currentUser; if(!u) return;
  listDocs.innerHTML = "Cargando...";
  const q = query(collection(db, `users/${u.uid}/documents`), orderBy("date","desc"));
  const snap = await getDocs(q);

  if (snap.empty){
    listDocs.innerHTML = "<em>No hay documentos.</em>";
    return;
  }

  const frag = document.createDocumentFragment();
  snap.forEach(d=>{
    const item = d.data();
    const row  = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div><b>${item.type}</b> — ${escapeHtml(item.client)} — $${fmt(item.amount)} — ${item.payment} — ${item.date}</div>
      <div style="display:flex; gap:8px; margin-top:6px">
        <button class="btn" data-act="dup" data-id="${d.id}">📄 Duplicar</button>
        <button class="btn btn-dark" data-act="ann" data-id="${d.id}">⛔ Anular</button>
      </div>
    `;
    frag.appendChild(row);
  });
  listDocs.innerHTML = "";
  listDocs.appendChild(frag);
}

// Acciones de historial (delegación)
listDocs?.addEventListener("click", async (ev)=>{
  const b = ev.target.closest("button"); if(!b) return;
  const id = b.getAttribute("data-id");
  const act= b.getAttribute("data-act");
  const u  = auth.currentUser; if(!u) return;

  if (act==="ann"){
    if(!confirm("¿Anular este documento?")) return;
    await updateDoc(doc(db, `users/${u.uid}/documents/${id}`), { status: "anulado", updatedAt: Date.now() });
    await loadDocs();
    return;
  }
  if (act==="dup"){
    // Leer y duplicar (simple: copia + nuevo id y fecha de hoy)
    const docsSnap = await getDocs(query(collection(db, `users/${u.uid}/documents`)));
    const src = [...docsSnap.docs].find(d=>d.id===id);
    if(!src) return;
    const data = src.data();
    const dup  = { ...data, date: isoToday(), status:"final", notes: (data.notes||"")+" (duplicado)" };
    delete dup.id;
    await addDoc(collection(db, `users/${u.uid}/documents`), sanitizeDoc(dup));
    await loadDocs();
    return;
  }
});

// Exportar CSV
btnCsv?.addEventListener("click", async ()=>{
  const u = auth.currentUser; if(!u) return alert("Inicia sesión");
  const q = query(collection(db, `users/${u.uid}/documents`), orderBy("date","desc"));
  const snap = await getDocs(q);
  const rows = snap.docs.map(d=>d.data());
  const csv  = toCSV(rows);
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `FACTURA-COTIZA_${isoToday()}.csv`;
  a.click();
});

// Recargar manual
btnReload?.addEventListener("click", loadDocs);

// ------- Utilidades -------
function isoToday(){
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}
function fmt(n){ return Number(n||0).toFixed(2); }
function escapeHtml(s=""){ return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function sanitizeDoc(d){
  return {
    ...d,
    client: (d.client||"").slice(0,120),
    amount: Number(d.amount||0),
    payment: d.payment||"Efectivo",
    date: d.date||isoToday(),
    createdAt: d.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}
function toCSV(arr){
  const header = ["type","client","amount","payment","date","status","notes"];
  const lines = arr.map(o => header.map(k => csvCell(o[k])).join(","));
  return [header.join(","), ...lines].join("\n");
}
function csvCell(v){
  if (v==null) return "";
  const s = String(v).replace(/"/g,'""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}
