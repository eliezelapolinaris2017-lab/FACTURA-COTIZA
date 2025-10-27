import { auth, db, login, logout, onUser } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc,
  runTransaction, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

window.addEventListener("DOMContentLoaded", () => {
  // Utilidades
  const $  = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const fmt = n => Number(n||0).toFixed(2);
  const isoToday = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
  const toBase64 = f => new Promise((res,rej)=>{ if(!f) return res(""); const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
  const csvCell = v => { if(v==null) return ""; const s=String(v).replace(/"/g,'""'); return /[",\n]/.test(s)?`"${s}"`:s; };

  // Navegación
  const sidebar = $("#sidebar");
  $("#btnToggle")?.addEventListener("click", ()=> sidebar.classList.toggle("open"));
  $$(".navlink").forEach(b=> b.addEventListener("click", (e)=>{
    e.preventDefault();
    const id = b.dataset.nav;
    showView(id);
    sidebar.classList.remove("open");
    history.replaceState(null,"",`#${id}`);
  }));
  function showView(id){
    $$(".navlink").forEach(b=> b.classList.toggle("active", b.dataset.nav===id));
    $$(".view").forEach(v=> v.classList.remove("visible"));
    $(`#view-${id}`).classList.add("visible");
  }
  (()=>{
    const hash = (location.hash||"#inicio").replace("#","");
    const link = $(`.navlink[data-nav="${hash}"]`);
    if(link) link.click();
  })();

  // Estado
  let USER = null;
  window.CFG = { companyName:"", companyPhone:"", logoFAC:"", logoCOT:"" };
  let unsubHist = null, unsubCfg=null;

  // Config offline (cache)
  const LS_CFG_KEY = "fc.cfg.v1";
  const saveCfgLocal = cfg => localStorage.setItem(LS_CFG_KEY, JSON.stringify(cfg));
  const getCfgLocal = () => { try{ return JSON.parse(localStorage.getItem(LS_CFG_KEY)||"{}"); }catch{ return {}; } };
  Object.assign(window.CFG, getCfgLocal());

  // Auth
  $("#btnLogin").addEventListener("click", ()=> login().catch(e=>alert(e.message)));
  $("#btnLogout").addEventListener("click", ()=> logout());

  onUser(async u=>{
    if (unsubHist) { unsubHist(); unsubHist=null; }
    if (unsubCfg)  { unsubCfg();  unsubCfg=null; }
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

    startConfigLive();
    initNuevo();
    startHistorialLive();
  });

  // Config en vivo
  function startConfigLive(){
    if(!USER) return;
    const cfgRef = doc(db, `users/${USER.uid}/profile/main`);
    unsubCfg = onSnapshot(cfgRef, (snap)=>{
      if(snap.exists()) window.CFG = { ...window.CFG, ...snap.data() };
      $("#cfgName").value  = window.CFG.companyName || "";
      $("#cfgPhone").value = window.CFG.companyPhone || "";
      $("#prevFAC").src    = window.CFG.logoFAC || "assets/logo-placeholder.png";
      $("#prevCOT").src    = window.CFG.logoCOT || "assets/logo-placeholder.png";
      saveCfgLocal(window.CFG);
    });
  }

  $("#formCfg").addEventListener("submit", async e=>{
    e.preventDefault();
    if(!USER) return alert("Inicia sesión primero");
    const data = {
      companyName: $("#cfgName").value.trim(),
      companyPhone: $("#cfgPhone").value.trim()
    };
    const f1=$("#cfgLogoFAC").files[0], f2=$("#cfgLogoCOT").files[0];
    if(f1) data.logoFAC = await toBase64(f1);
    if(f2) data.logoCOT = await toBase64(f2);
    await setDoc(doc(db, `users/${USER.uid}/profile/main`), data, {merge:true});
    Object.assign(window.CFG, data); saveCfgLocal(window.CFG);
    alert("Configuración guardada ✅");
  });

  // Numeración por tipo
  async function nextNumber(type){
    const ctrRef = doc(db, `users/${USER.uid}/profile/counters`);
    const num = await runTransaction(db, async (tx)=>{
      const s = await tx.get(ctrRef);
      let d = s.exists()? s.data(): {};
      let n = Number(d[type]||0)+1;
      tx.set(ctrRef, { [type]: n }, { merge:true });
      return n;
    });
    return `${type}-${num}`;
  }

  // Nuevo documento
  function initNuevo(){
    $("#docDate").value = isoToday();
    const tbody = $("#linesBody");
    const addLine = ()=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td><input class="item" placeholder="Servicio"></td>
        <td><input class="desc" placeholder="Descripción"></td>
        <td><input class="price" type="number" step="0.01" value="0" inputmode="decimal"></td>
        <td><input class="qty" type="number" step="0.01" value="1" inputmode="decimal"></td>
        <td class="right amt">$0.00</td>
        <td><button class="btn btn-dark del" type="button">✖</button></td>`;
      tbody.appendChild(tr);
      tr.querySelectorAll("input").forEach(i=> i.addEventListener("input", calcTotals));
      tr.querySelector(".del").addEventListener("click", ()=>{ tr.remove(); calcTotals(); });
    };
    $("#btnAddLine").onclick=addLine;
    if(!tbody.children.length) addLine();
    $("#tDiscPct").addEventListener("input", calcTotals);
    $("#tTaxPct").addEventListener("input", calcTotals);
    $("#formDoc").addEventListener("submit", saveDoc);
    $("#btnPrint").addEventListener("click", printDoc);
    $("#btnShare").addEventListener("click", shareDoc);
    calcTotals();
  }

  function calcTotals(){
    let subtotal=0;
    $("#linesBody").querySelectorAll("tr").forEach(tr=>{
      const p=parseFloat(tr.querySelector(".price").value||0);
      const q=parseFloat(tr.querySelector(".qty").value||0);
      const amt=p*q; subtotal+=amt;
      tr.querySelector(".amt").textContent="$"+fmt(amt);
    });
    const dPct=parseFloat($("#tDiscPct").value||0);
    const tPct=parseFloat($("#tTaxPct").value||0);
    const dAmt=subtotal*dPct/100;
    const tAmt=(subtotal-dAmt)*tPct/100;
    const total=subtotal-dAmt+tAmt;
    $("#tSubtotal").textContent="$"+fmt(subtotal);
    $("#tDiscAmt").textContent="$"+fmt(dAmt);
    $("#tTaxAmt").textContent ="$"+fmt(tAmt);
    $("#tTotal").textContent  ="$"+fmt(total);
  }

  async function saveDoc(e){
    e.preventDefault();
    if(!USER) return alert("Inicia sesión primero");
    let number = $("#docNumber").value.trim();
    const type = $("#docType").value;
    if(!number) number = await nextNumber(type);

    const data = {
      number, type,
      date: $("#docDate").value || isoToday(),
      client: $("#clientName").value.trim(),
      phone: $("#clientPhone").value.trim(),
      email: $("#clientEmail").value.trim(),
      address: $("#clientAddress").value.trim(),
      pay: $("#docPay").value,
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
      status:"final",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await addDoc(collection(db, `users/${USER.uid}/documents`), data);

    $("#formDoc").reset();
    $("#linesBody").innerHTML="";
    initNuevo();
    alert(`✅ Guardado: ${data.type} ${data.number}`);
  }

  // Historial en vivo
  function startHistorialLive(){
    if(!USER) return;
    if (unsubHist) { unsubHist(); unsubHist=null; }
    const qy=query(collection(db,`users/${USER.uid}/documents`), orderBy("date","desc"));
    unsubHist = onSnapshot(qy, (snap)=>{
      const rows=snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderHistorial(rows);
    });
  }

  function renderHistorial(rows){
    const list=$("#listDocs");
    list.innerHTML="";
    if(!rows.length){ list.innerHTML="<em>No hay documentos</em>"; return; }
    for(const v of rows){
      const el=document.createElement("div");
      el.className="card";
      el.innerHTML=`
        <div><b>${v.type}</b> — <b>${v.number||"s/n"}</b> — ${v.client}
        — $${fmt(v.totals?.total||0)} — ${v.date} — <i>${v.pay||""}</i>
        <span style="opacity:.6">(${v.status})</span></div>
        <div class="toolbar">
          <button class="btn" data-act="dup" data-id="${v.id}">📄 Duplicar</button>
          <button class="btn btn-dark" data-act="ann" data-id="${v.id}">⛔ Anular</button>
          <button class="btn btn-dark" data-act="del" data-id="${v.id}">🗑️ Eliminar</button>
        </div>`;
      list.appendChild(el);
    }
    list.onclick=async ev=>{
      const b=ev.target.closest("button"); if(!b) return;
      const id=b.dataset.id, act=b.dataset.act;
      if(act==="ann"){
        if(!confirm("¿Anular este documento?")) return;
        await updateDoc(doc(db,`users/${USER.uid}/documents/${id}`),{status:"anulado",updatedAt:Date.now()});
        return;
      }
      if(act==="del"){
        if(!confirm("🗑️ Eliminar permanentemente?")) return;
        await deleteDoc(doc(db,`users/${USER.uid}/documents/${id}`));
        return;
      }
      if(act==="dup"){
        const snap=await getDoc(doc(db,`users/${USER.uid}/documents/${id}`));
        if(!snap.exists()) return;
        const src=snap.data(); const newNum=await nextNumber(src.type||"FAC");
        const dupl={...src, number:newNum, date:isoToday(), status:"final",
          notes:(src.notes||"")+" (duplicado)", createdAt:Date.now(), updatedAt:Date.now()};
        delete dupl.id; await addDoc(collection(db,`users/${USER.uid}/documents`), dupl);
        alert(`✅ Duplicado como ${dupl.type} ${dupl.number}`);
      }
    };
  }

  // CSV
  $("#btnCsv").addEventListener("click", exportCSV);
  async function exportCSV(){
    if(!USER) return;
    const qy=query(collection(db,`users/${USER.uid}/documents`), orderBy("date","desc"));
    const snap=await getDocs(qy);
    const rows=snap.docs.map(d=>d.data());
    const headers=["number","type","date","client","phone","email","address","pay","notes","subtotal","discPct","taxPct","discAmt","taxAmt","total","status"];
    const csv=[
      headers.join(","),
      ...rows.map(r=>[
        r.number||"",r.type||"",r.date||"",r.client||"",r.phone||"",r.email||"",r.address||"",r.pay||"", (r.notes||"").replace(/\n/g," "),
        r.totals?.subtotal||0,r.totals?.discPct||0,r.totals?.taxPct||0,
        r.totals?.discAmt||0,r.totals?.taxAmt||0,r.totals?.total||0, r.status||""
      ].map(csvCell).join(","))
    ].join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download=`FACTURA-COTIZA_${isoToday()}.csv`; a.click();
  }

  // Backup / Restore
  $("#btnBackup").addEventListener("click", backupAll);
  $("#fileRestore").addEventListener("change", restoreBackup);
  async function backupAll(){
    if(!USER) return alert("Inicia sesión primero");
    const profileSnap=await getDoc(doc(db,`users/${USER.uid}/profile/main`));
    const profile=profileSnap.exists()? profileSnap.data(): {};
    const qy=query(collection(db,`users/${USER.uid}/documents`), orderBy("date","desc"));
    const s=await getDocs(qy); const documents=s.docs.map(d=>({id:d.id,...d.data()}));
    const payload={version:1,exportedAt:new Date().toISOString(),profile,documents};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download=`FACTURA-COTIZA_BACKUP_${isoToday()}.json`; a.click();
    alert("📦 Backup exportado.");
  }
  async function restoreBackup(ev){
    if(!USER) return alert("Inicia sesión primero");
    const file=ev.target.files?.[0]; if(!file) return;
    if(!confirm("Se importarán datos en tu cuenta. ¿Continuar?")) return;
    let data; try{ data=JSON.parse(await file.text()); }catch{ return alert("JSON inválido"); }
    if(data.profile) await setDoc(doc(db,`users/${USER.uid}/profile/main`), data.profile, {merge:true});
    if(Array.isArray(data.documents)){
      for(const d of data.documents){
        const clean={...d}; delete clean.id; clean.restoredAt=Date.now();
        await addDoc(collection(db,`users/${USER.uid}/documents`), clean);
      }
    }
    alert("✅ Restauración completa");
  }

  // Impresión (sin QR/sello)
  function applyPdfTheme(type){
    const sheet=$("#pdfSheet");
    sheet.classList.remove("theme-fac","theme-cot");
    sheet.classList.add(type==="COT"?"theme-cot":"theme-fac");
    $("#pDocTitle").innerHTML = `<strong>${type==="COT"?"Cotización":"Factura"}</strong>`;
  }

  function renderPdfFromForm(){
    $("#pBizName").textContent = (window.CFG?.companyName || "—");
    $("#pBizPhone").textContent= window.CFG?.companyPhone ? `Tel: ${window.CFG.companyPhone}` : "";
    const type=$("#docType").value;
    applyPdfTheme(type);
    const logo= type==="COT" ? (window.CFG?.logoCOT||"") : (window.CFG?.logoFAC||"");
    if(logo) $("#pLogo").src = logo;

    $("#pNumber").textContent = $("#docNumber").value || "—";
    $("#pDate").textContent   = $("#docDate").value || isoToday();
    $("#pClientName").textContent = $("#clientName").value || "—";
    $("#pPay").textContent    = $("#docPay").value || "—";
    $("#pStatus").textContent = "final";
    $("#pEmail").textContent  = $("#clientEmail").value || "—";
    $("#pAddress").textContent= $("#clientAddress").value || "—";

    const tbody=$("#pLines"); tbody.innerHTML="";
    document.querySelectorAll("#linesBody tr").forEach(tr=>{
      const item  = tr.querySelector(".item")?.value || "";
      const desc  = tr.querySelector(".desc")?.value || "";
      const price = parseFloat(tr.querySelector(".price")?.value || 0);
      const qty   = parseFloat(tr.querySelector(".qty")?.value || 0);
      const amt   = price*qty;
      const row=document.createElement("tr");
      row.innerHTML=`
        <td>${item}</td>
        <td>${desc}</td>
        <td class="right">$${fmt(price)}</td>
        <td class="right">${fmt(qty)}</td>
        <td class="right">$${fmt(amt)}</td>`;
      tbody.appendChild(row);
    });

    $("#pSubtotal").textContent = $("#tSubtotal").textContent || "$0.00";
    $("#pDiscAmt").textContent  = $("#tDiscAmt").textContent || "$0.00";
    $("#pTaxAmt").textContent   = $("#tTaxAmt").textContent || "$0.00";
    $("#pTotal").textContent    = $("#tTotal").textContent  || "$0.00";
    const dPct=Number($("#tDiscPct").value||0).toFixed(0);
    const tPct=Number($("#tTaxPct").value ||0).toFixed(0);
    $("#pDiscLbl").textContent = `Descuento (${dPct}%)`;
    $("#pTaxLbl").textContent  = `IVU (${tPct}%)`;
    $("#pNotes").textContent   = $("#docNotes").value || "—";
    $("#pGen").textContent     = `Generado: ${new Date().toLocaleString()}`;
    $("#pLink").textContent    = location.href.replace(/[#?].*$/,"");

    const rowsCount = $("#pLines").querySelectorAll("tr").length;
    const sheet=$("#pdfSheet");
    sheet.classList.toggle("compact", rowsCount>=10);
  }

  function printDoc(){
    renderPdfFromForm();
    setTimeout(()=>window.print(), 100);
  }
  $("#btnPrint").addEventListener("click", printDoc);

  // Compartir
  async function shareDoc(){
    try{
      const subject = `${$("#docType").value} ${$("#docNumber").value || ""} - ${$("#clientName").value || ""}`.trim();
      const body = [
        `${$("#docType").value==="COT"?"Cotización":"Factura"} ${$("#docNumber").value || ""}`,
        `Cliente: ${$("#clientName").value || ""}`,
        `Total: ${$("#tTotal").textContent || "$0.00"}`,
        "",
        "Generado con FACTURA-COTIZA",
        location.href.replace(/[#?].*$/,"")
      ].join("\n");
      if(navigator.share){
        await navigator.share({ title: subject, text: body, url: location.href });
      }else{
        const mailto=`mailto:${encodeURIComponent($("#clientEmail").value||"")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        location.href=mailto;
      }
    }catch(e){
      alert("No se pudo compartir: "+e.message);
    }
  }
});
