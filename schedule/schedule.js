const $ = selector => document.querySelector(selector);
let events = [];
const escapeHtml = text => { const el=document.createElement("span"); el.textContent=text||""; return el.innerHTML; };

async function load() { const state = await chrome.runtime.sendMessage({ type:"GET_STATE" }); events = state.events || []; render(); }
function render() {
  const query = $("#search").value.toLowerCase(); const view = $("#view").value; const now = new Date(); now.setHours(0,0,0,0);
  const filtered = events.filter(event => {
    const matches = `${event.course} ${event.title}`.toLowerCase().includes(query);
    if (view === "upcoming") return matches && new Date(`${event.date}T00:00:00`) >= now;
    if (view === "review") return matches && event.confidence < .75;
    return matches;
  }).sort((a,b) => `${a.date}${a.time||""}`.localeCompare(`${b.date}${b.time||""}`));
  const upcoming = events.filter(event => new Date(`${event.date}T00:00:00`) >= now);
  $("#stats").innerHTML = `<div class="stat"><strong>${upcoming.length}</strong><span>upcoming</span></div><div class="stat"><strong>${events.filter(e=>e.confidence<.75).length}</strong><span>to review</span></div>`;
  $("#timeline").innerHTML = filtered.length ? filtered.map(event => {
    const d = new Date(`${event.date}T12:00:00`); const confidence=Math.round(event.confidence*100);
    return `<article class="event-row"><div class="event-date">${d.toLocaleString("en",{month:"short"})}<strong>${d.getDate()}</strong>${d.getFullYear()}</div><div class="event-card"><div><span class="badge ${confidence<75?"low":""}">${confidence}% confidence · ${escapeHtml(event.detectedBy)}</span><h3>${escapeHtml(event.course)}</h3><p class="event-meta">${escapeHtml(event.title)}${event.time?` · ${event.time}`:""}${event.location?` · ${escapeHtml(event.location)}`:""}</p>${event.sourceExcerpt?`<p class="excerpt">“${escapeHtml(event.sourceExcerpt)}”</p>`:""}</div><button class="ghost edit" data-id="${event.id}">Edit</button></div></article>`;
  }).join("") : `<div class="empty"><h2>No matching midterms</h2><p>Scan a Blackboard Messages or Announcements page, or add one manually.</p></div>`;
  document.querySelectorAll(".edit").forEach(button => button.addEventListener("click",()=>openEditor(events.find(event=>event.id===button.dataset.id))));
}
function openEditor(event={}) { $("#editorTitle").textContent=event.id?"Review midterm":"Add midterm"; $("#eventId").value=event.id||""; $("#course").value=event.course||""; $("#title").value=event.title||"Midterm exam"; $("#date").value=event.date||""; $("#time").value=event.time||""; $("#location").value=event.location||""; $("#sourceUrl").value=event.sourceUrl||""; $("#delete").hidden=!event.id; $("#editor").showModal(); }
$("#save").addEventListener("click",async event=>{ event.preventDefault(); if(!$("#course").value||!$("#title").value||!$("#date").value) return $("#editor").querySelector("form").reportValidity(); const old=events.find(e=>e.id===$("#eventId").value)||{}; await chrome.runtime.sendMessage({type:"SAVE_EVENT",event:{...old,id:old.id||`evt_${crypto.randomUUID()}`,course:$("#course").value,title:$("#title").value,date:$("#date").value,time:$("#time").value||null,location:$("#location").value,sourceUrl:$("#sourceUrl").value,sourceLabel:old.sourceLabel||"Manual entry",sourceExcerpt:old.sourceExcerpt||"",confidence:1,detectedBy:old.id?old.detectedBy:"manual",durationMinutes:old.durationMinutes||60,createdAt:old.createdAt||new Date().toISOString()}}); $("#editor").close(); load(); });
$("#delete").addEventListener("click",async()=>{ if(confirm("Remove this midterm from the schedule?")){ await chrome.runtime.sendMessage({type:"DELETE_EVENT",id:$("#eventId").value}); $("#editor").close(); load(); }});
$("#add").addEventListener("click",()=>openEditor()); $("#export").addEventListener("click",()=>chrome.runtime.sendMessage({type:"EXPORT_ICS"})); $("#search").addEventListener("input",render); $("#view").addEventListener("change",render); chrome.storage.onChanged.addListener(load); load();
