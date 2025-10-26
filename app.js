// ==================== FACTURA-COTIZA (versión funcional completa) ====================
window.addEventListener("DOMContentLoaded", () => {

import { auth, db, login, logout, onUser } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// --- Helpers ---
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const fmt = n => Number(n || 0).toFixed(2);
const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const toBase64 = file => new Promise((res, rej) => {
  if (!file) return res("");
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});
const csvCell = v => {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
};

// --- Globales ---
let USER = null;
let CFG = { companyName: "", companyPhone: "", logoFAC: "", logoCOT: "" };

// ==================== NAVEGACIÓN LATERAL ====================
$$(".navlink").forEach(b => {
  b.addEventListener("click", () => {
    const v = b.dataset.nav;
    $$(".navlink").forEach(x => x.classList.toggle("active", x === b));
    $$(".view").forEach(sec => sec.classList.remove("visible"));
    $(`#view-${v}`).classList.add("visible");
  });
});

// ==================== AUTH ====================
$("#btnLogin")?.addEventListener("click", () => login().catch(e => alert(e.message)));
$("#btnLogout")?.addEventListener("click", () => logout());

onUser(async u => {
  USER = u;
  if (!u) {
    $("#authState") && ($("#authState").textContent = "Sin sesión");
    $("#uid") && ($("#uid").textContent = "—");
    $("#btnLogin").style.display = "";
    $("#btnLogout").style.display = "none";
    return;
  }

  $("#btnLogin").style.display = "none";
  $("#btnLogout").style.display = "";
  await loadConfig();
  initNuevo();
  await loadHistorial();
});

// ==================== CONFIGURACIÓN ====================
async function loadConfig() {
  if (!USER) return;
  const ref = doc(db, `users/${USER.uid}/profile/main`);
  const snap = await getDoc(ref);
  if (snap.exists()) CFG = { ...CFG, ...snap.data() };
  $("#cfgName")?.setAttribute("value", CFG.companyName || "");
  $("#cfgPhone")?.setAttribute("value", CFG.companyPhone || "");
  $("#prevFAC") && ($("#prevFAC").src = CFG.logoFAC || "assets/logo-placeholder.png");
  $("#prevCOT") && ($("#prevCOT").src = CFG.logoCOT || "assets/logo-placeholder.png");
  $("#brandLogo").src = CFG.logoFAC || CFG.logoCOT || "assets/logo-placeholder.png";
}

$("#formCfg")?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!USER) return alert("Inicia sesión primero");
  const name = $("#cfgName").value.trim();
  const phone = $("#cfgPhone").value.trim();
  const logoFACFile = $("#cfgLogoFAC").files[0];
  const logoCOTFile = $("#cfgLogoCOT").files[0];
  if (logoFACFile) CFG.logoFAC = await toBase64(logoFACFile);
  if (logoCOTFile) CFG.logoCOT = await toBase64(logoCOTFile);
  CFG.companyName = name;
  CFG.companyPhone = phone;
  await setDoc(doc(db, `users/${USER.uid}/profile/main`), CFG);
  alert("Configuración guardada ✅");
  loadConfig();
});

// ==================== NUEVO DOCUMENTO ====================
function initNuevo() {
  const tbody = $("#linesBody");
  const addLine = () => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="item" placeholder="Servicio"></td>
      <td><input class="desc" placeholder="Descripción"></td>
      <td><input class="price" type="number" step="0.01" value="0"></td>
      <td><input class="qty" type="number" step="0.01" value="1"></td>
      <td class="right amt">$0.00</td>
      <td><button class="btn btn-dark del">✖</button></td>`;
    tbody.appendChild(tr);
    tr.querySelectorAll("input").forEach(i => i.addEventListener("input", calcTotals));
    tr.querySelector(".del").onclick = () => { tr.remove(); calcTotals(); };
  };
  $("#btnAddLine").onclick = addLine;
  addLine();
  $("#tDiscPct").oninput = calcTotals;
  $("#tTaxPct").oninput = calcTotals;
  $("#formDoc").onsubmit = saveDoc;
  $("#btnPrint").onclick = printDoc;
}

function calcTotals() {
  let subtotal = 0;
  $("#linesBody").querySelectorAll("tr").forEach(tr => {
    const p = parseFloat(tr.querySelector(".price").value || 0);
    const q = parseFloat(tr.querySelector(".qty").value || 0);
    const amt = p * q; subtotal += amt;
    tr.querySelector(".amt").textContent = "$" + fmt(amt);
  });
  const discPct = parseFloat($("#tDiscPct").value || 0);
  const taxPct = parseFloat($("#tTaxPct").value || 0);
  const discAmt = subtotal * discPct / 100;
  const taxed = (subtotal - discAmt) * taxPct / 100;
  const total = subtotal - discAmt + taxed;
  $("#tSubtotal").textContent = "$" + fmt(subtotal);
  $("#tDiscAmt").textContent = "$" + fmt(discAmt);
  $("#tTaxAmt").textContent = "$" + fmt(taxed);
  $("#tTotal").textContent = "$" + fmt(total);
}

async function saveDoc(e) {
  e.preventDefault();
  if (!USER) return alert("Inicia sesión primero");
  const type = $("#docType").value;
  const date = $("#docDate").value || todayISO();
  const client = $("#clientName").value.trim();
  const phone = $("#clientPhone").value.trim();
  const notes = $("#docNotes").value.trim();
  const discPct = parseFloat($("#tDiscPct").value || 0);
  const taxPct = parseFloat($("#tTaxPct").value || 0);
  const lines = [...$("#linesBody").querySelectorAll("tr")].map(tr => ({
    item: tr.querySelector(".item").value,
    desc: tr.querySelector(".desc").value,
    price: parseFloat(tr.querySelector(".price").value || 0),
    qty: parseFloat(tr.querySelector(".qty").value || 0)
  }));
  const totals = {
    subtotal: parseFloat($("#tSubtotal").textContent.replace("$", "")),
    discPct, taxPct,
    discAmt: parseFloat($("#tDiscAmt").textContent.replace("$", "")),
    taxAmt: parseFloat($("#tTaxAmt").textContent.replace("$", "")),
    total: parseFloat($("#tTotal").textContent.replace("$", ""))
  };
  const data = { type, date, client, phone, notes, lines, totals, status: "final" };
  await addDoc(collection(db, `users/${USER.uid}/documents`), data);
  alert("Documento guardado ✅");
  loadHistorial();
}

// ==================== HISTORIAL ====================
async function loadHistorial() {
  if (!USER) return;
  const q = query(collection(db, `users/${USER.uid}/documents`), orderBy("date", "desc"));
  const snap = await getDocs(q);
  const list = $("#listDocs");
  list.innerHTML = "";
  if (snap.empty) {
    list.innerHTML = "<em>No hay documentos</em>";
    return;
  }
  snap.forEach(d => {
    const docdata = d.data();
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <b>${docdata.type}</b> — ${docdata.client} — $${fmt(docdata.totals.total)} (${docdata.date})
      <div class="toolbar">
        <button class="btn" data-act="dup" data-id="${d.id}">📄 Duplicar</button>
        <button class="btn btn-dark" data-act="ann" data-id="${d.id}">⛔ Anular</button>
      </div>`;
    list.appendChild(div);
  });
}

$("#btnReload")?.addEventListener("click", loadHistorial);
$("#btnCsv")?.addEventListener("click", exportCSV);

async function exportCSV() {
  if (!USER) return;
  const q = query(collection(db, `users/${USER.uid}/documents`), orderBy("date", "desc"));
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => d.data());
  const header = ["type", "date", "client", "phone", "total"];
  const csv = [header.join(",")].concat(rows.map(r => header.map(k => csvCell(r[k] || r.totals?.[k] || "")).join(","))).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "factura-cotiza.csv";
  a.click();
}

// ==================== PDF ====================
function printDoc() {
  $("#pType").textContent = $("#docType").value === "FAC" ? "FACTURA" : "COTIZACIÓN";
  $("#pBizName").textContent = CFG.companyName;
  $("#pBizPhone").textContent = "Tel: " + (CFG.companyPhone || "");
  $("#pDate").textContent = "Fecha: " + ($("#docDate").value || todayISO());
  $("#pClientName").textContent = $("#clientName").value;
  $("#pClientPhone").textContent = $("#clientPhone").value;
  $("#pNotes").textContent = $("#docNotes").value;
  $("#pLogo").src = $("#docType").value === "FAC" ? CFG.logoFAC : CFG.logoCOT;

  const tbody = $("#pLines");
  tbody.innerHTML = "";
  $("#linesBody").querySelectorAll("tr").forEach(tr => {
    const r = document.createElement("tr");
    const c = cls => tr.querySelector(cls)?.value || "";
    const price = parseFloat(c(".price") || 0);
    const qty = parseFloat(c(".qty") || 0);
    const amt = price * qty;
    r.innerHTML = `<td>${c(".item")}</td><td>${c(".desc")}</td><td class="right">$${fmt(price)}</td><td class="right">${fmt(qty)}</td><td class="right">$${fmt(amt)}</td>`;
    tbody.appendChild(r);
  });
  $("#pSubtotal").textContent = $("#tSubtotal").textContent;
  $("#pDiscAmt").textContent = $("#tDiscAmt").textContent;
  $("#pTaxAmt").textContent = $("#tTaxAmt").textContent;
  $("#pTotal").textContent = $("#tTotal").textContent;
  window.print();
}

}); // 🔚 fin del DOMContentLoaded
