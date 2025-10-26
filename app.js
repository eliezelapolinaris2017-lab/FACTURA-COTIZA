import { auth, db, login, logout, onUser } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc,
  runTransaction, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

window.addEventListener("DOMContentLoaded", () => {
  // ---------- Helpers ----------
  const $  = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const fmt = n => Number(n||0).toFixed(2);
  const isoToday = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
  const toBase64 = f => new Promise((res,rej)=>{ if(!f) return res(""); const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
  const csvCell = v => { if(v==null) return ""; const s=String(v).replace(/"/g,'""'); return /[",\n]/.test(s)?`"${s}"`:s; };

  // Sidebar móvil
  const sidebar = $("#sidebar");
  $("#btnToggle")?.addEventListener("click", ()=> sidebar.classList.toggle("open"));
  $$(".navlink").forEach(b=> b.addEventListener("click", ()=> sidebar.classList.remove("open")));

  function showView(id){
    $$(".navlink").forEach(b=> b.classList.toggle("active", b.dataset.nav===id));
    $$(".view").forEach(v=> v.classList.remove("visible"));
    $(`#view-${id}`).classList.add("visible");
  }
  $$(".navlink").forEach(b=> b.addEventListener("click", ()=> showView(b.dataset.nav)));

  // Estado
  let USER = null;
  window.CFG = { companyName:"", companyPhone:"", logoFAC:"", logoCOT:"" };

  // Auth
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
    hydrateSyncUI(); // <- pinta estado de sync si lo hay
  });

  // ---------- Configuración ----------
  async function loadConfig(){
    if(!USER) return;
    const ref = doc(db, `users/${USER.uid}/profile/main`);
    const snap = await getDoc(ref);
    if(snap.exists()) window.CFG = { ...window.CFG, ...snap.data() };
    $("#cfgName").value = window.CFG.companyName || "";
    $("#cfgPhone").value = window.CFG.companyPhone || "";
    $("#prevFAC").src = window.CFG.logoFAC || "assets/logo-placeholder.png";
    $("#prevCOT").src = window.CFG.logoCOT || "assets/logo-placeholder.png";
    $("#brandLogo").src = window.CFG.logoFAC || window.CFG.logoCOT || "assets/logo-placeholder.png";
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
    clearSyncState(); // cambios locales invalidan el “sincronizado”
    alert("Configuración guardada ✅");
    await loadConfig();
  });

  // ---------- Botón de sincronización (persistente con check) ----------
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
    btnSync.disabled = true;
    btnSync.textContent = "⏳ Sincronizando...";
    await loadConfig();
    await loadHistorial();
    const now = Date.now();
    localStorage.setItem("fc_lastSyncTime", now);
    btnSync.classList.add("synced");
    btnSync.textContent = "✔️ Sincronizado";
    syncStamp.textContent = `Última sincronización: ${new Date(now).toLocaleString()}`;
    setTimeout(()=>{ btnSync.disabled = false; }, 600);
  });

  // Si el usuario modifica inputs de config, invalidar “sincronizado”
  ["cfgName","cfgPhone","cfgLogoFAC","cfgLogoCOT"].forEach(id=>{
    const el = document.getElementById(id);
    el?.addEventListener("input", clearSyncState);
    el?.addEventListener("change", clearSyncState);
  });

  // ---------- Numeración por tipo ----------
  async function nextNumber(type){
    const ctrRef = doc(db, `users/${USER.uid}/profile/counters`);
    const num = await runTransaction(db, async (tx)=>{
      const snap = await tx.get(ctrRef);
      let data = snap.exists()? snap.data() : {};
      let n = Number(data[type]||0) + 1;
      tx.set(ctrRef, { [type]: n }, { merge:true });
      return n;
    });
    return `${type}-${num}`;
  }

  // ---------- Nuevo documento ----------
  function initNuevo(){
    $("#docDate").value = isoToday();
    const tbody = $("#linesBody");

    const addLine = ()=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="item" placeholder="Servicio"></td>
        <td><input class="desc" placeholder="Descripción"></td>
        <td><input class="price" type="number" step="0.01" value="0" inputmode="decimal"></td>
        <td><input class="qty" type="number" step="0.01" value="1" inputmode="decimal"></td>
        <td class="right amt">$0.00</td>
        <td><button type="button" class="btn btn-dark del">✖</button></td>`;
      tbody.appendChild(tr);
      tr.querySelectorAll("input").forEach(i=> i.addEventListener("input", calcTotals));
      tr.querySelector(".del").addEventListener("click", ()=>{ tr.remove(); calcTotals(); });
    };
    $("#btnAddLine").onclick = addLine;
    if(!tbody.children.length) addLine();

    $("#tDiscPct").addEventListener("input", calcTotals);
    $("#tTaxPct").addEventListener("input", calcTotals);
    $("#formDoc").addEventListener("submit", saveDoc);
    $("#btnPrint").addEventListener("click", printDoc);
  }

  function calcTotals(){
    let subtotal = 0;
    $("#linesBody").querySelectorAll("tr").forEach(tr=>{
      const p = parseFloat(tr.querySelector(".price").value||0);
      const q = parseFloat(tr.querySelector(".qty").value||0);
      const amt = p*q; subtotal += amt;
      tr.querySelector(".amt").textContent = "$"+fmt(amt);
    });
    const discPct = parseFloat($("#tDiscPct").value||0);
    const taxPct  = parseFloat($("#tTaxPct").value||0);
    const discAmt = subtotal*discPct/100;
    const taxAmt  = (subtotal-discAmt)*taxPct/100;
    const total   = subtotal-discAmt+taxAmt;
    $("#tSubtotal").textContent="$"+fmt(subtotal);
    $("#tDiscAmt").textContent="$"+fmt(discAmt);
    $("#tTaxAmt").textContent ="$"+fmt(taxAmt);
    $("#tTotal").textContent  ="$"+fmt(total);
  }

  async function saveDoc(e){
    e.preventDefault();
    if(!USER) return alert("Inicia sesión primero");

    let number = $("#docNumber").value.trim();
    const type = $("#docType").value;
    if(!number) number = await nextNumber(type);

    const docData = {
      number, type,
      date:   $("#docDate").value || isoToday(),
      client: $("#clientName").value.trim(),
      phone:  $("#clientPhone").value.trim(),
      pay:    $("#docPay").value,
      notes:  $("#docNotes").value.trim(),
      lines:  [...$("#linesBody").querySelectorAll("tr")].map(tr=>({
        item: tr.querySelector(".item").value,
        desc: tr.querySelector(".desc").value,
        price: parseFloat(tr.querySelector(".price").value||0),
        qty: parseFloat(tr.querySelector(".qty").value||0)
      })),
      totals: {
        subtotal: parseFloat($("#tSubtotal").textContent.replace("$",""))||0,
        discPct:  parseFloat($("#tDiscPct").value||0),
        taxPct:   parseFloat($("#tTaxPct").value||0),
        discAmt:  parseFloat($("#tDiscAmt").textContent.replace("$",""))||0,
        taxAmt:   parseFloat($("#tTaxAmt").textContent.replace("$",""))||0,
        total:    parseFloat($("#tTotal").textContent.replace("$",""))||0
      },
      status: "final",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await addDoc(collection(db, `users/${USER.uid}/documents`), docData);

    // limpiar y refrescar
    $("#formDoc").reset();
    $("#linesBody").innerHTML="";
    initNuevo();
    await loadHistorial();
    showView("historial");
    clearSyncState(); // guardar algo nuevo → recomienda volver a sincronizar
    alert(`✅ Guardado: ${docData.type} ${docData.number}`);
  }

  // ---------- Historial ----------
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
          <b>${v.type}</b> — <b>${v.number || "s/n"}</b> — ${v.client}
          — $${fmt(v.totals?.total||0)} — ${v.date}
          — <i>${v.pay||""}</i>
          <span style="opacity:.6">(${v.status})</span>
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
        await loadHistorial();
        return;
      }
      if (act==="del"){
        if(!confirm("🗑️ Esto eliminará el documento definitivamente. ¿Continuar?")) return;
        await deleteDoc(doc(db, `users/${USER.uid}/documents/${id}`));
        await loadHistorial();
        return;
      }
      if (act==="dup"){
        const ref = doc(db, `users/${USER.uid}/documents/${id}`);
        const snap = await getDoc(ref);
        if(!snap.exists()) return;
        const src = snap.data();
        const newNumber = await nextNumber(src.type || "FAC");
        const dupl = {
          ...src,
          number: newNumber,
          date: isoToday(),
          status:"final",
          notes: (src.notes||"") + " (duplicado)",
          createdAt: Date.now(), updatedAt: Date.now()
        };
        delete dupl.id;
        await addDoc(collection(db, `users/${USER.uid}/documents`), dupl);
        await loadHistorial();
        alert(`✅ Duplicado como ${dupl.type} ${dupl.number}`);
        return;
      }
    };
  }

  async function exportCSV(){
    if(!USER) return;
    const qy = query(collection(db, `users/${USER.uid}/documents`), orderBy("date","desc"));
    const snap = await getDocs(qy);
    const rows = snap.docs.map(d=>d.data());
    const headers = ["number","type","date","client","phone","pay","notes","subtotal","discPct","taxPct","discAmt","taxAmt","total","status"];
    const csv = [
      headers.join(","),
      ...rows.map(r=>[
        r.number||"", r.type||"", r.date||"", r.client||"", r.phone||"", r.pay||"", (r.notes||"").replace(/\n/g," "),
        r.totals?.subtotal||0, r.totals?.discPct||0, r.totals?.taxPct||0,
        r.totals?.discAmt||0, r.totals?.taxAmt||0, r.totals?.total||0,
        r.status||""
      ].map(csvCell).join(","))
    ].join("\n");
    const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `FACTURA-COTIZA_${isoToday()}.csv`;
    a.click();
  }

  // ---------- Backup / Restaurar ----------
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
    a.download = `FACTURA-COTIZA_BACKUP_${isoToday()}.json`;
    a.click();
    alert("📦 Backup exportado correctamente.");
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
  $("#btnBackup")?.addEventListener("click", backupAll);
  $("#fileRestore")?.addEventListener("change", restoreBackup);

  // ---------- PDF (vista previa) ----------
  $("#btnPrint")?.addEventListener("click", printDoc);

  function printDoc(){
    const isFAC = $("#docType").value === "FAC";
    $("#pDocTitle").textContent = isFAC ? "Factura" : "Cotización";
    $("#pBizName").textContent  = (window.CFG?.companyName || "");
    $("#pBizPhone").textContent = window.CFG?.companyPhone ? `Tel: ${window.CFG.companyPhone}` : "";
    $("#pLogo").src             = isFAC ? (window.CFG?.logoFAC || "") : (window.CFG?.logoCOT || "");

    $("#pNumber").textContent   = $("#docNumber").value || "—";
    $("#pDate").textContent     = $("#docDate").value || isoToday();
    $("#pClientName").textContent = $("#clientName").value || "";
    $("#pPay").textContent      = $("#docPay").value;
    $("#pStatus").textContent   = "final";
    $("#pNotes").textContent    = $("#docNotes").value || "";

    const pbody = $("#pLines");
    pbody.innerHTML = "";
    $("#linesBody").querySelectorAll("tr").forEach(tr=>{
      const item  = tr.querySelector(".item").value || "";
      const desc  = tr.querySelector(".desc").value || "";
      const price = parseFloat(tr.querySelector(".price").value || 0);
      const qty   = parseFloat(tr.querySelector(".qty").value || 0);
      const amt   = price*qty;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item}</td>
        <td>${desc}</td>
        <td class="right">$${fmt(price)}</td>
        <td class="right">${fmt(qty)}</td>
        <td class="right">$${fmt(amt)}</td>`;
      pbody.appendChild(row);
    });

    $("#pSubtotal").textContent = $("#tSubtotal").textContent;
    $("#pDiscAmt").textContent  = $("#tDiscAmt").textContent;
    $("#pTaxAmt").textContent   = $("#tTaxAmt").textContent;
    $("#pTotal").textContent    = $("#tTotal").textContent;
    $("#pDiscLbl").textContent  = `Descuento (${Number($("#tDiscPct").value||0).toFixed(0)}%)`;
    $("#pTaxLbl").textContent   = `IVU (${Number($("#tTaxPct").value||0).toFixed(0)}%)`;
    $("#pGen").textContent      = new Date().toLocaleString();

    const rowsCount = $("#pLines").querySelectorAll("tr").length;
    const sheet = document.getElementById("pdfSheet");
    sheet.classList.toggle("compact", rowsCount >= 10);

    window.print();
  }

  // Botones vista
  $("#btnReload")?.addEventListener("click", loadHistorial);
  $("#btnCsv")?.addEventListener("click", exportCSV);
});
