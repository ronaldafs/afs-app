
/* ============ CONFIG ============ */
const CONFIG = {
  deadlineDays: 90,                       // VCA + alle routes binnen 3 maanden
  evalMoments: [["Dag 1",1],["Week 1",7],["Week 3",21]],
  vcaPlanAfterDays: 30,                   // VCA inplannen na een maand bij 3 positieve evaluaties
  routes: ["Lounge 1 dag","Lounge 1 avond","Lounge 2 dag","Lounge 2 avond","Lounge 3 dag","Lounge 3 avond","Plaza dag","Plaza avond","KLM dag","KLM avond","Nacht","Runner"],
  coreRoutes: 10,                         // eerste 10 = dag/avondroutes, verplicht binnen 3 maanden
  scanTarget: 95,                         // interne norm scanpercentage per route
  routePins: {"1118":"Lounge 1","2228":"Lounge 2","3338":"Lounge 3","4448":"Plaza","6668":"KLM","5558":"Nacht"},
  scanDays: 45,                           // hoeveel dagen scans laden
  alerts: { windowDays: 30, maxIncidents: 3, maxNoShows: 2, maxLate: 3, sameTypeRepeat: 3 } // signaleringsregels incidenten
};

/* ============ DEMODATA (zelfde structuur als de sheet-tabbladen) ============ */
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const d = n => { const x = new Date(TODAY); x.setDate(x.getDate()+n); return iso(x); };
function iso(x){ return x.toISOString().slice(0,10); }
const DEMO = { medewerkers: [], evaluaties: [], routes: [], vca: [], toolboxen: [], incidenten: [], dienstrapport: [], doelen: [], scans: [] };
function lv(naam, levels){ return levels.map((n,i)=>({naam, route:CONFIG.routes[i], niveau:n, datum:n?d(-5):"", voorman:""})).filter(r=>r.niveau>0); }

/* ============ LOGICA ============ */
let DATA = DEMO, filter = "alle", query = "", selected = null;
const fmt = s => s ? new Date(s).toLocaleDateString("nl-NL",{day:"numeric",month:"short"}) : "–";
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/86400000);
const byName = (arr, n) => arr.filter(x => x.naam === n);
const isActief = m => String(m.actief||"ja").toLowerCase() !== "nee";
const actieve = () => DATA.medewerkers.filter(isActief);
const gearchiveerd = () => DATA.medewerkers.filter(m => !isActief(m));

function build(m){
  const ob = m.onboarding || m.start;              // startdatum van het onboardingtraject (bij bestaande medewerkers: importdatum)
  const inDienst = daysBetween(ob, TODAY);
  const deadline = d(CONFIG.deadlineDays - inDienst);
  const daysLeft = CONFIG.deadlineDays - inDienst;
  const bestaand = false;
  const evs = CONFIG.evalMoments.map(([label,day]) => {
    const e = byName(DATA.evaluaties, m.naam).find(x => x.moment === label);
    const due = !bestaand && inDienst >= day;
    return {label, day, e, due, late: due && !e && inDienst - day > 2, state: e ? (e.uitkomst==="Positief"?"g":e.uitkomst==="Aandacht"?"a":"r") : (due ? "due" : "")};
  });
  const evDone = evs.filter(x=>x.e).length;
  const evPositive = evs.every(x => x.e && x.e.uitkomst === "Positief");
  const routes = CONFIG.routes.map(r => { const x = byName(DATA.routes, m.naam).find(y => y.route === r); return {route:r, niveau: x ? +x.niveau : 0, datum: x ? x.datum : ""}; });
  const coreDone = routes.slice(0, CONFIG.coreRoutes).filter(r => r.niveau === 3).length;
  const vca = byName(DATA.vca, m.naam)[0] || {status:"Nog niet", datum:"", diploma:""};
  const tbs = byName(DATA.toolboxen, m.naam);
  const tbDone = tbs.filter(t=>t.afgerond).length, tbLate = tbs.filter(t => !t.afgerond && new Date(t.deadline) < TODAY).length;

  const issues = [];
  if (bestaand) {
    if (vca.status === "Nog niet" || vca.status === "Gezakt") issues.push(vca.status === "Gezakt" ? "VCA gezakt, herexamen inplannen" : "Geen VCA Basis");
    if (vca.status === "Behaald" && vca.datum && vca.datum < iso(TODAY)) issues.push("VCA verlopen op " + fmt(vca.datum));
    if (tbLate) issues.push(`${tbLate} toolbox${tbLate>1?"en":""} over deadline`);
    const incsB = byName(DATA.incidenten||[], m.naam); if (incsB.length >= 3) issues.push(`${incsB.length} incidenten geregistreerd`);
    const st = issues.length ? "amber" : "grey";
    return {m, incs: incsB, bestaand, inDienst, deadline:"", daysLeft:0, evs, evDone:0, evPositive:false, routes, coreDone, vca, tbs, tbDone, tbLate, issues, status: st, label: issues.length ? "Aandacht" : "Bestaand", complete: false};
  }
  evs.forEach(x => { if (x.late) issues.push(`Evaluatie ${x.label} niet ingevuld (was ${x.day===1?"dag 1":"na "+x.day+" dagen"})`); });
  evs.forEach(x => { if (x.e && x.e.uitkomst !== "Positief") issues.push(`Evaluatie ${x.label}: ${x.e.uitkomst.toLowerCase()}`); });
  if (evPositive && vca.status === "Nog niet" && inDienst >= CONFIG.vcaPlanAfterDays) issues.push("3 positieve evaluaties, VCA nog niet ingepland");
  if (vca.status !== "Behaald" && daysLeft <= 14) issues.push(daysLeft < 0 ? "VCA-deadline verstreken" : `VCA-deadline over ${daysLeft} dagen`);
  if (coreDone < CONFIG.coreRoutes && daysLeft <= 30) issues.push(`${CONFIG.coreRoutes - coreDone} routes nog niet zelfstandig`);
  if (tbLate) issues.push(`${tbLate} toolbox${tbLate>1?"en":""} over deadline`);
  if (vca.status === "Gezakt") issues.push("VCA gezakt, herexamen inplannen");

  const incs = byName(DATA.incidenten||[], m.naam);
  if (incs.length >= 3) issues.push(`${incs.length} incidenten geregistreerd`);
  const complete = vca.status === "Behaald" && coreDone === CONFIG.coreRoutes;
  let status = "green", label = "Op schema";
  if (complete) { status = "blue"; label = "Volledig inzetbaar"; }
  else if (issues.some(i => /deadline|niet ingevuld|Gezakt|gezakt|nog niet ingepland/.test(i))) { status = "red"; label = "Actie nodig"; }
  else if (issues.length) { status = "amber"; label = "Aandacht"; }
  return {m, incs, bestaand:false, inDienst, deadline, daysLeft, evs, evDone, evPositive, routes, coreDone, vca, tbs, tbDone, tbLate, issues, status, label, complete};
}

function render(){
  const all = actieve().map(build);
  const order = {red:0, amber:1, green:2, blue:3, grey:4};
  all.sort((a,b) => order[a.status]-order[b.status] || a.daysLeft - b.daysLeft);
  // KPI's
  const k = [
    ["In onboarding", all.filter(x=>!x.complete && !x.bestaand).length, ""],
    ["Actie nodig", all.filter(x=>x.status==="red").length, "red"],
    ["Aandacht", all.filter(x=>x.status==="amber").length, "amber"],
    ["VCA behaald", all.filter(x=>x.vca.status==="Behaald").length + " / " + all.length, all.filter(x=>x.vca.status==="Behaald").length===all.length?"green":"amber"],
    ["Evaluaties open", all.reduce((s,x)=>s+x.evs.filter(e=>e.due && !e.e).length,0), ""],
  ];
  const noOb = actieve().filter(m => !m.onboarding && daysBetween(m.start, TODAY) > CONFIG.deadlineDays);
  const oaAll = openActies();
  const oaHtml = oaAll.length ? `<div class="alert"><h4>⚠ ${oaAll.length} aanspreekpunt${oaAll.length>1?"en":""} vanuit kantoor open</h4><div class="al"><span>${[...new Set(oaAll.map(r=>r.medewerker||r.route))].join(" · ")}</span><button class="btn" style="padding:4px 10px" onclick="setView('dienst')">Bekijken</button></div></div>` : "";
  document.getElementById("onb-alert").innerHTML = oaHtml + (noOb.length ? `<div class="alert" style="border-color:#F3D9A4;background:var(--amber-bg)"><h4 style="color:var(--amber)">⚠ ${noOb.length} bestaande medewerkers hebben nog geen startdatum voor hun onboardingtraject</h4><div class="al" style="border-color:#F3D9A4"><span>Zij zijn al langer dan 3 maanden in dienst en tellen daardoor als 'over de deadline'. Start hun traject vandaag: evaluaties, routes en VCA-deadline gaan dan vanaf nu lopen.</span><button class="btn primary" id="startOb">Traject vandaag starten (${noOb.length})</button></div></div>` : "");
  const sb = document.getElementById("startOb"); if (sb) sb.onclick = async () => {
    sb.disabled = true; sb.textContent = "Bezig…";
    try { const rows = noOb.map(m => ({...m, onboarding: iso(TODAY), actief: m.actief || "ja"})); const res = await post("importMedewerkers", {medewerkers: rows}); if (res.error) throw new Error(res.error); rows.forEach(m => upsertMedewerker(m)); toast(`${rows.length} trajecten gestart op ${fmt(iso(TODAY))}`); render(); }
    catch (e) { toast("Opslaan mislukt: " + e.message); sb.disabled = false; }
  };
  document.getElementById("kpis").innerHTML = k.map(([l,v,c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
  // chips
  const chips = [["alle","Alle"],["red","Actie nodig"],["amber","Aandacht"],["green","Op schema"],["blue","Volledig inzetbaar"],["arch","Gearchiveerd"]];
  document.getElementById("chips").innerHTML = chips.map(([v,l]) => `<button class="chip ${filter===v?"on":""}" data-f="${v}">${l} <span class="num">${v==="alle"?all.length:v==="arch"?gearchiveerd().length:all.filter(x=>x.status===v).length}</span></button>`).join("");
  document.querySelectorAll("#chips .chip").forEach(c => c.onclick = () => { filter = c.dataset.f; render(); });
  // rows
  const q = query.toLowerCase();
  const rows = (filter==="arch" ? gearchiveerd().map(build) : all).filter(x => (filter==="alle" || filter==="arch" || x.status===filter) && (!q || x.m.naam.toLowerCase().includes(q) || (x.m.voorman||"").toLowerCase().includes(q)));
  document.getElementById("empty").style.display = rows.length ? "none" : "block";
  document.getElementById("rows").innerHTML = rows.map(x => `
    <tr data-n="${x.m.naam}" class="${selected===x.m.naam?"sel":""}">
      <td><span class="name">${x.m.naam}</span><span class="sub">${x.m.niveau||"Junior"} · voorman ${x.m.voorman||"–"}</span></td>
      <td><span class="num">${fmt(x.m.onboarding||x.m.start)}</span><span class="sub">dag ${x.inDienst}${x.m.onboarding&&x.m.onboarding!==x.m.start?" · in dienst "+fmt(x.m.start):""}</span></td>
      <td><span class="dots">${x.evs.map(e=>`<i class="dot ${e.state}" title="${e.label}: ${e.e?e.e.uitkomst:(e.due?"nog invullen":"nog niet aan de beurt")}"></i>`).join("")}</span></td>
      <td><span class="prog"><span class="track"><span class="fill" style="width:${x.coreDone/CONFIG.coreRoutes*100}%"></span></span><span class="num">${x.coreDone}/${CONFIG.coreRoutes}</span></span></td>
      <td>${vcaBadge(x.vca)}</td>
      <td><span class="num">${x.tbDone}/${x.tbs.length}</span>${x.tbLate?` <span class="st red" style="padding:1px 7px">${x.tbLate} te laat</span>`:""}</td>
      <td>${x.bestaand ? `<span class="sub">in dienst sinds ${fmt(x.m.start)}</span>` : `<span class="days ${x.complete?"":x.daysLeft<0?"red":x.daysLeft<=14?"red":x.daysLeft<=30?"amber":""}">${x.complete?"–":(x.daysLeft<0?`${-x.daysLeft} d over`:`${x.daysLeft} d`)}</span><span class="sub">${x.complete?"":fmt(x.deadline)}</span>`}</td>
      <td><span class="st ${x.status}"><i></i>${x.label}</span></td>
    </tr>`).join("");
  document.querySelectorAll("#rows tr").forEach(tr => tr.onclick = () => { selected = tr.dataset.n; setView("emp"); });
  if (view === "emp") renderDetail(DATA.medewerkers.map(build).find(x => x.m.naam === selected));
}
function vcaBadge(v){
  const map = {"Behaald":"green","Ingepland":"blue","Nog niet":"grey","Gezakt":"red"};
  return `<span class="st ${map[v.status]||"grey"}"><i></i>${v.status}${v.status==="Ingepland"&&v.datum?" "+fmt(v.datum):""}</span>`;
}
function renderDetail(x){
  const el = document.getElementById("view-emp");
  if (!x) { setView("onb"); return; }
  const arch = !isActief(x.m);
  el.innerHTML = `
    <div class="emp-head"><button class="btn" id="emp-back">\u2190 Overzicht</button><h2>${x.m.naam}</h2>${arch?`<span class="st grey"><i></i>Gearchiveerd</span>`:`<span class="st ${x.status}"><i></i>${x.label}</span>`}<span class="spacer"></span>
      ${arch?`<button class="btn" id="emp-restore">Terugzetten</button>`:`<button class="btn" id="emp-archive">Archiveren</button>`}<button class="btn danger" id="emp-delete">Verwijderen</button></div>
    <div class="emp"><div class="card">
    <div class="sec" style="border-top:0"><div class="sub">Onboarding gestart ${fmt(x.m.onboarding||x.m.start)} · dag ${x.inDienst}${x.m.onboarding&&x.m.onboarding!==x.m.start?" · in dienst sinds "+fmt(x.m.start):""} · voorman ${x.m.voorman||"–"}</div></div>
    ${x.issues.length ? `<div class="sec" style="background:${x.status==="red"?"var(--red-bg)":"var(--amber-bg)"}"><h3 style="color:${x.status==="red"?"var(--red)":"var(--amber)"}">Openstaand</h3>${x.issues.map(i=>`<div style="font-size:13px">• ${i}</div>`).join("")}</div>` : ""}
    <div class="sec"><h3>Evaluaties</h3><div class="ev">${x.evs.map(e=>`
      <span class="m">${e.label} <span class="d">(dag ${e.day})</span></span>
      <span>${e.e ? `<span class="st ${e.state==="g"?"green":e.state==="a"?"amber":"red"}"><i></i>${e.e.uitkomst} · ${fmt(e.e.datum)}</span> <button class="lnk ev-edit" data-m="${e.label}">wijzig</button>` : e.due ? `<button class="st red ev-edit" data-m="${e.label}" style="cursor:pointer;border:0"><i></i>Nu invullen</button>` : `<span class="st grey"><i></i>${fmt(d(e.day - x.inDienst))}</span> <button class="lnk ev-edit" data-m="${e.label}">invullen</button>`}</span>
      ${e.e && e.e.afspraak ? `<span class="note">Afspraak: ${e.e.afspraak} (${e.e.voorman||"voorman"})</span>` : ""}`).join("")}</div></div>
    </div><div class="card">
    <div class="sec"><h3>Routepaspoort · ${x.coreDone}/${CONFIG.coreRoutes} dag/avondroutes zelfstandig</h3>
      <div class="grid"><span></span><span class="h">Mee</span><span class="h">Toez.</span><span class="h">Zelf</span>
      ${x.routes.map((r,i)=>`<span style="${i>=CONFIG.coreRoutes?"color:var(--muted)":""}">${r.route}${r.datum?`<span class="sub">${fmt(r.datum)}</span>`:""}</span>${[1,2,3].map(l=>`<span class="cell clk ${r.niveau>=l?"l"+l:""}" data-route="${r.route}" data-l="${l}" title="${r.route}: klik om niveau ${l} af te tekenen"></span>`).join("")}`).join("")}
      </div>
      <div class="legend"><span><i style="background:#DCE3F1"></i>meegelopen</span><span><i style="background:#9FB3D8"></i>onder toezicht</span><span><i style="background:var(--navy)"></i>zelfstandig afgetekend</span><span>· klik op een vak om af te tekenen, nogmaals om terug te zetten</span></div>
    </div>
    <div class="sec"><h3>VCA Basis</h3><div class="kv">
      <span>Status</span><span>${vcaBadge(x.vca)} <select class="mini" id="vca-status">${["Nog niet","Ingepland","Behaald","Gezakt"].map(o=>`<option ${x.vca.status===o?"selected":""}>${o}</option>`).join("")}</select></span>
      <span>Datum</span><span><input class="mini" type="date" id="vca-datum" value="${x.vca.datum||""}"></span>
      <span>Diploma</span><span><input class="mini" id="vca-diploma" value="${x.vca.diploma||""}" placeholder="diplomanummer" style="width:150px"> <button class="lnk" id="vca-save">opslaan</button></span>
      ${x.bestaand ? "" : `<span>Deadline</span><span class="${x.daysLeft<=14&&x.vca.status!=="Behaald"?"days red":""}">${fmt(x.deadline)}${x.vca.status!=="Behaald"?` (${x.daysLeft<0?-x.daysLeft+" dagen over":"nog "+x.daysLeft+" dagen"})`:""}</span>
      <span>Inplannen</span><span>${x.vca.status!=="Nog niet"?"–":x.evPositive?"Kan nu":"Na 3 positieve evaluaties" + (x.inDienst<CONFIG.vcaPlanAfterDays?` en vanaf ${fmt(d(CONFIG.vcaPlanAfterDays-x.inDienst))}`:"")}</span>`}
    </div></div>
    ${(() => { const oa = openActies().filter(r => String(r.medewerker||"").toLowerCase() === x.m.naam.toLowerCase()); return oa.length ? `<div class="sec" style="background:var(--red-bg)"><h3 style="color:var(--red)">Aanspreekpunten vanuit kantoor · ${oa.length}</h3>${oa.map(r=>`<div class="tb"><span>${fmt(r.datum)} ${r.dienst} · ${r.route}<span class="sub">${r.kantoor||""}</span></span><span class="act" style="color:var(--red);font-weight:500">${r.actie}</span></div>`).join("")}</div>` : ""; })()}
    <div class="sec"><h3>Incidenten · ${x.incs.length}</h3>
      ${x.incs.length ? x.incs.slice().sort((a,b)=>String(b.datum).localeCompare(String(a.datum))).map(i=>`<div class="tb"><span>${incPill(i.incident)}</span><span class="sub">${fmt(i.datum)}${i.tijd?" · "+i.tijd:""}${i.waarschuwing?" · "+i.waarschuwing:""}</span></div>`).join("") : `<div class="sub">Geen incidenten.</div>`}
    </div>
    <div class="sec"><h3>Toolboxen · ${x.tbDone}/${x.tbs.length} afgerond</h3>
      ${x.tbs.length ? x.tbs.map(t=>`<div class="tb"><span>${t.toolbox}</span><span class="${!t.afgerond&&new Date(t.deadline)<TODAY?"late":""}">${t.afgerond?"✓ "+fmt(t.afgerond):"deadline "+fmt(t.deadline)+` <button class="lnk tb-done" data-t="${t.toolbox}">afgerond</button>`}</span></div>`).join("") : `<div class="sub">Nog geen toolboxen toegewezen.</div>`}
      <div style="display:flex;gap:6px;margin-top:8px"><input class="mini" id="tb-new" placeholder="Nieuwe toolbox" style="flex:1"><input class="mini" type="date" id="tb-dl" value="${d(7)}"><button class="lnk" id="tb-add">toevoegen</button></div>
    </div>
    </div></div>`;
  document.getElementById("emp-back").onclick = () => { selected = null; setView("onb"); };
  const ea = document.getElementById("emp-archive"); if (ea) ea.onclick = () => { if (!confirm(`${x.m.naam} archiveren? De medewerker verdwijnt uit het overzicht maar alle gegevens blijven bewaard.`)) return; save("medewerkers", ["naam"], {...x.m, actief:"nee"}, `${x.m.naam} gearchiveerd`).then(()=>{ selected=null; setView("onb"); }); };
  const er = document.getElementById("emp-restore"); if (er) er.onclick = () => save("medewerkers", ["naam"], {...x.m, actief:"ja"}, `${x.m.naam} teruggezet`);
  document.getElementById("emp-delete").onclick = async () => {
    if (!confirm(`${x.m.naam} definitief verwijderen, inclusief evaluaties, routes, VCA, toolboxen en incidenten? Dit kan niet ongedaan worden gemaakt.`)) return;
    try { const res = await post("deleteMedewerker", {naam:x.m.naam}); if (res.error) throw new Error(res.error);
      for (const k of ["medewerkers","evaluaties","routes","vca","toolboxen","incidenten"]) DATA[k] = (DATA[k]||[]).filter(r => String(r.naam||"").toLowerCase() !== x.m.naam.toLowerCase());
      toast(`${x.m.naam} verwijderd`); selected = null; setView("onb");
    } catch(e) { toast("Verwijderen mislukt: " + e.message); }
  };
  // --- routes ---
  el.querySelectorAll(".cell.clk").forEach(c => c.onclick = () => {
    const route = c.dataset.route, l = +c.dataset.l, cur = x.routes.find(r=>r.route===route).niveau;
    const niveau = (cur === l) ? l - 1 : l;
    save("routes", ["naam","route"], {naam:x.m.naam, route, niveau, datum: niveau?iso(TODAY):"", voorman: who()}, `${route}: niveau ${niveau||"0"} vastgelegd`);
  });
  // --- evaluaties ---
  el.querySelectorAll(".ev-edit").forEach(b => b.onclick = () => {
    const label = b.dataset.m, e = x.evs.find(v=>v.label===label);
    document.getElementById("e-naam").value = x.m.naam; document.getElementById("e-moment").value = label;
    document.getElementById("e-datum").value = e.e ? e.e.datum : iso(TODAY);
    document.getElementById("e-uitkomst").value = e.e ? e.e.uitkomst : "Positief";
    document.getElementById("e-afspraak").value = e.e ? (e.e.afspraak||"") : "";
    document.getElementById("e-voorman").value = e.e ? (e.e.voorman||"") : (who() || x.m.voorman || "");
    openModal("eval");
  });
  // --- vca ---
  el.querySelector("#vca-save").onclick = () => save("vca", ["naam"], {naam:x.m.naam, status:el.querySelector("#vca-status").value, datum:el.querySelector("#vca-datum").value, diploma:el.querySelector("#vca-diploma").value.trim()}, "VCA bijgewerkt");
  // --- toolboxen ---
  el.querySelectorAll(".tb-done").forEach(b => b.onclick = () => { const t = x.tbs.find(t=>t.toolbox===b.dataset.t); save("toolboxen", ["naam","toolbox"], {...t, afgerond: iso(TODAY)}, `${t.toolbox} afgerond`); });
  el.querySelector("#tb-add").onclick = () => { const n = el.querySelector("#tb-new").value.trim(); if (!n) return; save("toolboxen", ["naam","toolbox"], {naam:x.m.naam, toolbox:n, deadline:el.querySelector("#tb-dl").value, afgerond:""}, `${n} toegewezen`); };
}

/* ============ DATA LADEN ============ */
async function load(){
  const src = document.getElementById("src");
  try {
    const out = {}, missing = [];
    for (const t of Object.keys(TABLES)) {
      let q = SB.from(t).select("*").limit(20000);
      if (t === "scans") q = SB.from(t).select("*").gte("op_date", d(-CONFIG.scanDays)).order("ts").limit(50000);
      const { data, error } = await q;
      if (error) { if (/schema cache|does not exist/i.test(error.message)) { out[t] = []; missing.push(t); continue; } throw error; }
      out[t] = data || [];
    }
    DATA = out;
    DATA.scans.forEach(s => { s.ts = new Date(s.ts); });
    src.classList.add("live"); src.querySelector("span").textContent = "Live \u00b7 " + new Date().toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"}) + (missing.length ? " \u00b7 tabel ontbreekt: " + missing.join(", ") : "");
  } catch (e) { src.classList.remove("live"); src.querySelector("span").textContent = "Laden mislukt: " + (e.message||e); }
  refresh();
}
function refresh(){ render(); if (view==="home") renderHome(); if (view==="inc") renderInc(); if (view==="rep") renderRep(); if (view==="dienst") renderDs(); if (view==="scans") renderScans(); if (view==="emp") setView("emp"); }

/* ============ INCIDENTEN ============ */
let view = "home", incFilter = "alle", incQ = "", incMaand = "alle";
function incClass(t){ t=(t||"").toLowerCase(); return t.includes("ziek")?"ziek":t.includes("laat")?"telaat":t.includes("show")?"noshow":t.includes("pas")?"pas":t.includes("oordop")?"oordopjes":"overig"; }
function incPill(t){ return `<span class="inc ${incClass(t)}">${t}</span>`; }
function withFreq(list){
  const seen = {};
  return list.slice().sort((a,b)=>String(a.datum).localeCompare(String(b.datum))).map(i => { const k = (i.naam+"|"+i.incident).toLowerCase(); seen[k]=(seen[k]||0)+1; return {...i, freq:seen[k]}; });
}
function renderInc(){
  const all = withFreq(DATA.incidenten||[]);
  const monthKey = s => String(s).slice(0,7);
  const months = [...new Set(all.map(i=>monthKey(i.datum)))].sort().reverse();
  const sel = document.getElementById("inc-maand");
  sel.innerHTML = `<option value="alle">Alle maanden</option>` + months.map(m=>`<option value="${m}">${new Date(m+"-01").toLocaleDateString("nl-NL",{month:"long",year:"numeric"})}</option>`).join("");
  sel.value = incMaand;
  const inMonth = all.filter(i => incMaand==="alle" || monthKey(i.datum)===incMaand);
  const repeat = new Set(inMonth.filter(i=>i.freq>=2).map(i=>i.naam));
  const k = [
    ["Incidenten " + (incMaand==="alle"?"totaal":"deze maand"), inMonth.length, ""],
    ["No-shows", inMonth.filter(i=>incClass(i.incident)==="noshow").length, "red"],
    ["Te laat", inMonth.filter(i=>incClass(i.incident)==="telaat").length, "amber"],
    ["Ziek", inMonth.filter(i=>incClass(i.incident)==="ziek").length, ""],
    ["Herhalers (2e keer of vaker)", repeat.size, repeat.size?"red":""],
  ];
  document.getElementById("inc-alert").innerHTML = alertHtml(incidentAlerts(DATA.incidenten||[]));
  document.getElementById("inc-kpis").innerHTML = k.map(([l,v,c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
  const types = ["alle","Te laat","NO-SHOW","Ziek","Schipholpas geblokkeerd","Werken met oordopjes","Overig"];
  const cnt = t => t==="alle"?inMonth.length: t==="Overig"?inMonth.filter(i=>incClass(i.incident)==="overig").length : inMonth.filter(i=>i.incident===t).length;
  document.getElementById("inc-chips").innerHTML = types.map(t=>`<button class="chip ${incFilter===t?"on":""}" data-f="${t}">${t==="alle"?"Alle":t} <span class="num">${cnt(t)}</span></button>`).join("");
  document.querySelectorAll("#inc-chips .chip").forEach(c => c.onclick = () => { incFilter = c.dataset.f; renderInc(); });
  const q = incQ.toLowerCase();
  const rows = inMonth.filter(i => (incFilter==="alle" || (incFilter==="Overig" ? incClass(i.incident)==="overig" : i.incident===incFilter)) && (!q || i.naam.toLowerCase().includes(q) || (i.voorman||"").toLowerCase().includes(q))).sort((a,b)=>String(b.datum).localeCompare(String(a.datum)));
  document.getElementById("inc-empty").style.display = rows.length?"none":"block";
  document.getElementById("inc-rows").innerHTML = rows.map(i=>`<tr style="cursor:default">
    <td class="num">${fmt(i.datum)}</td><td><span class="dienst ${(i.dienst||"").toLowerCase()}">${i.dienst||"–"}</span></td>
    <td class="name">${i.naam}</td><td>${incPill(i.incident)}</td><td class="num">${i.tijd||""}</td>
    <td><span class="freq ${i.freq>=3?"f3":i.freq===2?"f2":""}">${i.freq}e keer</span></td>
    <td>${i.waarschuwing||""}</td><td>${i.voorman||""}</td><td style="white-space:normal;max-width:260px;color:var(--muted);font-size:12.5px">${i.opmerking||""}</td></tr>`).join("");
}
/* ============ DIENSTRAPPORT ============ */
let dsFilter = "alle", dsRoute = "", dsMaand = "alle", dsQ = "";
function doelVoor(route, dienst){
  const row = (DATA.doelen||[]).find(x => x.route === route);
  if (!row) return "";
  const k = (dienst||"").toLowerCase();
  const v = k==="ochtend" ? row.ochtend : k==="middag" ? row.middag : row.nacht;
  return v === undefined || v === "" ? (row.ochtend || "") : v;
}
function pctClass(p){ return p >= CONFIG.scanTarget ? "ok" : p >= CONFIG.scanTarget - 10 ? "warn" : "bad"; }
function dsRows(){ return (DATA.dienstrapport||[]).map(r => { const doel = +r.doel||0, gehaald = +r.gehaald||0; return {...r, doel, gehaald, pct: doel ? Math.round(gehaald/doel*100) : null}; }); }
function renderDs(){
  const all = dsRows();
  const monthKey = s => String(s).slice(0,7);
  const months = [...new Set(all.map(i=>monthKey(i.datum)))].sort().reverse();
  const sel = document.getElementById("ds-maand");
  sel.innerHTML = `<option value="alle">Alle maanden</option>` + months.map(m=>`<option value="${m}">${new Date(m+"-01").toLocaleDateString("nl-NL",{month:"long",year:"numeric"})}</option>`).join("");
  sel.value = dsMaand;
  const rs = document.getElementById("ds-route");
  rs.innerHTML = `<option value="">Alle routes</option>` + CONFIG.routes.map(r=>`<option ${dsRoute===r?"selected":""}>${r}</option>`).join("");
  let rows = all.filter(r => (dsMaand==="alle" || monthKey(r.datum)===dsMaand) && (!dsRoute || r.route===dsRoute));
  const doel = rows.reduce((a,r)=>a+r.doel,0), gehaald = rows.reduce((a,r)=>a+r.gehaald,0);
  const pct = doel ? Math.round(gehaald/doel*100) : null;
  const under = rows.filter(r => r.pct !== null && r.pct < CONFIG.scanTarget).length;
  const week = all.filter(r => String(r.datum) >= d(-7));
  const wd = week.reduce((a,r)=>a+r.doel,0), wg = week.reduce((a,r)=>a+r.gehaald,0);
  const k = [
    ["Scanpercentage in selectie", pct===null?"–":pct+"%", pct===null?"":pctClass(pct)==="ok"?"green":pctClass(pct)==="warn"?"amber":"red"],
    ["Afgelopen 7 dagen", wd?Math.round(wg/wd*100)+"%":"–", wd?({ok:"green",warn:"amber",bad:"red"})[pctClass(Math.round(wg/wd*100))]:""],
    ["Gemiste scans", doel-gehaald, doel-gehaald>0?"amber":""],
    ["Rapporten onder norm", under, under?"red":""],
    ["Rapporten in selectie", rows.length, ""],
  ];
  document.getElementById("ds-kpis").innerHTML = k.map(([l,v,c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
  // missing reports today/yesterday alert
  const expected = CONFIG.routes.slice(0, CONFIG.coreRoutes);
  const yest = d(-1);
  const done = new Set(all.filter(r=>r.datum===yest).map(r=>r.route));
  const missing = expected.filter(r=>!done.has(r));
  document.getElementById("ds-alert").innerHTML = actieBanner(openActies(), "Aanspreekpunten vanuit kantoor") + ((all.length && missing.length && missing.length < expected.length) ? `<div class="alert"><h4>⚠ Dienstrapport ontbreekt voor ${fmt(yest)}</h4><div class="al"><span>${missing.join(" · ")}</span><span class="act">Voorman aanspreken</span></div></div>` : "");
  const chips = [["alle","Alle"],["bevestig","Te bevestigen"],["onder","Onder norm"],["ok","Norm gehaald"],["actie","Actie open"]];
  document.getElementById("ds-chips").innerHTML = chips.map(([v,l])=>`<button class="chip ${dsFilter===v?"on":""}" data-f="${v}">${l} <span class="num">${v==="alle"?rows.length:v==="bevestig"?rows.filter(r=>r.status==="Te bevestigen").length:v==="onder"?rows.filter(r=>r.pct!==null&&r.pct<CONFIG.scanTarget).length:v==="actie"?rows.filter(r=>r.actie&&r.status!=="Afgerond").length:rows.filter(r=>r.pct!==null&&r.pct>=CONFIG.scanTarget).length}</span></button>`).join("");
  document.querySelectorAll("#ds-chips .chip").forEach(c => c.onclick = () => { dsFilter = c.dataset.f; renderDs(); });
  const q = dsQ.toLowerCase();
  rows = rows.filter(r => (dsFilter==="alle" || (dsFilter==="bevestig" ? r.status==="Te bevestigen" : dsFilter==="onder" ? r.pct!==null&&r.pct<CONFIG.scanTarget : dsFilter==="actie" ? (r.actie&&r.status!=="Afgerond") : r.pct!==null&&r.pct>=CONFIG.scanTarget)) && (!q || (r.medewerker||"").toLowerCase().includes(q) || (r.voorman||"").toLowerCase().includes(q))).sort((a,b)=>String(b.datum).localeCompare(String(a.datum)) || String(b.dienst).localeCompare(String(a.dienst)));
  document.getElementById("ds-empty").style.display = rows.length?"none":"block";
  document.getElementById("ds-rows").innerHTML = rows.map(r=>`<tr style="cursor:default">
    <td class="num">${fmt(r.datum)}</td><td><span class="dienst ${(r.dienst||"").toLowerCase()}">${r.dienst||"–"}</span></td><td>${r.route||""}</td><td class="name">${r.medewerker||""}</td>
    <td class="num">${r.doel||""}</td><td class="num">${r.gehaald}</td><td>${r.pct===null?"–":`<span class="pct ${pctClass(r.pct)}">${r.pct}%</span>`}</td>
    <td style="white-space:normal;max-width:240px">${r.status==="Te bevestigen"?`<span class="st amber"><i></i>Te bevestigen</span> `:""}${r.reden||""}${r.gemist?`<details><summary style="font-size:12px;color:var(--blue);cursor:pointer">Niet gescand (${r.gemist.split("|").length})</summary><div class="shops">${r.gemist.split("|").map(g=>`<span class="shop">${g}</span>`).join("")}</div></details>`:""}</td><td style="white-space:normal;max-width:220px;color:var(--muted);font-size:12.5px">${r.opmerking||""}</td><td>${r.voorman||""}${r.status==="Te bevestigen"?` <button class="lnk ds-confirm" data-k="${dsKey(r)}">bevestigen</button>`:""}</td>
    <td style="white-space:normal;max-width:240px;font-size:12.5px">${kcCell(r)}</td></tr>`).join("");
  document.querySelectorAll("#ds-rows .kc-open").forEach(b => b.onclick = e => { e.stopPropagation(); openKc(b.dataset.k); });
  document.querySelectorAll("#ds-rows .ds-confirm").forEach(b => b.onclick = e => { e.stopPropagation(); openDsEdit(b.dataset.k); });
  document.querySelectorAll("#ds-rows .kc-done").forEach(b => b.onclick = e => { e.stopPropagation(); markDone(b.dataset.k); });
}
const dsKey = r => [r.datum, r.dienst, r.route].join("|");
function kcCell(r){
  const open = r.actie && r.status !== "Afgerond";
  return `${r.kantoor ? `<div>${r.kantoor}${r.gecontroleerd_door?`<span class="sub">nagekeken door ${r.gecontroleerd_door}${r.gecontroleerd_op?" · "+fmt(r.gecontroleerd_op):""}</span>`:""}</div>` : ""}${r.actie ? `<span class="st ${open?"red":"green"}" style="margin-top:3px"><i></i>${r.actie}${open?(r.wie?" · "+r.wie:""):" · besproken"+(r.afgerond_door?" door "+r.afgerond_door:"")}</span> ` : ""}${open ? `<button class="lnk kc-done" data-k="${dsKey(r)}">Besproken</button> ` : ""}<button class="lnk kc-open" data-k="${dsKey(r)}">${r.kantoor||r.actie?"wijzig":"+ kantoorcontrole"}</button>`;
}
function openKc(key){
  const r = (DATA.dienstrapport||[]).find(x => dsKey(x) === key); if (!r) return;
  kcRow = r;
  document.getElementById("kc-info").innerHTML = `<b>${fmt(r.datum)} · ${r.dienst} · ${r.route}</b> · ${r.medewerker||"–"} · gehaald ${r.gehaald}/${r.doel}${r.reden?" · "+r.reden:""}${r.opmerking?"<br>Voorman: "+r.opmerking:""}`;
  document.getElementById("kc-opm").value = r.kantoor || ""; document.getElementById("kc-actie").value = r.actie || ""; document.getElementById("kc-wie").value = r.wie || ""; document.getElementById("kc-namen").innerHTML = [...new Set([...(DATA.dienstrapport||[]).map(x=>x.wie), ...(DATA.dienstrapport||[]).map(x=>x.voorman), ...DATA.medewerkers.map(m=>m.voorman), who()].filter(Boolean))].map(n=>`<option value="${n}">`).join("");
  openModal("kc");
}
async function markDone(key){
  const r = (DATA.dienstrapport||[]).find(x => dsKey(x) === key); if (!r) return;
  await save("dienstrapport", ["datum","dienst","route"], {...r, status:"Afgerond", afgerond_door: who(), afgerond_op: iso(TODAY)}, `Besproken: ${r.medewerker||r.route}`);
  renderDs();
}
let kcRow = null;
function openActies(){ return (DATA.dienstrapport||[]).filter(r => r.actie && r.status !== "Afgerond"); }
function actieBanner(list, titel){
  if (!list.length) return "";
  return `<div class="alert"><h4>⚠ ${titel}: ${list.length} open</h4>${list.sort((a,b)=>String(b.datum).localeCompare(String(a.datum))).map(r=>`<div class="al"><span><b>${r.medewerker||"–"}</b> · ${r.route} · ${fmt(r.datum)} ${r.dienst}<span class="sub">${r.kantoor||""}</span></span><span style="display:flex;gap:10px;align-items:center"><span class="act">${r.actie} (${r.wie||"Voorman"})</span><button class="btn" style="padding:4px 10px" onclick="markDone('${dsKey(r).replace(/'/g,"")}')">Besproken</button></span></div>`).join("")}</div>`;
}
document.getElementById("ds-q").oninput = e => { dsQ = e.target.value; renderDs(); };
document.getElementById("ds-maand").onchange = e => { dsMaand = e.target.value; renderDs(); };
document.getElementById("ds-route").onchange = e => { dsRoute = e.target.value; renderDs(); };
let dsEditRow = null;
function openDsEdit(key){
  const r = (DATA.dienstrapport||[]).find(x => dsKey(x) === key); if (!r) return;
  document.getElementById("dsBtn").onclick();
  dsEditRow = r;
  document.getElementById("s-datum").value = r.datum; document.getElementById("s-dienst").value = r.dienst; document.getElementById("s-route").value = r.route;
  document.getElementById("s-naam").value = r.medewerker||""; document.getElementById("s-doel").value = r.doel||""; document.getElementById("s-gehaald").value = r.gehaald||""; document.getElementById("s-reden").value = r.reden||""; document.getElementById("s-opm").value = r.opmerking||"";
  document.getElementById("s-scaninfo").innerHTML = r.gemist ? `Niet gescand volgens EcoSmart: <div class="shops">${r.gemist.split("|").map(g=>`<span class="shop">${g}</span>`).join("")}</div>` : "";
}
document.getElementById("dsBtn").onclick = () => {
  dsEditRow = null;
  const rs = document.getElementById("s-route"); rs.innerHTML = CONFIG.routes.map(r=>`<option>${r}</option>`).join("");
  const fill = () => {
    const st = scanStats(document.getElementById("s-datum").value, document.getElementById("s-dienst").value, rs.value);
    document.getElementById("s-doel").value = st ? st.expected : doelVoor(rs.value, document.getElementById("s-dienst").value);
    if (st) { document.getElementById("s-gehaald").value = st.done; document.getElementById("s-scaninfo").innerHTML = `Uit EcoSmart: ${st.done}/${st.expected} winkels gescand.` + (st.missed.length ? `<div class="shops">${st.missed.map(g=>`<span class="shop">${g}</span>`).join("")}</div>` : ""); }
    else document.getElementById("s-scaninfo").innerHTML = "Geen scans ingelezen voor deze dag/route. Vul de aantallen zelf in.";
  };
  document.getElementById("s-datum").onchange = fill;
  rs.onchange = fill; document.getElementById("s-dienst").onchange = fill;
  const h = new Date().getHours(); document.getElementById("s-dienst").value = h < 14 ? "Ochtend" : h < 22 ? "Middag" : "Nacht";
  document.getElementById("s-datum").value = iso(TODAY); document.getElementById("s-voorman").value = document.getElementById("s-voorman").value || who();
  fill(); openModal("ds");
};
document.getElementById("doelBtn").onclick = () => {
  const g = document.getElementById("doel-grid");
  g.innerHTML = `<span class="h">Route</span><span class="h">Ochtend</span><span class="h">Middag</span>` + CONFIG.routes.map(r => { const row=(DATA.doelen||[]).find(x=>x.route===r)||{}; return `<span>${r}</span><input class="mini" type="number" min="0" data-r="${r}" data-k="ochtend" value="${row.ochtend||""}"><input class="mini" type="number" min="0" data-r="${r}" data-k="middag" value="${row.middag||""}">`; }).join("");
  openModal("doel");
};

/* ============ ALERTS ============ */
function incidentAlerts(list){
  const A = CONFIG.alerts, since = d(-A.windowDays);
  const byP = {};
  withFreq(list).forEach(i => { (byP[i.naam] = byP[i.naam]||[]).push(i); });
  const out = [];
  for (const naam in byP) {
    const recent = byP[naam].filter(i => String(i.datum) >= since);
    const noshow = recent.filter(i=>incClass(i.incident)==="noshow").length;
    const late = recent.filter(i=>incClass(i.incident)==="telaat").length;
    const maxRep = Math.max(0, ...byP[naam].map(i=>i.freq));
    const repType = byP[naam].find(i=>i.freq===maxRep);
    const why = [];
    if (noshow >= A.maxNoShows) why.push(`${noshow}× no-show in ${A.windowDays} dagen`);
    if (late >= A.maxLate) why.push(`${late}× te laat in ${A.windowDays} dagen`);
    if (recent.length >= A.maxIncidents) why.push(`${recent.length} incidenten in ${A.windowDays} dagen`);
    if (maxRep >= A.sameTypeRepeat) why.push(`${maxRep}e keer ${repType.incident.toLowerCase()}`);
    if (!why.length) continue;
    const lastW = byP[naam].filter(i=>i.waarschuwing).sort((a,b)=>String(b.datum).localeCompare(String(a.datum)))[0];
    const level = (noshow >= A.maxNoShows || maxRep >= A.sameTypeRepeat) ? 2 : 1;
    const act = level===2 ? (lastW && /Schriftelijk|Gesprek/.test(lastW.waarschuwing) ? "Gesprek projectleider" : "Schriftelijke waarschuwing") : (lastW ? "Opvolgen vorige waarschuwing" : "Gesprek voorman");
    out.push({naam, why, level, act, last: lastW ? `${lastW.waarschuwing} (${fmt(lastW.datum)})` : "nog geen waarschuwing", n: byP[naam].length});
  }
  return out.sort((a,b)=>b.level-a.level || b.n-a.n);
}
function alertHtml(alerts, title){
  if (!alerts.length) return "";
  return `<div class="alert"><h4>⚠ ${title||"Let op"}: ${alerts.length} medewerker${alerts.length>1?"s":""} komt vaak naar voren</h4>
    ${alerts.map(a=>`<div class="al"><span><b>${a.naam}</b> <span class="why">· ${a.why.join(" · ")}</span><span class="sub">Laatste waarschuwing: ${a.last}</span></span><span class="act">${a.act}</span></div>`).join("")}</div>`;
}

/* ============ RAPPORTAGE ============ */
const RF = {van:"", tot:"", voorman:"", dienst:"", type:""};
function repFilters(){
  const vm = document.getElementById("r-voorman"), ty = document.getElementById("r-type");
  const voormannen = [...new Set([...DATA.medewerkers.map(m=>m.voorman), ...(DATA.incidenten||[]).map(i=>i.voorman)].filter(Boolean))].sort();
  vm.innerHTML = `<option value="">Alle</option>` + voormannen.map(v=>`<option ${RF.voorman===v?"selected":""}>${v}</option>`).join("");
  const types = [...new Set((DATA.incidenten||[]).map(i=>i.incident))].sort();
  ty.innerHTML = `<option value="">Alle</option>` + types.map(v=>`<option ${RF.type===v?"selected":""}>${v}</option>`).join("");
  if (!RF.van) { RF.van = d(-90); document.getElementById("r-van").value = RF.van; }
  if (!RF.tot) { RF.tot = iso(TODAY); document.getElementById("r-tot").value = RF.tot; }
}
function bars(items, {cls="", max}={}){
  const mx = max || Math.max(1, ...items.map(i=>i[1]));
  return `<div class="bars">${items.map(i=>`<div class="b ${typeof cls==="function"?cls(i):cls}"><span class="l" title="${i[0]}">${i[0]}</span><span class="t"><i style="width:${i[1]/mx*100}%"></i></span><span class="n">${i[2]!==undefined?i[2]:i[1]}</span></div>`).join("") || `<div class="sub">Geen gegevens in deze selectie.</div>`}</div>`;
}
function count(list, key){ const o={}; list.forEach(i=>{ const k=key(i)||"–"; o[k]=(o[k]||0)+1; }); return Object.entries(o).sort((a,b)=>b[1]-a[1]); }
function renderRep(){
  repFilters();
  const inc = withFreq(DATA.incidenten||[]).filter(i => String(i.datum) >= RF.van && String(i.datum) <= RF.tot && (!RF.voorman || i.voorman===RF.voorman) && (!RF.dienst || i.dienst===RF.dienst) && (!RF.type || i.incident===RF.type));
  const staff = DATA.medewerkers.map(build).filter(x => !RF.voorman || x.m.voorman===RF.voorman);
  const days = Math.max(1, daysBetween(RF.van, RF.tot)+1);
  const people = new Set(inc.map(i=>i.naam)).size;
  const alerts = incidentAlerts((DATA.incidenten||[]).filter(i => (!RF.voorman || i.voorman===RF.voorman)));
  document.getElementById("rep-alert").innerHTML = alertHtml(alerts, "Signalering");
  const k = [
    ["Incidenten in periode", inc.length, ""],
    ["Per week gemiddeld", (inc.length/days*7).toFixed(1), ""],
    ["Medewerkers betrokken", people, ""],
    ["No-shows", inc.filter(i=>incClass(i.incident)==="noshow").length, "red"],
    ["Waarschuwingen gegeven", inc.filter(i=>i.waarschuwing).length, "amber"],
  ];
  document.getElementById("rep-kpis").innerHTML = k.map(([l,v,c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");

  // trend per week
  const weeks = {}; const start = new Date(RF.van);
  inc.forEach(i => { const w = Math.floor(daysBetween(start, i.datum)/7); weeks[w]=(weeks[w]||0)+1; });
  const nW = Math.min(16, Math.ceil(days/7));
  const trend = Array.from({length:nW}, (_,w) => { const from = new Date(start); from.setDate(from.getDate()+w*7); return [fmt(iso(from)), weeks[w]||0]; });
  const tmax = Math.max(1, ...trend.map(t=>t[1]));
  const perMw = count(inc, i=>i.naam).slice(0,10);
  const perType = count(inc, i=>i.incident);
  const perVoorman = count(inc, i=>i.voorman);
  const perDienst = count(inc, i=>i.dienst);
  const onb = [
    ["Evaluaties op tijd ingevuld", staff.reduce((s,x)=>s+x.evs.filter(e=>e.e).length,0), staff.reduce((s,x)=>s+x.evs.filter(e=>e.due).length,0)],
    ["VCA behaald", staff.filter(x=>x.vca.status==="Behaald").length, staff.length],
    ["Alle 10 routes zelfstandig", staff.filter(x=>x.coreDone===CONFIG.coreRoutes).length, staff.length],
    ["Toolboxen afgerond", staff.reduce((s,x)=>s+x.tbDone,0), staff.reduce((s,x)=>s+x.tbs.length,0)],
  ].map(([l,a,b]) => [l, b?a/b*100:0, `${a}/${b}`]);
  document.getElementById("rep-grid").innerHTML = `
    <div class="rep-card wide"><h3>Incidenten per week<span>${fmt(RF.van)} t/m ${fmt(RF.tot)}</span></h3>
      <div class="trend">${trend.map(t=>`<div><b>${t[1]||""}</b><i style="height:${t[1]/tmax*80}px"></i><span>${t[0]}</span></div>`).join("")}</div></div>
    <div class="rep-card"><h3>Medewerkers met de meeste incidenten<span>top 10</span></h3>${bars(perMw, {cls: i => i[1]>=CONFIG.alerts.maxIncidents?"red":i[1]===2?"amber":""})}</div>
    <div class="rep-card"><h3>Per incidenttype</h3>${bars(perType, {cls: i => incClass(i[0])==="noshow"?"red":incClass(i[0])==="telaat"?"amber":""})}</div>
    <div class="rep-card"><h3>Per voorman<span>wie registreert</span></h3>${bars(perVoorman)}</div>
    <div class="rep-card"><h3>Per dienst</h3>${bars(perDienst)}</div>
    ${(() => { const ds = dsRows().filter(r => String(r.datum) >= RF.van && String(r.datum) <= RF.tot && (!RF.voorman || r.voorman===RF.voorman) && (!RF.dienst || r.dienst===RF.dienst)); if (!ds.length) return ""; const perRoute = CONFIG.routes.map(rt => { const x = ds.filter(r=>r.route===rt); const dl = x.reduce((a,r)=>a+r.doel,0), g = x.reduce((a,r)=>a+r.gehaald,0); return [rt, dl?Math.round(g/dl*100):0, dl?Math.round(g/dl*100)+"%":"–"]; }).filter(r=>r[2]!=="–"); const redenen = count(ds.filter(r=>r.reden), r=>r.reden); const perMw = count(ds.filter(r=>r.pct!==null&&r.pct<CONFIG.scanTarget), r=>r.medewerker||"–"); const tot = ds.reduce((a,r)=>a+r.doel,0), tg = ds.reduce((a,r)=>a+r.gehaald,0); return `
    <div class="rep-card wide"><h3>Scananalyse uit dienstrapporten<span>${ds.length} rapporten · ${tot?Math.round(tg/tot*100):0}% gehaald (${tg}/${tot}) · norm ${CONFIG.scanTarget}%</span></h3>
      <div class="rep-grid"><div><h3 style="font-size:12.5px;color:var(--muted)">Scanpercentage per route</h3>${bars(perRoute, {cls: i => pctClass(i[1])==="ok"?"green":pctClass(i[1])==="warn"?"amber":"red", max:100})}</div>
      <div><h3 style="font-size:12.5px;color:var(--muted)">Redenen niet gehaald</h3>${bars(redenen, {cls:"amber"})}<h3 style="font-size:12.5px;color:var(--muted);margin-top:14px">Medewerkers vaakst onder norm</h3>${bars(perMw.slice(0,6), {cls:"red"})}</div></div>
    </div>`; })()}
    <div class="rep-card wide"><h3>Onboarding in cijfers<span>${RF.voorman?"voorman "+RF.voorman:"alle nieuwe medewerkers"}</span></h3>${bars(onb, {cls:"green", max:100})}</div>
    <div class="rep-card wide"><h3>Herhalers<span>2e keer of vaker hetzelfde incident</span></h3>
      <table class="rank"><thead><tr><th>#</th><th>Medewerker</th><th>Incident</th><th>Aantal</th><th>Laatste</th><th>Laatste waarschuwing</th><th>Voorman</th></tr></thead><tbody>
      ${(() => { const g={}; inc.forEach(i=>{ const k=i.naam+"|"+i.incident; (g[k]=g[k]||[]).push(i); }); const rows=Object.values(g).filter(a=>a.length>=2).sort((a,b)=>b.length-a.length); return rows.length ? rows.map((a,n)=>{ const last=a.slice().sort((x,y)=>String(y.datum).localeCompare(String(x.datum)))[0]; const w=a.filter(x=>x.waarschuwing).sort((x,y)=>String(y.datum).localeCompare(String(x.datum)))[0]; return `<tr><td>${n+1}</td><td class="name">${a[0].naam}</td><td>${incPill(a[0].incident)}</td><td><span class="freq ${a.length>=3?"f3":"f2"}">${a.length}×</span></td><td>${fmt(last.datum)}</td><td>${w?w.waarschuwing+" · "+fmt(w.datum):"<span class=sub>geen</span>"}</td><td>${last.voorman||""}</td></tr>`; }).join("") : `<tr><td colspan="7" class="sub">Geen herhalers in deze selectie.</td></tr>`; })()}
      </tbody></table></div>`;
}
["r-van","r-tot","r-voorman","r-dienst","r-type"].forEach(id => document.getElementById(id).onchange = e => { RF[id.slice(2)] = e.target.value; renderRep(); });
document.getElementById("r-reset").onclick = () => { RF.van=""; RF.tot=""; RF.voorman=""; RF.dienst=""; RF.type=""; document.getElementById("r-dienst").value=""; renderRep(); };
document.getElementById("r-print").onclick = () => window.print();

function setView(vw){
  view = vw;
  document.querySelectorAll(".side-nav button").forEach(b=>b.classList.toggle("on", b.dataset.v===vw || (vw==="emp" && b.dataset.v==="onb")));
  document.getElementById("view-home").style.display = vw==="home"?"block":"none"; if (vw==="home") renderHome();
  document.getElementById("view-scans").style.display = vw==="scans"?"block":"none"; if (vw==="scans") renderScans();
  window.scrollTo(0,0);
  document.getElementById("view-onb").style.display = vw==="onb"?"block":"none";
  document.getElementById("view-emp").style.display = vw==="emp"?"block":"none";
  if (vw==="emp") { renderDetail(DATA.medewerkers.map(build).find(x => x.m.naam === selected)); }
  document.getElementById("view-inc").style.display = vw==="inc"?"block":"none";
  document.getElementById("view-rep").style.display = vw==="rep"?"block":"none";
  document.getElementById("view-dienst").style.display = vw==="dienst"?"block":"none";
  if (vw==="dienst") renderDs();
  if (vw==="rep") { renderRep(); renderMail(); }
  if (vw==="inc") renderInc();
}
document.querySelectorAll(".side-nav button").forEach(b => b.onclick = () => setView(b.dataset.v));
document.getElementById("inc-q").oninput = e => { incQ = e.target.value; renderInc(); };
document.getElementById("inc-maand").onchange = e => { incMaand = e.target.value; renderInc(); };
document.getElementById("incBtn").onclick = () => openModal("inc");

/* ============ OPSLAAN NAAR SHEET ============ */
const TABLES = {
  medewerkers: ["naam","start","voorman","niveau","actief","onboarding"],
  evaluaties: ["naam","moment","datum","uitkomst","afspraak","voorman"],
  routes: ["naam","route","niveau","datum","voorman"],
  vca: ["naam","status","datum","diploma"],
  toolboxen: ["naam","toolbox","deadline","afgerond"],
  incidenten: ["datum","dienst","naam","incident","tijd","waarschuwing","voorman","opmerking"],
  dienstrapport: ["datum","dienst","route","medewerker","doel","gehaald","gemist","reden","opmerking","voorman","kantoor","actie","wie","status","gecontroleerd_door","gecontroleerd_op","afgerond_door","afgerond_op"],
  doelen: ["route","ochtend","middag","nacht"],
  scans: ["ts","shop","pin","note","op_date","dienst"],
  mail_ontvangers: ["email","naam","dagrapport","onder_norm","aanspreekpunt","actief"],
};
const KEYS = { mail_ontvangers:["email"], medewerkers:["naam"], evaluaties:["naam","moment"], routes:["naam","route"], vca:["naam"], toolboxen:["naam","toolbox"], dienstrapport:["datum","dienst","route"], doelen:["route"], scans:["ts","shop","pin"] };
function clean(tab, row){ const o = {}; TABLES[tab].forEach(c => { if (row[c] !== undefined) o[c] = row[c] === "" ? null : (typeof row[c] === "number" ? String(row[c]) : row[c]); }); return o; }
async function post(action, payload){
  try {
    if (action === "upsert") { const { error } = await SB.from(payload.tab).upsert(clean(payload.tab, payload.row), { onConflict: KEYS[payload.tab].join(",") }); if (error) throw error; }
    else if (action === "importMedewerkers") { for (let i = 0; i < payload.medewerkers.length; i += 200) { const { error } = await SB.from("medewerkers").upsert(payload.medewerkers.slice(i, i+200).map(m => clean("medewerkers", m)), { onConflict: "naam" }); if (error) throw error; } }
    else if (action === "addMedewerker") { const { error } = await SB.from("medewerkers").upsert(clean("medewerkers", payload.medewerker), { onConflict: "naam" }); if (error) throw error; if (payload.toolbox) { const r2 = await SB.from("toolboxen").upsert(clean("toolboxen", payload.toolbox), { onConflict: "naam,toolbox" }); if (r2.error) throw r2.error; } }
    else if (action === "addIncident") { const { error } = await SB.from("incidenten").insert(clean("incidenten", payload.incident)); if (error) throw error; }
    else if (action === "deleteMedewerker") { for (const t of ["evaluaties","routes","vca","toolboxen","incidenten","medewerkers"]) { const { error } = await SB.from(t).delete().ilike("naam", payload.naam); if (error) throw error; } }
    else throw new Error("Onbekende actie " + action);
    return { ok: true };
  } catch (e) { return { error: e.message || String(e) }; }
}
function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.classList.add("on"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("on"),3200); }
function parseDate(v){
  if (!v) return "";
  if (v instanceof Date) return iso(v);
  v = String(v).trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/); if (m) { let y=m[3].length===2?"20"+m[3]:m[3]; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; }
  if (/^\d+$/.test(v) && +v > 30000) { const dt = new Date(Math.round((+v - 25569) * 86400000)); return iso(dt); } // Excel serial
  return "";
}
function upsertLocal(arr, row, keys){
  const i = arr.findIndex(x => keys.every(k => String(x[k]||"").toLowerCase() === String(row[k]||"").toLowerCase()));
  if (i >= 0) arr[i] = {...arr[i], ...row}; else arr.push(row);
}
async function save(tab, keys, row, okMsg){
  try {
    const res = await post("upsert", {tab, keys, row});
    if (res.error) throw new Error(res.error);
    upsertLocal(DATA[tab] = DATA[tab]||[], row, keys);
    toast(okMsg);
    refresh();
  } catch (e) { toast("Opslaan mislukt: " + e.message); }
}
function upsertMedewerker(m){
  const i = DATA.medewerkers.findIndex(x => x.naam.toLowerCase() === m.naam.toLowerCase());
  if (i >= 0) DATA.medewerkers[i] = {...DATA.medewerkers[i], ...m}; else DATA.medewerkers.push(m);
  return i >= 0 ? "updated" : "added";
}

/* ============ MODAL ============ */
const modal = document.getElementById("modal");
let mode = "new", importRows = [];
function openModal(t){ mode = t; setTab(t); modal.classList.add("on"); document.getElementById("n-start").value = document.getElementById("n-start").value || iso(TODAY); document.getElementById("voormannen").innerHTML = [...new Set(DATA.medewerkers.map(m=>m.voorman).filter(Boolean))].map(v=>`<option value="${v}">`).join(""); document.getElementById("alle-namen").innerHTML = DATA.medewerkers.map(m=>`<option value="${m.naam}">`).join(""); document.getElementById("c-datum").value = document.getElementById("c-datum").value || iso(TODAY); if (t==="new") document.getElementById("n-naam").focus(); if (t==="inc") document.getElementById("c-naam").focus(); }
function closeModal(){ modal.classList.remove("on"); }
function setTab(t){ mode=t; document.querySelector(".tabs").style.display = (t==="link"||t==="eval"||t==="ds"||t==="doel"||t==="kc") ? "none" : "flex"; document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on", b.dataset.t===t)); document.getElementById("pane-new").style.display = t==="new"?"grid":"none"; document.getElementById("pane-import").style.display = t==="import"?"grid":"none"; document.getElementById("pane-inc").style.display = t==="inc"?"grid":"none"; document.getElementById("pane-eval").style.display = t==="eval"?"grid":"none"; document.getElementById("pane-link").style.display = t==="link"?"grid":"none"; document.getElementById("pane-ds").style.display = t==="ds"?"grid":"none"; document.getElementById("pane-doel").style.display = t==="doel"?"grid":"none"; document.getElementById("pane-kc").style.display = t==="kc"?"grid":"none"; document.getElementById("m-title").textContent = ({new:"Nieuwe medewerker",import:"Huidige medewerkers importeren",inc:"Incident registreren",eval:"Evaluatie invullen",link:"Sheet koppelen",ds:"Dienstrapport invullen",doel:"Scandoelen per route",kc:"Kantoorcontrole"})[t]; document.getElementById("m-save").textContent = ({new:"Medewerker toevoegen",import:"Importeren",inc:"Incident opslaan",eval:"Evaluatie opslaan",link:"Koppeling opslaan",ds:"Rapport opslaan",doel:"Doelen opslaan",kc:"Opslaan"})[t]; }
document.querySelectorAll(".tab").forEach(b => b.onclick = () => setTab(b.dataset.t));
const who = () => (window.PROFILE && (PROFILE.naam || PROFILE.email)) || "";
document.getElementById("newBtn").onclick = () => openModal("new");
document.getElementById("importBtn").onclick = () => openModal("import");
document.getElementById("m-close").onclick = document.getElementById("m-cancel").onclick = closeModal;
modal.onclick = e => { if (e.target === modal) closeModal(); };

function parseImportText(txt){
  const lines = txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const rows = lines.map(l => l.split(/;|\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c=>c.replace(/^"|"$/g,"").trim()));
  return rowsToMedewerkers(rows);
}
let importVca = [];
function rowsToMedewerkers(rows){
  importVca = [];
  if (!rows.length) return [];
  const head = rows[0].map(c=>String(c).toLowerCase().trim());
  let idx = {naam:0, start:1, voorman:2, niveau:3, reg:-1, geldig:-1, diploma:-1, type:-1};
  const isHead = head.some(h => /naam|start|werkdag|voorman|datum/.test(h));
  if (isHead) { idx = {naam:-1, start:-1, voorman:-1, niveau:-1, reg:-1, geldig:-1, diploma:-1, type:-1}; head.forEach((h,i)=>{
      if(/^naam|medewerker/.test(h)) idx.naam=i;
      else if(/eerste werkdag|^start|indienst/.test(h)) idx.start=i;
      else if(/voorman|leiding/.test(h)) idx.voorman=i;
      else if(/niveau|level|functie/.test(h)) idx.niveau=i;
      else if(/vca register|vca-status|vca status/.test(h)) idx.reg=i;
      else if(/geldig tot/.test(h)) idx.geldig=i;
      else if(/diploma/.test(h)) idx.diploma=i;
      else if(/^type$/.test(h)) idx.type=i;
    }); rows = rows.slice(1); }
  const out = rows.map(r => ({naam:idx.naam>=0?String(r[idx.naam]||"").trim():"", start:idx.start>=0?parseDate(r[idx.start]):"", voorman:idx.voorman>=0?String(r[idx.voorman]||"").trim():"", niveau:["Junior","Medior","Senior"].includes(String(r[idx.niveau]||"").trim())?String(r[idx.niveau]).trim():"Junior", _r:r})).filter(m=>m.naam);
  if (idx.reg >= 0 || idx.geldig >= 0) {
    importVca = out.map(m => { const reg = String(idx.reg>=0?m._r[idx.reg]:"").toLowerCase(); const geldig = idx.geldig>=0?parseDate(m._r[idx.geldig]):""; const dipl = idx.diploma>=0?String(m._r[idx.diploma]||"").trim():""; const type = idx.type>=0?String(m._r[idx.type]||"").trim():"";
      const behaald = /geldig|behaald/.test(reg) && !/ongeldig|niet/.test(reg) || (!!geldig && !reg);
      return {naam:m.naam, status: behaald ? "Behaald" : "Nog niet", datum: behaald ? geldig : "", diploma: behaald ? [type, dipl].filter(Boolean).join(" ") : ""}; });
  }
  out.forEach(m => delete m._r);
  return out;
}
function showPreview(){
  const el = document.getElementById("i-preview");
  if (!importRows.length) { el.style.display="none"; return; }
  el.style.display="block";
  const vmap = Object.fromEntries(importVca.map(v=>[v.naam, v]));
  el.innerHTML = `<div class="sub" style="padding:6px 8px">${importRows.length} medewerkers${importVca.length?` · VCA-status herkend: ${importVca.filter(v=>v.status==="Behaald").length} behaald, ${importVca.filter(v=>v.status!=="Behaald").length} nog niet`:""}</div><table><thead><tr><th>Naam</th><th>Start</th><th>Voorman</th>${importVca.length?"<th>VCA</th>":""}</tr></thead><tbody>${importRows.map(m=>`<tr><td>${m.naam}</td><td class="${m.start?"":"days red"}">${m.start||"datum ontbreekt"}</td><td>${m.voorman||"–"}</td>${importVca.length?`<td>${vmap[m.naam]?vmap[m.naam].status+(vmap[m.naam].datum?" t/m "+fmt(vmap[m.naam].datum):""):""}</td>`:""}</tr>`).join("")}</tbody></table>`;
}
document.getElementById("i-text").oninput = e => { importRows = parseImportText(e.target.value); showPreview(); };
document.getElementById("i-file").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  if (/\.xlsx?$/i.test(f.name) && window.XLSX) {
    const wb = XLSX.read(await f.arrayBuffer(), {type:"array", cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:""});
    importRows = rowsToMedewerkers(rows);
  } else {
    importRows = parseImportText(await f.text());
  }
  showPreview();
};
document.getElementById("m-save").onclick = async () => {
  try {
    if (mode === "new") {
      const m = {naam:v("n-naam"), start:v("n-start"), onboarding:v("n-start"), voorman:v("n-voorman"), niveau:v("n-niveau"), actief:"ja"};
      if (!m.naam || !m.start) return toast("Naam en eerste werkdag zijn verplicht.");
      const tb = v("n-toolbox");
      const res = await post("addMedewerker", {medewerker:m, toolbox: tb ? {naam:m.naam, toolbox:tb, deadline:d(daysBetween(TODAY,m.start)+7), afgerond:""} : null});
      if (res.error) throw new Error(res.error);
      upsertMedewerker(m); if (tb) DATA.toolboxen.push({naam:m.naam, toolbox:tb, deadline:d(daysBetween(TODAY,m.start)+7), afgerond:""});
      ["n-naam","n-voorman","n-toolbox"].forEach(id=>document.getElementById(id).value="");
      toast(res.demo ? `${m.naam} toegevoegd (demo: niet opgeslagen, geen sheet gekoppeld)` : `${m.naam} toegevoegd aan de sheet`);
    } else if (mode === "ds") {
      const row = {...(dsEditRow||{}), datum:v("s-datum"), dienst:v("s-dienst"), route:v("s-route"), medewerker:v("s-naam"), doel:v("s-doel"), gehaald:v("s-gehaald"), reden:v("s-reden"), opmerking:v("s-opm"), voorman:v("s-voorman")||who(), status: (dsEditRow && dsEditRow.status==="Te bevestigen") ? "Bevestigd" : (dsEditRow ? dsEditRow.status : "Bevestigd")};
      const st = scanStats(row.datum, row.dienst, row.route); if (st && !row.gemist) row.gemist = st.missed.join("|");
      if (!row.datum || !row.route || row.gehaald==="") return toast("Datum, route en aantal gehaald zijn verplicht.");
      if (+row.doel && +row.gehaald < +row.doel && !row.reden) return toast("Geef een reden op waarom het doel niet is gehaald.");
      closeModal();
      await save("dienstrapport", ["datum","dienst","route"], row, `Dienstrapport ${row.route} (${row.dienst}) opgeslagen`);
      ["s-naam","s-gehaald","s-opm"].forEach(id=>document.getElementById(id).value=""); document.getElementById("s-reden").value="";
      renderDs(); return;
    } else if (mode === "kc") {
      const row = {...kcRow, kantoor:v("kc-opm"), actie:v("kc-actie"), wie:v("kc-wie"), status: v("kc-actie") ? (kcRow.status==="Afgerond" && kcRow.actie===v("kc-actie") ? "Afgerond" : "Open") : "", gecontroleerd_door: who(), gecontroleerd_op: iso(TODAY)};
      closeModal();
      await save("dienstrapport", ["datum","dienst","route"], row, "Kantoorcontrole opgeslagen");
      renderDs(); return;
    } else if (mode === "doel") {
      const inputs = [...document.querySelectorAll("#doel-grid input")];
      const rows = CONFIG.routes.map(r => ({route:r, ochtend: inputs.find(i=>i.dataset.r===r&&i.dataset.k==="ochtend").value, middag: inputs.find(i=>i.dataset.r===r&&i.dataset.k==="middag").value, nacht:""}));
      closeModal();
      for (const row of rows) { if (row.ochtend!=="" || row.middag!=="") { try { const res = await post("upsert", {tab:"doelen", keys:["route"], row}); if (res.error) throw new Error(res.error); upsertLocal(DATA.doelen = DATA.doelen||[], row, ["route"]); } catch(e) { toast("Opslaan mislukt: "+e.message); return; } } }
      toast("Scandoelen opgeslagen"); return;
    } else if (mode === "eval") {
      const row = {naam:v("e-naam"), moment:v("e-moment"), datum:v("e-datum"), uitkomst:v("e-uitkomst"), afspraak:v("e-afspraak"), voorman:v("e-voorman")};
      if (!row.datum) return toast("Datum is verplicht.");
      closeModal();
      await save("evaluaties", ["naam","moment"], row, `Evaluatie ${row.moment} van ${row.naam} opgeslagen`);
      return;
    } else if (mode === "inc") {
      const i = {datum:v("c-datum"), dienst:v("c-dienst"), naam:v("c-naam"), incident:v("c-incident"), tijd:v("c-tijd"), waarschuwing:v("c-waarschuwing"), voorman:v("c-voorman")||who(), opmerking:v("c-opm")};
      if (!i.naam || !i.datum) return toast("Naam en datum zijn verplicht.");
      const res = await post("addIncident", {incident:i});
      if (res.error) throw new Error(res.error);
      (DATA.incidenten = DATA.incidenten||[]).push(i);
      ["c-naam","c-tijd","c-opm"].forEach(id=>document.getElementById(id).value="");
      toast(res.demo ? `Incident voor ${i.naam} geregistreerd (demo: niet opgeslagen)` : `Incident voor ${i.naam} opgeslagen in de sheet`);
      closeModal(); renderInc(); render(); return;
    } else {
      if (!importRows.length) return toast("Geen regels gevonden om te importeren.");
      const bad = importRows.filter(m=>!m.start);
      if (bad.length) { toast(`${bad.length} zonder startdatum overgeslagen: ${bad.map(m=>m.naam).join(", ")}`); }
      const ok = importRows.filter(m=>m.start).map(m => ({...m, onboarding: daysBetween(m.start, TODAY) > CONFIG.deadlineDays ? iso(TODAY) : m.start}));
      const res = await post("importMedewerkers", {medewerkers: ok.map(m=>({...m, actief:"ja"}))});
      const nOld = ok.filter(m=>m.onboarding!==m.start).length;
      if (res.error) throw new Error(res.error);
      let a=0,u=0; ok.forEach(m => upsertMedewerker(m)==="added"?a++:u++);
      let vc = 0;
      for (const vrow of importVca.filter(v => ok.some(m=>m.naam===v.naam))) {
        const r2 = await post("upsert", {tab:"vca", keys:["naam"], row:vrow}); if (r2.error) throw new Error(r2.error);
        upsertLocal(DATA.vca = DATA.vca||[], vrow, ["naam"]); vc++;
      }
      toast(res.demo ? `${a} toegevoegd, ${u} bijgewerkt (demo: niet opgeslagen)` : `${a} toegevoegd, ${u} bijgewerkt${vc?`, VCA-status van ${vc} gezet`:""}${nOld?`; ${nOld} bestaande medewerkers starten de onboarding vandaag`:""}`);
      importRows = []; document.getElementById("i-text").value=""; document.getElementById("i-file").value=""; showPreview();
    }
    closeModal(); render();
  } catch (e) { toast("Opslaan mislukt: " + e.message); }
};
function v(id){ return document.getElementById(id).value.trim(); }

/* ============ EXPORT ============ */
document.getElementById("exportBtn").onclick = () => {
  const all = DATA.medewerkers.map(build);
  const overzicht = all.map(x => ({
    Naam:x.m.naam, "Eerste werkdag":x.m.start, Voorman:x.m.voorman||"", Niveau:x.m.niveau||"Junior", "Dag in dienst":x.inDienst,
    "Evaluatie dag 1":x.evs[0].e?x.evs[0].e.uitkomst:(x.evs[0].due?"OPEN":""), "Evaluatie week 1":x.evs[1].e?x.evs[1].e.uitkomst:(x.evs[1].due?"OPEN":""), "Evaluatie week 3":x.evs[2].e?x.evs[2].e.uitkomst:(x.evs[2].due?"OPEN":""),
    "Routes zelfstandig":`${x.coreDone}/${CONFIG.coreRoutes}`, "VCA status":x.vca.status, "VCA datum":x.vca.datum||"", "Toolboxen":`${x.tbDone}/${x.tbs.length}`, "Toolboxen te laat":x.tbLate,
    Deadline:x.complete?"":x.deadline, "Dagen tot deadline":x.complete?"":x.daysLeft, Status:x.label, Openstaand:x.issues.join(" | ")
  }));
  const stamp = iso(TODAY);
  if (window.XLSX) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overzicht), "Overzicht");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(withFreq(DATA.incidenten||[]).sort((a,b)=>String(b.datum).localeCompare(String(a.datum))).map(i=>({Datum:i.datum, Dienst:i.dienst, Naam:i.naam, Incident:i.incident, "Tijd te laat":i.tijd, Frequentie:i.freq+"e keer", Waarschuwing:i.waarschuwing, Voorman:i.voorman, Opmerking:i.opmerking}))), "Incidenten");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dsRows().sort((a,b)=>String(b.datum).localeCompare(String(a.datum))).map(r=>({Datum:r.datum, Dienst:r.dienst, Route:r.route, Medewerker:r.medewerker, Doel:r.doel, Gehaald:r.gehaald, Percentage:r.pct===null?"":r.pct+"%", Reden:r.reden, Opmerking:r.opmerking, Voorman:r.voorman, Kantoor:r.kantoor||"", Actie:r.actie||"", Wie:r.wie||"", Status:r.status||"", "Afgerond door":r.afgerond_door||"", "Afgerond op":r.afgerond_op||""}))), "Dienstrapport");
    for (const k of ["medewerkers","evaluaties","routes","vca","toolboxen","doelen"]) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DATA[k]||[]), k[0].toUpperCase()+k.slice(1));
    XLSX.writeFile(wb, `Onboarding_Renewi_Schiphol_${stamp}.xlsx`);
  } else {
    const heads = Object.keys(overzicht[0]||{});
    const csv = "\ufeff" + [heads.join(";"), ...overzicht.map(o=>heads.map(h=>`"${String(o[h]).replace(/"/g,'""')}"`).join(";"))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download = `Onboarding_Renewi_Schiphol_${stamp}.csv`; a.click();
  }
  toast("Export gedownload");
};

document.getElementById("q").oninput = e => { query = e.target.value; render(); };

/* ============ SCANS (EcoSmart) ============ */
const SHIFT_NL = { ochtend:"Ochtend", middag:"Middag", nacht:"Nacht" };
const SHIFT_KEY = { "Ochtend":"ochtend", "Middag":"middag", "Nacht":"nacht" };
function routeNameFor(pin, shift){ const n = CONFIG.routePins[pin]; if (!n) return null; if (pin === "5558") return shift === "nacht" ? "Nacht" : null; return shift === "ochtend" ? n + " dag" : shift === "middag" ? n + " avond" : null; }
function pinFor(routeName){ for (const pin in CONFIG.routePins) { const n = CONFIG.routePins[pin]; if (routeName === "Nacht" && pin === "5558") return pin; if (routeName === n + " dag" || routeName === n + " avond") return pin; } return null; }
function scansFor(date, shiftKey){ return (DATA.scans||[]).filter(s => s.op_date === date && (!shiftKey || s.dienst === shiftKey)); }
function scanStats(date, dienst, routeName){
  const pin = pinFor(routeName); if (!pin || !date) return null;
  const shiftKey = SHIFT_KEY[dienst] || (routeName.endsWith("avond") ? "middag" : routeName === "Nacht" ? "nacht" : "ochtend");
  const def = getRouteDef(pin, shiftKey); if (!def || !def.winkels) return null;
  const sc = scansFor(date, shiftKey).filter(s => s.pin === pin);
  if (!sc.length && !scansFor(date, null).length) return null;
  const missed = [], done = [];
  def.winkels.forEach(w => { const hit = sc.some(s => matches(s.shop, w.n) && !isLiftScan(s.shop)); (hit ? done : missed).push(w.n); });
  return { pin, expected: def.winkels.length, done: done.length, missed, doneList: done, scans: sc.length };
}
function renderScans(){
  const dates = [...new Set((DATA.scans||[]).map(s=>s.op_date))].sort();
  const dEl = document.getElementById("scan-date");
  if (!dEl.value) dEl.value = dates[dates.length-1] || iso(TODAY);
  const date = dEl.value, shiftF = document.getElementById("scan-shift").value;
  document.getElementById("scan-status").textContent = dates.length ? `${(DATA.scans||[]).length} scans geladen, ${fmt(dates[0])} t/m ${fmt(dates[dates.length-1])} (laatste ${CONFIG.scanDays} dagen).` : "Nog geen scans. Lees de EcoSmart-export in (xlsx of csv).";
  const rows = [];
  for (const pin of ROUTE_ORDER) for (const sk of ["ochtend","middag","nacht"]) {
    if (shiftF && sk !== shiftF) continue;
    const rn = routeNameFor(pin, sk); if (!rn) continue;
    const st = scanStats(date, SHIFT_NL[sk], rn); if (!st) continue;
    rows.push({ pin, sk, rn, ...st, dr: (DATA.dienstrapport||[]).find(r => r.datum===date && r.dienst===SHIFT_NL[sk] && r.route===rn) });
  }
  const exp = rows.reduce((a,r)=>a+r.expected,0), done = rows.reduce((a,r)=>a+r.done,0);
  const k = [["Winkels gescand", exp?Math.round(done/exp*100)+"%":"–", exp?({ok:"green",warn:"amber",bad:"red"})[pctClass(Math.round(done/exp*100))]:""], ["Gescand / verwacht", `${done} / ${exp}`, ""], ["Niet gescand", exp-done, exp-done?"red":""], ["Routes onder norm", rows.filter(r=>r.expected&&r.done/r.expected*100<CONFIG.scanTarget).length, ""], ["Scans deze dag", scansFor(date,null).length, ""]];
  document.getElementById("scan-kpis").innerHTML = k.map(([l,v,c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
  document.getElementById("scan-body").innerHTML = rows.length ? rows.map(r => { const p = r.expected?Math.round(r.done/r.expected*100):0; return `
    <div class="scan-route"><div class="hd"><span class="dienst ${r.sk}">${SHIFT_NL[r.sk]}</span><h3>${r.rn}</h3><span class="prog"><span class="track"><span class="fill" style="width:${p}%;background:${p>=CONFIG.scanTarget?"var(--green)":p>=CONFIG.scanTarget-10?"var(--amber)":"var(--red)"}"></span></span><span class="num">${r.done}/${r.expected}</span></span><span class="pct ${pctClass(p)}">${p}%</span>
      <span class="spacer"></span>${r.dr ? `<span class="st ${r.dr.status==="Te bevestigen"?"amber":"green"}"><i></i>Dienstrapport: ${r.dr.status||"ingevuld"}${r.dr.medewerker?" · "+r.dr.medewerker:""}</span>` : `<span class="st grey"><i></i>Nog geen dienstrapport</span>`}</div>
      ${r.missed.length ? `<details><summary>${r.missed.length} winkels niet gescand</summary><div class="shops">${r.missed.map(m=>`<span class="shop">${m}</span>`).join("")}</div></details>` : `<div class="sub" style="margin-top:6px">Alle winkels gescand.</div>`}
    </div>`; }).join("") : `<div class="empty">Geen scans voor ${fmt(date)}. Kies een andere datum of lees een export in.</div>`;
}
document.getElementById("scan-date").onchange = renderScans;
document.getElementById("scan-shift").onchange = renderScans;
document.getElementById("scan-file").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const st = document.getElementById("scan-status"); st.textContent = "Bestand lezen…";
  try {
    let scans;
    if (/\.xlsx?$/i.test(f.name)) { const wb = XLSX.read(await f.arrayBuffer(), {type:"array", cellDates:true}); const ws = wb.Sheets[wb.SheetNames[0]]; ECO_ROWS = ecoRowsFromMatrix(XLSX.utils.sheet_to_json(ws, {header:1, raw:false})); ecoConvert(); scans = ECO_CONVERTED; }
    else { const txt = await f.text(); if (isEcoSmartText(txt)) { ECO_ROWS = ecoParseCSV(txt); ecoConvert(); scans = ECO_CONVERTED; } else scans = parse(txt); }
    scans = (scans||[]).filter(s => s.pin !== "0000" && s.pin !== "9999");
    reassignPinsByShopName(scans);
    if (!scans.length) throw new Error("Geen scans herkend in dit bestand.");
    const rows = scans.map(s => ({ ts: s.ts.toISOString(), shop: s.shop, pin: s.pin, note: s.note||"", op_date: getOpDate(s.ts), dienst: getShift(s.ts) }));
    for (let i = 0; i < rows.length; i += 500) { st.textContent = `Opslaan… ${Math.min(i+500, rows.length)}/${rows.length}`; const { error } = await SB.from("scans").upsert(rows.slice(i, i+500), { onConflict: "ts,shop,pin", ignoreDuplicates: true }); if (error) throw error; }
    const dates = [...new Set(rows.map(r=>r.op_date))].sort();
    toast(`${rows.length} scans ingelezen (${fmt(dates[0])} t/m ${fmt(dates[dates.length-1])})`);
    await load(); document.getElementById("scan-date").value = dates[dates.length-1]; renderScans();
  } catch (err) { st.textContent = "Inlezen mislukt: " + (err.message||err); }
  e.target.value = "";
};
document.getElementById("scan-gen").onclick = async () => {
  const date = document.getElementById("scan-date").value; if (!date) return;
  let n = 0, skipped = 0;
  for (const pin of ROUTE_ORDER) for (const sk of ["ochtend","middag","nacht"]) {
    const rn = routeNameFor(pin, sk); if (!rn) continue;
    const st = scanStats(date, SHIFT_NL[sk], rn); if (!st) continue;
    const existing = (DATA.dienstrapport||[]).find(r => r.datum===date && r.dienst===SHIFT_NL[sk] && r.route===rn);
    if (existing && existing.status !== "Te bevestigen") { skipped++; continue; }
    const row = { ...(existing||{}), datum: date, dienst: SHIFT_NL[sk], route: rn, doel: String(st.expected), gehaald: String(st.done), gemist: st.missed.join("|"), status: "Te bevestigen", voorman: existing ? existing.voorman : "" };
    const res = await post("upsert", { tab: "dienstrapport", keys: KEYS.dienstrapport, row }); if (res.error) { toast("Mislukt: " + res.error); return; }
    upsertLocal(DATA.dienstrapport = DATA.dienstrapport||[], row, KEYS.dienstrapport); n++;
  }
  toast(`${n} dienstrapporten aangemaakt of bijgewerkt${skipped?`, ${skipped} al bevestigd en overgeslagen`:""}`);
  renderScans();
};

/* ============ OVERZICHT (home) ============ */
function renderHome(){
  const all = actieve().map(build);
  const red = all.filter(x=>x.status==="red").length, amber = all.filter(x=>x.status==="amber").length;
  const inc30 = withFreq(DATA.incidenten||[]).filter(i => String(i.datum) >= d(-30));
  const alerts = incidentAlerts(DATA.incidenten||[]);
  const ds = dsRows(); const week = ds.filter(r => String(r.datum) >= d(-7)); const wd = week.reduce((a,r)=>a+r.doel,0), wg = week.reduce((a,r)=>a+r.gehaald,0);
  const tbv = ds.filter(r => r.status === "Te bevestigen").length;
  const oa = openActies();
  const yest = d(-1); const missing = CONFIG.routes.slice(0, CONFIG.coreRoutes).filter(rn => !ds.some(r => r.datum===yest && r.route===rn));
  const evOpen = all.reduce((s,x)=>s+x.evs.filter(e=>e.due && !e.e).length,0);
  document.getElementById("home-name").textContent = who() ? ", " + who().split(" ")[0] : "";
  document.getElementById("home-body").innerHTML = `
    <div class="home-grid">
      <div class="home-card" onclick="setView('dienst')"><h3>Scans afgelopen 7 dagen</h3><b style="color:${wd?({ok:"var(--green)",warn:"var(--amber)",bad:"var(--red)"})[pctClass(Math.round(wg/wd*100))]:"var(--ink)"}">${wd?Math.round(wg/wd*100)+"%":"–"}</b><div class="sub">${wd?`${wg} van ${wd} winkels gescand · norm ${CONFIG.scanTarget}%`:"nog geen dienstrapporten"}</div></div>
      <div class="home-card" onclick="dsFilter='bevestig';setView('dienst')"><h3>Dienstrapporten te bevestigen</h3><b style="color:${tbv?"var(--amber)":"var(--ink)"}">${tbv}</b><div class="sub">${missing.length && ds.length ? `${missing.length} routes zonder rapport voor ${fmt(yest)}` : "alle routes van gisteren gerapporteerd"}</div></div>
      <div class="home-card" onclick="setView('dienst')"><h3>Aanspreekpunten kantoor</h3><b style="color:${oa.length?"var(--red)":"var(--ink)"}">${oa.length}</b><div class="sub">${oa.length?[...new Set(oa.map(r=>r.medewerker||r.route))].slice(0,4).join(" · "):"niets open"}</div></div>
      <div class="home-card" onclick="filter='red';setView('onb')"><h3>Medewerkers actie nodig</h3><b style="color:${red?"var(--red)":"var(--ink)"}">${red}</b><div class="sub">${amber} aandacht · ${evOpen} evaluaties open</div></div>
      <div class="home-card" onclick="setView('inc')"><h3>Incidenten 30 dagen</h3><b>${inc30.length}</b><div class="sub">${inc30.filter(i=>incClass(i.incident)==="noshow").length} no-show · ${inc30.filter(i=>incClass(i.incident)==="telaat").length} te laat · ${inc30.filter(i=>incClass(i.incident)==="ziek").length} ziek</div></div>
      <div class="home-card" onclick="setView('inc')"><h3>Signalering herhalers</h3><b style="color:${alerts.length?"var(--red)":"var(--ink)"}">${alerts.length}</b><div class="sub">${alerts.length?alerts.slice(0,3).map(a=>a.naam).join(" · "):"niemand valt op"}</div></div>
    </div>
    ${oa.length ? `<div class="home-list"><h3 style="font-size:13px;margin:12px 0 4px">Aanspreekpunten vanuit kantoor</h3>${oa.slice(0,6).map(r=>`<div class="tb"><span><b>${r.medewerker||"–"}</b> · ${r.route} · ${fmt(r.datum)}<span class="sub">${r.kantoor||""}</span></span><span class="act" style="color:var(--red);font-weight:500">${r.actie}${r.wie?" ("+r.wie+")":""}</span></div>`).join("")}</div>` : ""}
    ${alerts.length ? `<div class="home-list"><h3 style="font-size:13px;margin:12px 0 4px">Signalering incidenten</h3>${alerts.slice(0,6).map(a=>`<div class="tb"><span><b>${a.naam}</b><span class="sub">${a.why.join(" · ")}</span></span><span class="act" style="color:var(--red);font-weight:500">${a.act}</span></div>`).join("")}</div>` : ""}`;
}
document.getElementById("home-ds").onclick = () => document.getElementById("dsBtn").onclick();
document.getElementById("home-inc").onclick = () => openModal("inc");

/* ============ AUTH (Supabase) ============ */
window.SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.PROFILE = null;
async function showApp(session){
  const { data: prof } = await SB.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  PROFILE = { id: session.user.id, email: session.user.email, naam: prof ? prof.naam : "", rol: prof ? prof.rol : "voorman" };
  document.getElementById("user-name").textContent = PROFILE.naam || PROFILE.email; document.getElementById("user-role").textContent = PROFILE.rol === "kantoor" ? "Kantoor" : "Voorman";
  document.getElementById("login").style.display = "none"; document.getElementById("app").style.display = "flex";
  await load(); setView("home");
}
document.getElementById("login-form").onsubmit = async e => {
  e.preventDefault(); const btn = document.getElementById("login-btn"), err = document.getElementById("login-err"); btn.disabled = true; err.textContent = "";
  const { data, error } = await SB.auth.signInWithPassword({ email: document.getElementById("login-email").value.trim(), password: document.getElementById("login-pw").value });
  btn.disabled = false;
  if (error) { err.textContent = /Invalid login/i.test(error.message) ? "E-mail of wachtwoord klopt niet." : error.message; return; }
  showApp(data.session);
};
document.getElementById("logout").onclick = async () => { await SB.auth.signOut(); location.reload(); };
document.getElementById("reload").onclick = load;
SB.auth.getSession().then(({ data }) => { if (data.session) showApp(data.session); else document.getElementById("login").style.display = "flex"; });

/* ============ MAIL ============ */
function renderMail(){
  const g = document.getElementById("mail-grid"); if (!g) return;
  const rows = (DATA.mail_ontvangers||[]).filter(r => r.actief !== false);
  g.innerHTML = `<span class="h">Naam</span><span class="h">E-mail</span><span class="h">Dagrapport</span><span class="h">Onder norm</span><span class="h">Aanspreekpunt</span><span class="h"></span>` + rows.map(r => `<span>${r.naam||""}</span><span class="sub">${r.email}</span><input type="checkbox" data-e="${r.email}" data-k="dagrapport" ${r.dagrapport?"checked":""}><input type="checkbox" data-e="${r.email}" data-k="onder_norm" ${r.onder_norm?"checked":""}><input type="checkbox" data-e="${r.email}" data-k="aanspreekpunt" ${r.aanspreekpunt?"checked":""}><button class="lnk mail-del" data-e="${r.email}">weg</button>`).join("");
  g.querySelectorAll("input[type=checkbox]").forEach(c => c.onchange = async () => { const r = rows.find(x => x.email === c.dataset.e); r[c.dataset.k] = c.checked; const { error } = await SB.from("mail_ontvangers").upsert(r, { onConflict: "email" }); toast(error ? "Opslaan mislukt: " + error.message : "Mailvoorkeur opgeslagen"); });
  g.querySelectorAll(".mail-del").forEach(b => b.onclick = async () => { if (!confirm(`${b.dataset.e} verwijderen als ontvanger?`)) return; const { error } = await SB.from("mail_ontvangers").delete().eq("email", b.dataset.e); if (error) return toast("Mislukt: " + error.message); DATA.mail_ontvangers = DATA.mail_ontvangers.filter(x => x.email !== b.dataset.e); renderMail(); });
}
document.getElementById("mail-add").onclick = async () => {
  const r = { email: v("mail-email").toLowerCase(), naam: v("mail-naam"), dagrapport: document.getElementById("mail-dag").checked, onder_norm: document.getElementById("mail-norm").checked, aanspreekpunt: document.getElementById("mail-actie").checked, actief: true };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return toast("Vul een geldig e-mailadres in.");
  const { error } = await SB.from("mail_ontvangers").upsert(r, { onConflict: "email" }); if (error) return toast("Mislukt: " + error.message);
  upsertLocal(DATA.mail_ontvangers = DATA.mail_ontvangers||[], r, ["email"]); ["mail-email","mail-naam"].forEach(id => document.getElementById(id).value = ""); renderMail(); toast(`${r.email} toegevoegd`);
};
document.getElementById("mail-test").onclick = async () => {
  const st = document.getElementById("mail-status"); st.textContent = "Versturen\u2026";
  try { const { data: { session } } = await SB.auth.getSession(); const r = await fetch(`${SUPABASE_URL}/functions/v1/send-mail`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ type: "dagrapport", datum: document.getElementById("r-tot").value || undefined }) }); const j = await r.json(); st.textContent = j.error ? "Mislukt: " + j.error : (j.skipped ? "Niet verstuurd: " + j.skipped : "Dagrapport verstuurd (" + fmt(document.getElementById("r-tot").value || d(-1)) + ")"); }
  catch (e) { st.textContent = "Mislukt: " + e.message; }
};
