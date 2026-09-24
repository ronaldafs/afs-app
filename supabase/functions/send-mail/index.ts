// Supabase Edge Function: send-mail
// Verstuurt (1) direct een mail bij een bevestigd dienstrapport onder de norm of een kantoor-aanspreekpunt (database webhook)
// en (2) een dagrapport (cron of knop in de app). Mail gaat via Resend (https://resend.com).
//
// Mailt ook automatisch een shiftrapport zodra de voorman alle routes van een dienst heeft bevestigd,
// en na de avonddienst het dagrapport van de hele dag (elke mail maximaal één keer, via mail_log).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   = re_xxx
//   MAIL_FROM        = "AFS Operatie Schiphol <operatie@jouwdomein.nl>"   (domein geverifieerd in Resend)
//   SCAN_TARGET      = 95   (optioneel)
//   SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn standaard aanwezig.

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TARGET = Number(Deno.env.get("SCAN_TARGET") || 95);
const FROM = Deno.env.get("MAIL_FROM") || "AFS Operatie Schiphol <onboarding@resend.dev>";

const fmt = (s?: string | null) => s ? new Date(s).toLocaleDateString("nl-NL", { day: "numeric", month: "long" }) : "–";
const pct = (r: any) => { const d = +r.doel || 0, g = +r.gehaald || 0; return d ? Math.round(g / d * 100) : null; };
const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const chip = (t: string, bg: string, c: string) => `<span style="display:inline-block;font-size:12px;padding:2px 9px;border-radius:999px;background:${bg};color:${c};margin:2px 4px 2px 0">${esc(t)}</span>`;
const scoreChip = (p: number | null) => p === null ? "–" : chip(p + "%", p >= TARGET ? "#E6F4EC" : p >= TARGET - 10 ? "#FBF1DC" : "#FBE7E7", p >= TARGET ? "#1F8A5B" : p >= TARGET - 10 ? "#B7791F" : "#C62828");

const SHIFT_ROUTES: Record<string, string[]> = { Ochtend: ["Lounge 1 dag","Lounge 2 dag","Lounge 3 dag","Plaza dag","KLM dag"], Middag: ["Lounge 1 avond","Lounge 2 avond","Lounge 3 avond","Plaza avond","KLM avond"], Nacht: ["Nacht"] };
async function recipients(kind: "dagrapport" | "onder_norm" | "aanspreekpunt" | "shiftrapport") {
  const { data } = await sb.from("mail_ontvangers").select("*").eq(kind, true).eq("actief", true);
  return (data || []).map(r => r.email);
}
async function send(to: string[], subject: string, html: string) {
  if (!to.length) return { skipped: "geen ontvangers" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html: layout(html) }),
  });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j;
}
const layout = (inner: string) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#17203A;max-width:680px;margin:0 auto;padding:24px">
  <div style="font-weight:700;font-size:13px;color:#6B7280;letter-spacing:.04em;text-transform:uppercase;margin-bottom:12px">AFS · Operatie Schiphol · Renewi</div>${inner}
  <p style="font-size:12px;color:#9AA3B0;margin-top:28px">Automatisch verstuurd vanuit het dashboard. Ontvangers beheer je onder Rapportage → Mail.</p></div>`;

function rapportHtml(r: any) {
  const p = pct(r); const gemist = (r.gemist || "").split("|").filter(Boolean);
  return `<table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><td style="padding:6px 0;color:#6B7280;width:150px">Route</td><td style="padding:6px 0"><b>${esc(r.route)}</b> · ${esc(r.dienst)} · ${fmt(r.datum)}</td></tr>
    <tr><td style="padding:6px 0;color:#6B7280">Medewerker</td><td style="padding:6px 0">${esc(r.medewerker || "–")}</td></tr>
    <tr><td style="padding:6px 0;color:#6B7280">Gescand</td><td style="padding:6px 0">${esc(r.gehaald)} van ${esc(r.doel)} ${scoreChip(p)}</td></tr>
    ${gemist.length ? `<tr><td style="padding:6px 0;color:#6B7280;vertical-align:top">Niet gescand</td><td style="padding:6px 0">${gemist.map(g => chip(g, "#FBE7E7", "#C62828")).join("")}</td></tr>` : ""}
    <tr><td style="padding:6px 0;color:#6B7280">Reden</td><td style="padding:6px 0">${esc(r.reden || "–")}</td></tr>
    ${r.opmerking ? `<tr><td style="padding:6px 0;color:#6B7280">Opmerking voorman</td><td style="padding:6px 0">${esc(r.opmerking)}</td></tr>` : ""}
    <tr><td style="padding:6px 0;color:#6B7280">Voorman</td><td style="padding:6px 0">${esc(r.voorman || "–")}</td></tr>
    ${r.kantoor ? `<tr><td style="padding:6px 0;color:#6B7280;vertical-align:top">Kantoor</td><td style="padding:6px 0">${esc(r.kantoor)}${r.actie ? `<br><b style="color:#C62828">Actie: ${esc(r.actie)}${r.wie ? " · " + esc(r.wie) : ""}</b>` : ""}</td></tr>` : ""}
  </table>`;
}

async function alreadySent(datum: string, dienst: string, type: string) {
  const { data } = await sb.from("mail_log").select("id").eq("datum", datum).eq("dienst", dienst).eq("type", type).maybeSingle();
  if (data) return true;
  await sb.from("mail_log").insert({ datum, dienst, type });
  return false;
}
async function shiftrapport(datum: string, dienst: string) {
  const { data: rows } = await sb.from("dienstrapport").select("*").eq("datum", datum).eq("dienst", dienst);
  const rs = rows || []; const doel = rs.reduce((a, r) => a + (+r.doel || 0), 0), gehaald = rs.reduce((a, r) => a + (+r.gehaald || 0), 0);
  const total = doel ? Math.round(gehaald / doel * 100) : null;
  const onder = rs.filter(r => pct(r) !== null && pct(r)! < TARGET);
  const html = `<h2 style="margin:0 0 4px;font-size:20px">${esc(dienst)}dienst ${fmt(datum)} afgerond</h2>
    <p style="margin:0 0 18px;color:#6B7280">Alle routes zijn bevestigd door de voorman. Scans: <b style="color:#17203A">${gehaald} van ${doel}</b> bezoeken ${scoreChip(total)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">${rs.sort((a, b) => a.route.localeCompare(b.route)).map(r => `<tr style="border-bottom:1px solid #E4E8EF"><td style="padding:6px 8px 6px 0"><b>${esc(r.route)}</b></td><td style="padding:6px 8px 6px 0">${esc(r.medewerker || "–")}</td><td style="padding:6px 8px 6px 0">${esc(r.gehaald)}/${esc(r.doel)}</td><td style="padding:6px 0">${scoreChip(pct(r))}</td><td style="padding:6px 0;color:#6B7280">${esc(r.reden || "")}${r.opmerking ? " · " + esc(r.opmerking) : ""}</td><td style="padding:6px 0;color:#6B7280">${esc(r.voorman || "")}</td></tr>`).join("")}</table>
    ${onder.length ? `<h3 style="font-size:14px;margin:18px 0 8px;color:#C62828">Onder de norm (${onder.length})</h3>${onder.map(rapportHtml).join('<hr style="border:0;border-top:1px solid #E4E8EF;margin:10px 0">')}` : ""}`;
  return send(await recipients("shiftrapport"), `${dienst}dienst ${fmt(datum)} · ${total === null ? "" : total + "% gescand"} · alle routes bevestigd`, html);
}
async function dagrapport(datum?: string) {
  const day = datum || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { data: rows } = await sb.from("dienstrapport").select("*").eq("datum", day);
  const rs = rows || []; const doel = rs.reduce((a, r) => a + (+r.doel || 0), 0), gehaald = rs.reduce((a, r) => a + (+r.gehaald || 0), 0);
  const total = doel ? Math.round(gehaald / doel * 100) : null;
  const onder = rs.filter(r => pct(r) !== null && pct(r)! < TARGET), open = rs.filter(r => r.status === "Te bevestigen"), acties = rs.filter(r => r.actie && r.status !== "Afgerond");
  const { data: inc } = await sb.from("incidenten").select("*").eq("datum", day);
  const html = `<h2 style="margin:0 0 4px;font-size:20px">Dagrapport ${fmt(day)}</h2>
    <p style="margin:0 0 18px;color:#6B7280">Scans: <b style="color:#17203A">${gehaald} van ${doel}</b> winkels ${scoreChip(total)} · ${rs.length} dienstrapporten · ${(inc || []).length} incidenten</p>
    <h3 style="font-size:14px;margin:18px 0 8px">Per route</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px">${rs.sort((a, b) => (a.dienst + a.route).localeCompare(b.dienst + b.route)).map(r => `<tr style="border-bottom:1px solid #E4E8EF"><td style="padding:6px 8px 6px 0">${esc(r.dienst)}</td><td style="padding:6px 8px 6px 0"><b>${esc(r.route)}</b></td><td style="padding:6px 8px 6px 0">${esc(r.medewerker || "–")}</td><td style="padding:6px 8px 6px 0">${esc(r.gehaald)}/${esc(r.doel)}</td><td style="padding:6px 0">${scoreChip(pct(r))}</td><td style="padding:6px 0;color:#6B7280">${esc(r.reden || "")}${r.status === "Te bevestigen" ? chip("niet bevestigd", "#FBF1DC", "#B7791F") : ""}</td></tr>`).join("") || `<tr><td style="padding:6px 0;color:#6B7280">Geen dienstrapporten voor deze dag.</td></tr>`}</table>
    ${onder.length ? `<h3 style="font-size:14px;margin:18px 0 8px;color:#C62828">Onder de norm (${onder.length})</h3>${onder.map(rapportHtml).join('<hr style="border:0;border-top:1px solid #E4E8EF;margin:10px 0">')}` : ""}
    ${acties.length ? `<h3 style="font-size:14px;margin:18px 0 8px;color:#C62828">Open aanspreekpunten (${acties.length})</h3><ul style="margin:0;padding-left:18px">${acties.map(r => `<li><b>${esc(r.medewerker || r.route)}</b> · ${esc(r.route)} · ${esc(r.actie)}${r.wie ? " (" + esc(r.wie) + ")" : ""}</li>`).join("")}</ul>` : ""}
    ${open.length ? `<p style="margin-top:14px;color:#B7791F"><b>${open.length} dienstrapporten zijn nog niet bevestigd door de voorman.</b></p>` : ""}
    ${(inc || []).length ? `<h3 style="font-size:14px;margin:18px 0 8px">Incidenten</h3><ul style="margin:0;padding-left:18px">${(inc || []).map((i: any) => `<li><b>${esc(i.naam)}</b> · ${esc(i.incident)}${i.tijd ? " · " + esc(i.tijd) : ""} · ${esc(i.dienst)}${i.waarschuwing ? " · " + esc(i.waarschuwing) : ""}</li>`).join("")}</ul>` : ""}`;
  return send(await recipients("dagrapport"), `Dagrapport Renewi Schiphol · ${fmt(day)} · ${total === null ? "" : total + "% gescand"}`, html);
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    // 1. Handmatig / cron: {"type":"dagrapport","datum":"2026-09-23"}
    if (body.type === "dagrapport") return Response.json(await dagrapport(body.datum));
    // 2. Database webhook op dienstrapport (INSERT/UPDATE)
    if (body.table === "dienstrapport" && body.record) {
      const r = body.record, old = body.old_record || {};
      const out: any = {};
      const p = pct(r);
      if (r.status === "Bevestigd" && old.status !== "Bevestigd" && p !== null && p < TARGET)
        out.onder_norm = await send(await recipients("onder_norm"), `Route onder de norm: ${r.route} ${r.dienst} ${fmt(r.datum)} · ${p}%`, `<h2 style="margin:0 0 12px;font-size:18px">Dienstrapport onder de norm</h2>${rapportHtml(r)}`);
      if (r.actie && r.status !== "Afgerond" && (r.actie !== old.actie || r.kantoor !== old.kantoor))
        out.aanspreekpunt = await send(await recipients("aanspreekpunt"), `Aanspreekpunt: ${r.medewerker || r.route} · ${r.actie}`, `<h2 style="margin:0 0 12px;font-size:18px">Nieuw aanspreekpunt vanuit kantoor</h2>${rapportHtml(r)}`);
      // Shift compleet? Alle verwachte routes van deze dienst bevestigd → shiftrapport; na de middag-/avonddienst ook het dagrapport van de hele dag.
      if (r.status === "Bevestigd" && old.status !== "Bevestigd" && SHIFT_ROUTES[r.dienst]) {
        const { data: all } = await sb.from("dienstrapport").select("route,status").eq("datum", r.datum).eq("dienst", r.dienst);
        const present = (all || []).filter(x => SHIFT_ROUTES[r.dienst].includes(x.route));
        const complete = present.length >= SHIFT_ROUTES[r.dienst].length && present.every(x => x.status === "Bevestigd");
        if (complete && !(await alreadySent(r.datum, r.dienst, "shift"))) {
          out.shiftrapport = await shiftrapport(r.datum, r.dienst);
          if (r.dienst === "Middag" && !(await alreadySent(r.datum, "dag", "dag"))) out.dagrapport = await dagrapport(r.datum);
        }
      }
      return Response.json(out);
    }
    return Response.json({ ok: true, note: "niets te doen" });
  } catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
});
