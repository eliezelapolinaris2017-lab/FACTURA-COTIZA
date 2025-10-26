import { auth, db, login, logout, onUser } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc,
  runTransaction, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/* ---------- Utils ---------- */
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const money = n => "$" + (Number(n||0)).toFixed(2);
const todayISO = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const toBase64 = f => new Promise((res,rej)=>{ if(!f) return res(""); const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });

/* ---------- UI ---------- */
const sidebar = $("#sidebar");
$("#btnToggle")?.addEventListener("click", ()=> sidebar.classList.toggle("open"));
function showView(id){
  $$(".navlink").forEach(b=> b.classList.toggle("active", b.dataset.nav===id));
  $$(".view").forEach(v=> v.classList.remove("visible"));
  $(`#view-${id}`).classList.add("visible");
}
$$(".navlink").forEach(b=> b.addEventListener("click", ()=>{ showView(b.dataset.nav); sidebar.classList.remove("open"); }));

/* ---------- Estado ---------- */
let USER = null;
window.CFG = { companyName:"", companyPhone:"", logoFAC:"", logoCOT:"" };

/* ---------- Auth ---------- */
$("#btnLogin")?.addEventListener("click", ()=> login().catch(e=>alert(e.message)));
$("#btnLogout")?.addEventListener("click", ()=> logout());

onUser(async u=>{
  USER = u || null;
  if(!u){
    $("#authState").textContent="Sin sesión";
    $("#uid").textContent="—";
    $("#btnLogin").style.display="";
    $("#btnLogout").style.display="none";
    return;
  }
  $("#authState").textContent="Conectado";
  $("#uid").textContent=u.uid;
  $("#btnLogin").style.display="none";
  $("#btnLogout").style.display="";
  await loadConfig();
  initNuevo();
  await loadHistorial();
  hydrateSyncUI();
});

/* ---------- Config Firebase ---------- */
async function loadConfig(){
  if(!USER) return;
  const ref = doc(db, `users/${USER.uid}/profile/main`);
  const snap = await getDoc(ref);
  if(snap.exists()) window.CFG = { ...window.CFG, ...snap.data() };
  $("#cfgName").value = window.CFG.companyName || "";
  $("#cfgPhone").value = window.CFG.companyPhone || "";
  $("#prevFAC").src = window.CFG.logoFAC || "";
  $("#prevCOT").src = window.CFG.logoCOT || "";
  $("#brandLogo").src = window.CFG.logoFAC || window.CFG.logoCOT || "";
  // precargar en “Nuevo”
  $("#bizName").value = window.CFG.companyName || "";
  $("#bizPhone").value = window.CFG.companyPhone || "";
  $("#bizLogoPreview").src = window.CFG.logoFAC || window.CFG.logoCOT || "";
}

$("#formCfg")?.addEventListener("submit", async e=>{
  e.preventDefault();
  if(!USER) return alert("Inicia sesión primero");
  window.CFG.companyName = $("#cfgName").value.trim();
  window.CFG.companyPhone = $("#cfgPhone").value.trim();
  const fFAC = $("#cfgLogoFAC").files[0];
  const fCOT = $("#cfgLogoCOT").files[0];
  if(fFAC) window.CFG.logoFAC = await toBase64(fFAC);
  if(fCOT) window.CFG.logoCOT = await toBase64(fCOT);
  await setDoc(doc(db, `users/${USER.uid}/profile/main`), window.CFG, {merge:true});
  clearSyncState();
  alert("Configuración guardada ✅");
  await loadConfig();
});

/* ---------- Sincronización visual (✔️ persistente) ---------- */
const btnSync = $("#btnSync");
const syncStamp = $("#syncStamp");
function hydrateSyncUI(){
  const t = localStorage.getItem("fc_lastSyncTime");
  if(t){
    btnSync?.classList.add("synced");
    btnSync && (btnSync.textContent = "✔️ Sincronizado");
    syncStamp && (syncStamp.textContent = `Última sincronización: ${new Date(parseInt(t)).toLocaleString()}`);
  }
}
function clearSyncState(){
  localStorage.removeItem("fc_lastSyncTime");
  btnSync?.classList.remove("synced");
  btnSync && (btnSync.textContent = "🔁 Sincronizar con Firebase");
  syncStamp && (syncStamp.textContent = "—");
}
btnSync?.addEventListener("click", async ()=>{
  if(!USER) return alert("Inicia sesión primero");
  btnSync.disabled = true; btnSync.textContent = "⏳ Sincronizando...";
  await loadConfig(); await loadHistorial();
  const now = Date.now();
  localStorage.setItem("fc_lastSyncTime", now);
  btnSync.classList.add("synced"); btnSync.textContent = "✔️ Sincronizado";
  syncStamp.textContent = `Última sincronización: ${new Date(now).toLocaleString()}`;
  setTimeout(()=> btnSync.disabled=false, 500);
});

/* ---------- Numeración ---------- */
async function nextNumber(type){ // type: FAC | COT
  const ctrRef = doc(db, `users/${USER.uid}/profile/counters`);
  const n = await runTransaction(db, async (tx)=>{
    const s = await tx.get(ctrRef);
    let d = s.exists()? s.data() : {};
    let v = Number(d[type]||0)+1;
    tx.set(ctrRef,{[type]:v},{merge:true});
    return v;
  });
  return `${type}-${n}`;
}

/* ---------- Nuevo ---------- */
function initNuevo(){
  $("#docDate").value = todayISO();

  // preview logo subido en "Nuevo"
  $("#bizLogo").addEventListener("change", async e=>{
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => { $("#bizLogoPreview").src = r.result; };
    r.readAsDataURL(f);
  });

  function addLine(detail="", cost=0){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="detail" placeholder="Descripción del servicio" value="${detail}"></td>
      <td class="right"><input class="cost" type="number" step="0.01" inputmode="decimal" value="${cost}"></td>
      <td class="right"><button type="button" class="btn">✖</button></td>`;
    $("#lines").appendChild(tr);
    tr.querySelector(".cost").addEventListener("input", calc);
    tr.querySelector("button").addEventListener("click", ()=>{ tr.remove(); calc(); });
  }
  $("#addLine").onclick = ()=> addLine();
  if(!$("#lines").children.length) addLine();

  $("#ivuPct").addEventListener("input", calc);
  $("#btnPdf").addEventListener("click", onPrint);
  $("#formDoc").addEventListener("submit", saveDoc);

  calc();
}

function calc(){
  let sub=0;
  $$("#lines tr").forEach(tr=>{
    sub += parseFloat(tr.querySelector(".cost").value||0);
  });
  const ivuPct = parseFloat($("#ivuPct").value||0);
  const ivuAmt = sub*ivuPct/100;
  const tot = sub + ivuAmt;
  $("#tSubtotal").textContent = money(sub);
  $("#tIVU").textContent = money(ivuAmt);
  $("#tTotal").textContent = money(tot);
}

/* ---------- Guardar ---------- */
async function saveDoc(e){
  e.preventDefault();
  if(!USER) return alert("Inicia sesión primero");

  const type = $("#docType").value; // FAC/COT
  let number = $("#docNumber").value.trim();
  if(!number) number = await nextNumber(type);

  const logoSrc = $("#bizLogoPreview").getAttribute("src") || window.CFG.logoFAC || window.CFG.logoCOT || "";

  const lines = [...$$("#lines tr")].map(tr=>({
    detalle: tr.querySelector(".detail").value,
    costo: parseFloat(tr.querySelector(".cost").value||0)
  }));
  const subtotal = lines.reduce((a,b)=>a+(b.costo||0),0);
  const ivuPct = parseFloat($("#ivuPct").value||0);
  const ivuAmt = subtotal*ivuPct/100;
  const total  = subtotal + ivuAmt;

  const docData = {
    number, type,
    date: $("#docDate").value || todayISO(),
    client: $("#clientName").value.trim(),
    phone: "",
    pay: $("#docPay").value,
    notes: $("#notes").value.trim(),
    lines,
    totals:{ subtotal, ivuPct, ivuAmt, total },
    business:{ name: $("#bizName").value.trim(), phone: $("#bizPhone").value.trim(), logo: logoSrc },
    status:"final",
    createdAt: Date.now(), updatedAt: Date.now()
  };

  await addDoc(collection(db, `users/${USER.uid}/documents`), docData);
  await loadHistorial();
  clearSyncState();
  $("#docNumber").value = number; // mostrar al usuario el número emitido
  alert(`✅ Guardado: ${type} ${number}`);
}

/* ---------- Historial ---------- */
$("#btnReload")?.addEventListener("click", loadHistorial);
$("#btnCsv")?.addEventListener("click", exportCSV);
$("#btnBackup")?.addEventListener("click", backupAll);
$("#fileRestore")?.addEventListener("change", restoreBackup);

async function loadHistorial(){
  if(!USER) return;
  const qy = query(collection(db, `users/${USER.uid}/documents`), orderBy("date","desc"));
  const snap = await getDocs(qy);
  const list = $("#listDocs");
  list.innerHTML = "";
  if (snap.empty){ list.innerHTML = "<em>No hay documentos</em>"; return; }

  snap.forEach(d=>{
    const v = d.data();
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div>
        <b>${v.type}</b> — <b>${v.number}</b> — ${v.client}
        — $${(v.totals?.total||0).toFixed(2)} — ${v.date}
        — <i>${v.pay||""}</i> <span style="opacity:.6">(${v.status})</span>
      </div>
      <div class="toolbar">
        <button class="btn" data-act="dup" data-id="${d.id}">📄 Duplicar</button>
        <button class="btn btn-dark" data-act="ann" data-id="${d.id}">⛔ Anular</button>
        <button class="btn btn-dark" data-act="del" data-id="${d.id}">🗑️ Eliminar</button>
      </div>`;
    list.appendChild(el);
  });

  list.onclick = async (ev)=>{
    const b = ev.target.closest("button"); if(!b) return;
    const id = b.getAttribute("data-id");
    const act= b.getAttribute("data-act");

    if (act==="ann"){
      if(!confirm("¿Anular este documento?")) return;
      await updateDoc(doc(db, `users/${USER.uid}/documents/${id}`), { status:"anulado", updatedAt: Date.now() });
      await loadHistorial(); return;
    }
    if (act==="del"){
      if(!confirm("🗑️ Esto eliminará el documento definitivamente. ¿Continuar?")) return;
      await deleteDoc(doc(db, `users/${USER.uid}/documents/${id}`));
      await loadHistorial(); return;
    }
    if (act==="dup"){
      const ref = doc(db, `users/${USER.uid}/documents/${id}`);
      const snap = await getDoc(ref);
      if(!snap.exists()) return;
      const src = snap.data();
      const newNumber = await nextNumber(src.type || "FAC");
      const dupl = {
        ...src, number:newNumber, date:todayISO(), status:"final",
        notes:(src.notes||"") + " (duplicado)", createdAt:Date.now(), updatedAt:Date.now()
      };
      delete dupl.id;
      await addDoc(collection(db, `users/${USER.uid}/documents`), dupl);
      await loadHistorial();
      alert(`✅ Duplicado como ${dupl.type} ${dupl.number}`);
    }
  };
}

/* ---------- CSV / Backup ---------- */
async function exportCSV(){
  if(!USER) return;
  const qy = query(collection(db, `users/${USER.uid}/documents`), orderBy("date","desc"));
  const snap = await getDocs(qy);
  const rows = snap.docs.map(d=>d.data());
  const headers = ["number","type","date","client","pay","subtotal","ivuPct","ivuAmt","total","status"];
  const csv = [
    headers.join(","),
    ...rows.map(r=>[
      r.number||"", r.type||"", r.date||"", r.client||"", r.pay||"",
      r.totals?.subtotal||0, r.totals?.ivuPct||0, r.totals?.ivuAmt||0, r.totals?.total||0,
      r.status||""
    ].join(","))
  ].join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `FACTURA-COTIZA_${todayISO()}.csv`;
  a.click();
}

async function backupAll(){
  if(!USER) return alert("Inicia sesión primero");
  const profileRef = doc(db, `users/${USER.uid}/profile/main`);
  const profileSnap = await getDoc(profileRef);
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  const qy = query(collection(db, `users/${USER.uid}/documents`), orderBy("date","desc"));
  const snap = await getDocs(qy);
  const documents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const payload = { version:1, exportedAt:new Date().toISOString(), profile, documents };
  const blob = new Blob([JSON.stringify(payload,null,2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `FACTURA-COTIZA_BACKUP_${todayISO()}.json`;
  a.click();
  alert("📦 Backup exportado.");
}
async function restoreBackup(ev){
  if(!USER) return alert("Inicia sesión primero");
  const file = ev.target.files?.[0]; if(!file) return;
  if(!confirm("⚠️ Se importarán datos en tu cuenta. ¿Continuar?")) return;
  let data; try{ data = JSON.parse(await file.text()); }catch{ return alert("JSON inválido"); }
  if(data.profile) await setDoc(doc(db, `users/${USER.uid}/profile/main`), data.profile, {merge:true});
  if(Array.isArray(data.documents)){
    for(const d of data.documents){
      const clean = {...d}; delete clean.id; clean.restoredAt = Date.now();
      await addDoc(collection(db, `users/${USER.uid}/documents`), clean);
    }
  }
  await loadHistorial();
  alert("✅ Restauración completa");
}

/* ---------- PDF (plantilla simple A4) ---------- */
function renderInvoice(data){
  $("#invTitle").textContent   = data.tipo === "COT" ? "Cotización" : "Factura";
  $("#invNumber").textContent  = data.number || "—";
  $("#invDate").textContent    = data.date || todayISO();
  $("#invClient").textContent  = data.client || "—";

  $("#invBizName").textContent = data.business?.name || "";
  $("#invBizPhone").textContent= data.business?.phone || "";
  const logo = data.business?.logo || "";
  const img  = $("#invLogo");
  if(logo){ img.src = logo; img.style.visibility="visible"; } else { img.removeAttribute("src"); img.style.visibility="hidden"; }

  const tbody = $("#invLines"); tbody.innerHTML = "";
  (data.lines||[]).forEach(l=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${l.detalle||l.desc||""}</td><td class="right">${money(l.costo||l.amount||0)}</td>`;
    tbody.appendChild(tr);
  });

  $("#invSubtotal").textContent = money(data.totals?.subtotal||0);
  $("#invTax").textContent      = money(data.totals?.ivuAmt||data.totals?.taxAmt||0);
  $("#invTotal").textContent    = money(data.totals?.total||0);
  $("#invNotes").textContent    = data.notes || data.garantia || "—";
}

function onPrint(){
  const logoSrc = $("#bizLogoPreview").getAttribute("src") || window.CFG.logoFAC || window.CFG.logoCOT || "";
  const lines = [...$$("#lines tr")].map(tr=>({
    detalle: tr.querySelector(".detail").value,
    costo:   parseFloat(tr.querySelector(".cost").value||0)
  }));
  const subtotal = lines.reduce((a,b)=>a+(b.costo||0),0);
  const ivuPct = parseFloat($("#ivuPct").value||0);
  const ivuAmt = subtotal*ivuPct/100;
  const total  = subtotal + ivuAmt;

  const data = {
    type: $("#docType").value, number: $("#docNumber").value, date: $("#docDate").value,
    client: $("#clientName").value, pay: $("#docPay").value,
    lines, totals:{ subtotal, ivuAmt, total },
    notes: $("#notes").value,
    business:{ name: $("#bizName").value, phone: $("#bizPhone").value, logo: logoSrc }
  };
  renderInvoice(data);
  window.print();
}

/* ---------- Reglas y fecha por defecto ---------- */
$("#docDate").value = todayISO();
