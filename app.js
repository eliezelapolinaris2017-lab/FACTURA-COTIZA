// ==================== FACTURA-COTIZA — App completa ====================
import { auth, db, login, logout, onUser } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

window.addEventListener("DOMContentLoaded", () => {
  // Helpers
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const fmt = n => Number(n||0).toFixed(2);
  const isoToday = () => {
    const d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  };
  const toBase64 = f => new Promise((res,rej)=>{ if(!f) return res(""); const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
  const csvCell = v => { if(v==null) return ""; const s=String(v).replace(/"/g,'""'); return /[",\n]/.test(s)?`"${s}"`:s; };

  // Sidebar toggle (móvil)
  const sidebar = $("#sidebar");
  $("#btnToggle")?.addEventListener("click", ()=> sidebar.classList.toggle("open"));
  // Cerrar sidebar al cambiar vista (móvil)
  $$(".navlink").forEach(b => b.addEventListener("click", ()=> sidebar.classList.remove("open")));

  // Navegación
  function showView(id){
    $$(".navlink").forEach(b=> b.classList.toggle("active", b.dataset.nav===id));
    $$(".view").forEach(v=> v.classList.remove("visible"));
    $(`#view-${id}`).classList.add("visible");
  }
  $$(".navlink").forEach(b => b.addEventListener("click", ()=> showView(b.dataset.nav)));

  // Estado
  let USER = null;
  let CFG = { companyName:"", companyPhone:"", logoFAC:"", logoCOT:"" };

  // Auth
  $("#btnLogin")?.addEventListener("click", ()=> login().catch(e=>alert(e.message)));
  $("#btnLogout")?.addEventListener("click", ()=> logout());

  onUser(async u=>{
    USER = u || null;
    if(!u){
      $("#authState").textContent = "Sin sesión";
      $("#uid").textContent = "—";
      $("#btnLogin").style.display = "";
      $("#btnLogout").style.display = "none";
      return;
    }
    $("#authState").textContent = "Conectado";
    $("#uid").textContent = u.uid;
    $("#btnLogin").style.display = "none";
    $("#btnLogout").style.display = "";
    await loadConfig();
    initNuevo();
    await loadHistorial();
  });

  // -------- CONFIGURACIÓN --------
  async function loadConfig(){
    if(!USER) return;
    const ref = doc(db, `users/${USER.uid}/profile/main`);
    const snap = await getDoc(ref);
    if(snap.exists()) CFG = {...CFG, ...snap.data()};
    $("#cfgName") && ($("#cfgName").value = CFG.companyName || "");
    $("#cfgPhone") && ($("#cfgPhone").value = CFG.companyPhone || "");
    $("#prevFAC") && ($("#prevFAC").src = CFG.logoFAC || "assets/logo-placeholder.png");
    $("#prevCOT") && ($("#prevCOT").src = CFG.logoCOT || "assets/logo-placeholder.png");
    $("#brandLogo").src = CFG.logoFAC || CFG.logoCOT || "assets/logo-placeholder.png";
  }

  $("#formCfg")?.addEventListener("submit", async e=>{
    e.preventDefault();
    if(!USER) return alert("Inicia sesión primero");
    CFG.companyName = $("#cfgName").value.trim();
    CFG.companyPhone = $("#cfgPhone").value.trim();
    const fFAC = $("#cfgLogoFAC").files[0];
    const fCOT = $("#cfgLogoCOT").files[0];
    if(fFAC) CFG.logoFAC = await toBase64(fFAC);
    if(fCOT) CFG.logoCOT = await toBase64(fCOT);
    await setDoc(doc(db, `users/${USER.uid}/profile/main`), CFG);
    alert("Configuración guardada ✅");
    await loadConfig();
  });

  // -------- NUEVO DOCUMENTO --------
  function initNuevo(){
    // fecha hoy
    const d = isoToday();
    $("#docDate").value = d;

    // líneas
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

    // totales
    $("#tDiscPct").addEventListener("input", calcTotals);
    $("#tTaxPct").addEventListener("input", calcTotals);

    // acciones
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

    const docData = {
      type: $("#docType").value, // FAC | COT
      date: $("#docDate").value || isoToday(),
      client: $("#clientName").value.trim(),
      phone: $("#clientPhone").value.trim(),
      notes: $("#docNotes").value.trim(),
      lines: [...$("#linesBody").querySelectorAll("tr")].map(tr=>({
        item: tr.querySelector(".item").value,
        desc: tr.querySelector(".desc").value,
        price: parseFloat(tr.querySelector(".price").value||0),
        qty: parseFloat(tr.querySelector(".qty").value||0)
      })),
      totals: {
        subtotal: parseFloat($("#tSubtotal").textContent.replace("$",""))||0,
        discPct: parseFloat($("#tDiscPct").value||0),
        taxPct:  parseFloat($("#tTaxPct").value||0),
        discAmt: parseFloat($("#tDiscAmt").textContent.replace("$",""))||0,
        taxAmt:  parseFloat($("#tTaxAmt").textContent.replace("$",""))||0,
        total:   parseFloat($("#tTotal").textContent.replace("$",""))||0
      },
      status: "final",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await addDoc(collection(db, `users/${USER.uid}/documents`), docData);
    alert("✅ Documento guardado");
    await loadHistorial();
    showView("historial");
  }

  // -------- HISTORIAL --------
  $("#btnReload")?.addEventListener("click", loadHistorial);
  $("#btnCsv")?.addEventListener("click", exportCSV);

  async function loadHistorial(){
    if(!USER) return;
    const q = query(collection(db, `users/${USER.uid}/documents`), orderBy("date","desc"));
    const snap = await getDocs(q);
    const list = $("#listDocs");
    list.innerHTML = "";
    if (snap.empty){ list.innerHTML = "<em>No hay documentos</em>"; return; }

    snap.forEach(d=>{
      const v = d.data();
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div><b>${v.type}</b> — ${v.client} — $${fmt(v.totals?.total||0)} — ${v.date} <span style="opacity:.6">(${v.status})</span></div>
        <div class="toolbar">
          <button class="btn" data-act="dup" data-id="${d.id}">📄 Duplicar</button>
          <button class="btn btn-dark" data-act="ann" data-id="${d.id}">⛔ Anular</button>
        </div>`;
      list.appendChild(el);
    });

    // delegación
    list.onclick = async (ev)=>{
      const b = ev.target.closest("button"); if(!b) return;
      const id = b.getAttribute("data-id");
      const act= b.getAttribute("data-act");
      if (act==="ann"){
        if(!confirm("¿Anular este documento?")) return;
        await updateDoc(doc(db, `users/${USER.uid}/documents/${id}`), { status:"anulado", updatedAt: Date.now() });
        await loadHistorial(); return;
      }
      if (act==="dup"){
        // cargar original
        const ref = doc(db, `users/${USER.uid}/documents/${id}`);
        const snap = await getDoc(ref);
        if(!snap.exists()) return;
        const src = snap.data();
        const dupl = {
          ...src,
          date: isoToday(),
          status:"final",
          notes: (src.notes||"") + " (duplicado)",
          createdAt: Date.now(), updatedAt: Date.now()
        };
        delete dupl.id;
        await addDoc(collection(db, `users/${USER.uid}/documents`), dupl);
        await loadHistorial(); return;
      }
    };
  }

  async function exportCSV(){
    if(!USER) return;
    const q = query(collection(db, `users/${USER.uid}/documents`), orderBy("date","desc"));
    const snap = await getDocs(q);
    const rows = snap.docs.map(d=>d.data());
    const headers = ["type","date","client","phone","notes","subtotal","discPct","taxPct","discAmt","taxAmt","total","status"];
    const csv = [
      headers.join(","),
      ...rows.map(r=>[
        r.type, r.date, r.client, r.phone||"", (r.notes||"").replace(/\n/g," "),
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

  // -------- PDF --------
  $("#btnPrint")?.addEventListener("click", printDoc);

  function printDoc(){
    // Encabezado
    const isFAC = $("#docType").value === "FAC";
    $("#pType").textContent = isFAC ? "FACTURA" : "COTIZACIÓN";
    $("#pBizName").textContent = CFG.companyName || "";
    $("#pBizPhone").textContent = CFG.companyPhone ? `Tel: ${CFG.companyPhone}` : "";
    $("#pDate").textContent    = "Fecha: " + ($("#docDate").value || isoToday());
    $("#pLogo").src            = isFAC ? (CFG.logoFAC||"") : (CFG.logoCOT||"");

    // Cliente
    $("#pClientName").textContent  = $("#clientName").value || "";
    $("#pClientPhone").textContent = $("#clientPhone").value || "";
    $("#pNotes").textContent       = $("#docNotes").value || "";

    // Líneas
    const pbody = $("#pLines");
    pbody.innerHTML = "";
    $("#linesBody").querySelectorAll("tr").forEach(tr=>{
      const item  = tr.querySelector(".item").value;
      const desc  = tr.querySelector(".desc").value;
      const price = parseFloat(tr.querySelector(".price").value||0);
      const qty   = parseFloat(tr.querySelector(".qty").value||0);
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

    // Totales
    $("#pSubtotal").textContent = $("#tSubtotal").textContent;
    $("#pDiscAmt").textContent  = $("#tDiscAmt").textContent;
    $("#pTaxAmt").textContent   = $("#tTaxAmt").textContent;
    $("#pTotal").textContent    = $("#tTotal").textContent;

    // Mostrar plantilla de impresión
    window.print();
  }

});
