(function () {
  "use strict";
  const BUTTON_ID = "midterm-compass-launcher";

  function courseName() {
    const candidates = [
      "a[href*='/ultra/courses/'][href$='/outline']", '[data-automation-id="course-title"]', "[class*='course-title']", "h1",
      "[aria-label*='course' i] h2", "title"
    ];
    for (const selector of candidates) {
      const node = selector === "title" ? document.querySelector("title") : document.querySelector(selector);
      const text = node?.textContent?.trim();
      if (text && text.length < 160) return text.replace(/^.*?\s+•\s+/, "").replace(/\s+–\s+Blackboard.*$/i, "");
    }
    return "Blackboard course";
  }

  function collectDocuments() {
    const selectors = [
      "li.message-card", "article", "[role='article']", "[data-automation-id*='message']", "[data-automation-id*='announcement']",
      ".latest-message", "[class*='message-body']", "[class*='announcement']", "main [role='listitem']"
    ];
    const nodes = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))];
    const course = courseName();
    const documents = nodes.map((node, index) => ({
      course,
      text: node.innerText?.replace(/\s+/g, " ").trim(),
      sourceUrl: location.href,
      sourceLabel: node.getAttribute("aria-label") || node.querySelector("h1,h2,h3,h4")?.textContent?.trim() || `Blackboard item ${index + 1}`
    })).filter(item => item.text && item.text.length >= 20 && item.text.length <= 12000);
    if (!documents.length && document.body?.innerText) {
      documents.push({ course, text: document.body.innerText.slice(0, 30000), sourceUrl: location.href, sourceLabel: document.title });
    }
    const unique = new Map(documents.map(item => [item.text.slice(0, 500), item]));
    return [...unique.values()].slice(0, 150);
  }

  async function scan(showToast = true) {
    const documents = collectDocuments();
    const response = await chrome.runtime.sendMessage({ type: "PROCESS_DOCUMENTS", documents });
    if (response.ok && showToast) toast(response.detected ? `Found ${response.detected} possible midterm${response.detected === 1 ? "" : "s"}.` : "No dated midterms found on this page.");
    return response;
  }

  function currentTermToken() {
    const now = new Date(); const month = now.getMonth() + 1;
    const term = month >= 8 ? "Fall" : month <= 5 ? "Spring" : "Summer";
    return `${term}_${now.getFullYear()}`;
  }

  function waitFor(test, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const value = test();
        if (value) resolve(value);
        else if (Date.now() - started > timeout) reject(new Error("Blackboard took too long to load a course."));
        else setTimeout(tick, 180);
      };
      tick();
    });
  }

  async function scanAllCurrentCourses() {
    if (!/^\/ultra\/messages\/?$/.test(location.pathname)) throw new Error("Open Blackboard’s main Messages page first.");
    const term = currentTermToken();
    const summaries = [...document.querySelectorAll("bb-course-conversations-summary")]
      .filter(node => node.innerText.includes(term) && node.querySelector("a[analytics-id*='goToCourseMessages']"))
      .map(node => ({ node, name: node.querySelector("h2")?.innerText?.replace(/with \d+ unread messages?/i, "").trim() || "Course" }));
    if (!summaries.length) throw new Error(`No ${term.replace("_", " ")} courses were found on this page.`);
    let detected = 0; let added = 0; const errors = [];
    for (let index = 0; index < summaries.length; index += 1) {
      const summary = document.querySelectorAll("bb-course-conversations-summary");
      const current = [...summary].find(node => node.innerText.includes(term) && node.innerText.includes(summaries[index].name.split(" with ")[0]));
      const link = current?.querySelector("a[analytics-id*='goToCourseMessages']");
      if (!link) { errors.push(summaries[index].name); continue; }
      link.click();
      try {
        await waitFor(() => /\/ultra\/courses\/[^/]+\/messages/.test(location.pathname) && document.querySelector(".message-cards"));
        const result = await chrome.runtime.sendMessage({ type: "PROCESS_DOCUMENTS", documents: collectDocuments() });
        detected += result.detected || 0; added += result.added || 0;
      } catch (error) { errors.push(summaries[index].name); }
      history.back();
      await waitFor(() => /^\/ultra\/messages\/?$/.test(location.pathname) && document.querySelector("bb-course-conversations-summary"));
    }
    return { ok: true, courses: summaries.length, detected, added, errors };
  }

  function toast(message) {
    document.getElementById("midterm-compass-toast")?.remove();
    const el = document.createElement("div"); el.id = "midterm-compass-toast"; el.textContent = message;
    document.documentElement.appendChild(el); setTimeout(() => el.remove(), 4200);
  }

  function addButton() {
    if (document.getElementById(BUTTON_ID) || !document.body) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID; button.type = "button"; button.title = "Scan this Blackboard page for midterm dates";
    button.innerHTML = `<span aria-hidden="true">✓</span><span>Midterm Compass</span>`;
    button.addEventListener("click", async () => {
      button.classList.add("is-scanning"); button.lastElementChild.textContent = "Scanning…";
      try { await scan(); } catch (error) { toast(`Could not scan: ${error.message}`); }
      finally { button.classList.remove("is-scanning"); button.lastElementChild.textContent = "Midterm Compass"; }
    });
    document.body.appendChild(button);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SCAN_PAGE") scan(false).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    else if (message.type === "SCAN_ALL_COURSES") scanAllCurrentCourses().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    else if (message.type === "GET_PAGE_INFO") sendResponse({ ok: true, course: courseName(), documents: collectDocuments().length });
    return true;
  });

  addButton();
  new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
})();
