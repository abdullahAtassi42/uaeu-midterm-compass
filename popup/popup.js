const $ = selector => document.querySelector(selector);
const fmt = date => new Intl.DateTimeFormat("en-AE", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));

async function render() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const events = (state.events || []).filter(event => new Date(`${event.date}T23:59:59`) >= new Date()).slice(0, 3);
  $("#count").textContent = events.length ? `${events.length} upcoming midterm${events.length === 1 ? "" : "s"}` : "Your midterm map";
  $("#summary").textContent = events.length ? "Dates found in your Blackboard pages. Always verify low-confidence items." : "Open Blackboard Messages, then scan the page.";
  $("#lastScan").textContent = state.lastScan ? `Scanned ${new Date(state.lastScan).toLocaleDateString("en-AE")}` : "Not scanned yet";
  $("#events").innerHTML = events.length ? events.map(event => {
    const date = new Date(`${event.date}T12:00:00`);
    return `<article class="event"><div class="date">${date.toLocaleString("en", { month:"short" })}<strong>${date.getDate()}</strong></div><div><span class="badge ${event.confidence < .75 ? "low" : ""}">${Math.round(event.confidence * 100)}% confidence</span><h3>${escapeHtml(event.course)}</h3><p class="muted">${escapeHtml(event.title)}${event.time ? ` · ${event.time}` : ""}</p></div></article>`;
  }).join("") : `<div class="empty">No midterms saved yet.</div>`;
}
function escapeHtml(text) { const el = document.createElement("span"); el.textContent = text || ""; return el.innerHTML; }
$("#scan").addEventListener("click", async () => {
  $("#scan").disabled = true; $("#status").textContent = "Reading visible Blackboard messages…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!/^https:\/\/(elearning\.uaeu\.ac\.ae|uaeu\.blackboard\.com)\//.test(tab?.url || "")) throw new Error("Open a UAEU Blackboard page first.");
    const result = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_PAGE" });
    if (!result.ok) throw new Error(result.error);
    $("#status").textContent = result.detected ? `Found ${result.detected}; ${result.added} added.` : "No dated midterms found on this page.";
    await render();
  } catch (error) { $("#status").textContent = error.message; }
  finally { $("#scan").disabled = false; }
});
$("#scanAll").addEventListener("click", async () => {
  $("#scanAll").disabled = true; $("#status").textContent = "Scanning each current course. Keep this tab open…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!/^https:\/\/uaeu\.blackboard\.com\/ultra\/messages\/?$/.test(tab?.url || "")) throw new Error("Open Blackboard’s main Messages page first.");
    const result = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_ALL_COURSES" });
    if (!result.ok) throw new Error(result.error);
    $("#status").textContent = `Checked ${result.courses} courses; found ${result.detected}, added ${result.added}.${result.errors.length ? ` ${result.errors.length} could not be read.` : ""}`;
    await render();
  } catch (error) { $("#status").textContent = error.message; }
  finally { $("#scanAll").disabled = false; }
});
$("#schedule").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_SCHEDULE" }));
$("#export").addEventListener("click", () => chrome.runtime.sendMessage({ type: "EXPORT_ICS" }));
$("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
render();
