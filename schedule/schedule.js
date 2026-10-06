const $ = selector => document.querySelector(selector);
let events = [];
let courses = [];
const escapeHtml = text => { const el=document.createElement("span"); el.textContent=text||""; return el.innerHTML; };

async function load() {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    $("#runtimeNotice").hidden = false;
    $("#export").disabled = true; $("#add").disabled = true;
    render(); return;
  }
  const state = await chrome.runtime.sendMessage({ type:"GET_STATE" }); events = state.events || []; courses = state.courses || []; render();
}
function render() {
  const query = $("#search").value.toLowerCase(); const view = $("#view").value; const now = new Date(); now.setHours(0,0,0,0);
  const filteredEvents = events.filter(event => {
    const matches = `${event.course} ${event.title}`.toLowerCase().includes(query);
    if (view === "pending") return false;
    if (view === "upcoming") return matches && new Date(`${event.date}T00:00:00`) >= now;
    if (view === "review") return matches && event.confidence < .75;
    return matches;
  }).sort((a,b) => `${a.date}${a.time||""}`.localeCompare(`${b.date}${b.time||""}`));
  const eventCourses = new Set(events.map(event => event.course.toLowerCase()));
  const pendingCourses = courses.filter(course => course.status === "not-announced" && !eventCourses.has(course.name.toLowerCase()) && course.name.toLowerCase().includes(query));
  const filteredPending = (view === "upcoming" || view === "pending") ? pendingCourses : [];
  const upcoming = events.filter(event => new Date(`${event.date}T00:00:00`) >= now);
  $("#stats").innerHTML = `<div class="stat"><strong>${upcoming.length}</strong><span>announced</span></div><div class="stat"><strong>${pendingCourses.length}</strong><span>not announced</span></div><div class="stat"><strong>${events.filter(e=>e.confidence<.75).length}</strong><span>to review</span></div>`;
  const eventRows = filteredEvents.map(event => {
    const d = new Date(`${event.date}T12:00:00`); const confidence=Math.round(event.confidence*100);
    const revision = event.history?.length ? `<span class="badge">Updated announcement · ${event.history.length} previous version${event.history.length === 1 ? "" : "s"}</span>` : "";
    return `<article class="event-row"><div class="event-date">${d.toLocaleString("en",{month:"short"})}<strong>${d.getDate()}</strong>${d.getFullYear()}</div><div class="event-card"><div><span class="badge ${confidence<75?"low":""}">${confidence}% confidence · ${escapeHtml(event.detectedBy)}</span>${revision}<h3>${escapeHtml(event.course)}</h3><p class="event-meta">${escapeHtml(event.title)}${event.time?` · ${event.time}`:""}${event.location?` · ${escapeHtml(event.location)}`:""}</p>${event.sourceExcerpt?`<p class="excerpt">“${escapeHtml(event.sourceExcerpt)}”</p>`:""}</div><button class="ghost edit" data-id="${event.id}">Edit</button></div></article>`;
  }).join("");
  const pendingRows = filteredPending.map(course => `<article class="event-row pending"><div class="event-date">DATE<strong>—</strong>TBD</div><div class="event-card"><div><span class="badge pending">Awaiting announcement</span><h3>${escapeHtml(course.name)}</h3><p class="event-meta">Midterm date, time, and location not announced yet</p><p class="excerpt">Announcements and Messages were checked on ${new Date(course.lastScanned).toLocaleDateString("en-AE")}. Scan again after your instructor posts an update.</p></div></div></article>`).join("");
  $("#timeline").innerHTML = eventRows || pendingRows ? eventRows + pendingRows : `<div class="empty"><h2>No matching courses</h2><p>Scan Blackboard Messages and Announcements, or add a midterm manually.</p></div>`;
  document.querySelectorAll(".edit").forEach(button => button.addEventListener("click",()=>openEditor(events.find(event=>event.id===button.dataset.id))));
}
function openEditor(event={}) { $("#editorTitle").textContent=event.id?"Review midterm":"Add midterm"; $("#eventId").value=event.id||""; $("#course").value=event.course||""; $("#title").value=event.title||"Midterm exam"; $("#date").value=event.date||""; $("#time").value=event.time||""; $("#location").value=event.location||""; $("#sourceUrl").value=event.sourceUrl||""; $("#delete").hidden=!event.id; $("#editor").showModal(); }
$("#save").addEventListener("click",async event=>{ event.preventDefault(); if(!$("#course").value||!$("#title").value||!$("#date").value) return $("#editor").querySelector("form").reportValidity(); const old=events.find(e=>e.id===$("#eventId").value)||{}; await chrome.runtime.sendMessage({type:"SAVE_EVENT",event:{...old,id:old.id||`evt_${crypto.randomUUID()}`,course:$("#course").value,title:$("#title").value,date:$("#date").value,time:$("#time").value||null,location:$("#location").value,sourceUrl:$("#sourceUrl").value,sourceLabel:old.sourceLabel||"Manual entry",sourceExcerpt:old.sourceExcerpt||"",confidence:1,detectedBy:"manual",durationMinutes:old.durationMinutes||60,createdAt:old.createdAt||new Date().toISOString()}}); $("#editor").close(); load(); });
$("#delete").addEventListener("click",async()=>{ if(confirm("Remove this midterm from the schedule?")){ await chrome.runtime.sendMessage({type:"DELETE_EVENT",id:$("#eventId").value}); $("#editor").close(); load(); }});
$("#add").addEventListener("click",()=>openEditor()); $("#export").addEventListener("click",()=>chrome.runtime?.sendMessage({type:"EXPORT_ICS"})); $("#search").addEventListener("input",render); $("#view").addEventListener("change",render); if(globalThis.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener(load); load();
