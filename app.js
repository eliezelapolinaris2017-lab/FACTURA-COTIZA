import { auth, db, login, logout, onUser } from "./firebase-init.js";
import { collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const $ = (id)=>document.getElementById(id);
const btnLogin   = $("btnLogin");
const btnLogout  = $("btnLogout");
const authState  = $("authState");
const uidSpan    = $("uid");
const secNuevo   = $("secNuevo");
const secHist    = $("secHist");
const listDocs   = $("listDocs");
const formDoc    = $("formDoc");
const docDate    = $("docDate");

// Fecha por defecto = hoy
(function setToday(){
  if(!docDate) return;
  const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  docDate.value = d.toISOString().slice(0,10);
})();

btnLogin.onclick  = ()=> login().catch(e=>alert(e.message));
btnLogout.onclick = ()=> logout();

onUser(async (u)=>{
  if(u){
    authState.textContent = "Conectado";
    uidSpan.textContent = u.uid;
    btnLogin.style.display = "none";
    btnLogout.style.display = "";
    secNuevo.style.display = "";
    secHist.style.display  = "";
    await loadDocs();
  }else{
    authState.textContent = "Sin sesión";
    uidSpan.textContent = "—";
    btnLogin.style.display = "";
    btnLogout.style.display = "none";
    secNuevo.style.display = "none";
    secHist.style.display  = "none";
  }
});

formDoc?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const u = auth.currentUser;
  if(!u) return alert("Inicia sesión primero");

  const data = {
    type: $("docType").value,               // FAC | COT
    client: $("docClient").value.trim(),
    amount: Number($("docAmount").value||0),
    payment: $("docPay").value,
    date: $("docDate").value || new Date().toISOString().slice(0,10),
    notes: $("docNotes").value||"",
    createdAt: Date.now()
  };

  await addDoc(collection(db, `users/${u.uid}/documents`), data);
  alert("✅ Guardado");
  formDoc.reset();
  // restablecer fecha a hoy
  const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  $("docDate").value = d.toISOString().slice(0,10);
  await loadDocs();
});

async function loadDocs(){
  const u = auth.currentUser; if(!u) return;
  listDocs.innerHTML = "Cargando...";
  const q = query(collection(db, `users/${u.uid}/documents`), orderBy("date","desc"));
  const snap = await getDocs(q);
  if(snap.empty){ listDocs.innerHTML = "<em>No hay documentos.</em>"; return; }
  listDocs.innerHTML = "";
  snap.forEach(doc=>{
    const d = doc.data();
    const el = document.createElement("div");
    el.className="item";
    el.textContent = `${d.type} — ${d.client} — $${(d.amount||0).toFixed(2)} — ${d.payment} — ${d.date}`;
    listDocs.appendChild(el);
  });
}
