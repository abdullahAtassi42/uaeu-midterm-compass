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

  function courseIdentity() {
    const outline = document.querySelector("a[href*='/ultra/courses/'][href$='/outline']");
    const text = outline?.textContent?.replace(/\s+/g, " ").trim() || "";
    const [code = "", ...nameParts] = text.split("•").map(part => part.trim());
    const id = (location.pathname.match(/\/ultra\/courses\/([^/]+)/) || [])[1] || code || courseName();
    const termMatch = code.match(/_(Fall|Spring|Summer)_(\d{4})$/i);
    return {
      id,
      code: code || id,
      name: nameParts.join(" • ") || courseName(),
      term: termMatch ? `${termMatch[1][0].toUpperCase()}${termMatch[1].slice(1).toLowerCase()} ${termMatch[2]}` : "Current term"
    };
  }

  function collectDocuments() {
    const selectors = [
      ".message-card .latest-message", "tr.announcement-item-row", ".announcement-item-row",
      "announcement-list article", "announcement-list [role='listitem']", "[data-automation-id*='announcement']",
      "article", "[role='article']", "[data-automation-id*='message-body']", "[data-automation-id*='announcement-body']",
      "[class*='message-body']", ".announcement-description", "main [role='listitem']"
    ];
    const nodes = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))];
    const course = courseName();
    const documents = nodes.map((node, index) => {
      const container = node.closest(".message-card, tr.announcement-item-row") || node;
      const raw = container.innerText || node.innerText || "";
      const timestamp = raw.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:AM|PM)\b/i)?.[0];
      const published = timestamp ? new Date(timestamp) : null;
      return {
        course,
        text: node.innerText?.replace(/\s+/g, " ").trim(),
        sourceUrl: location.href,
        sourceLabel: node.getAttribute("aria-label") || node.querySelector("h1,h2,h3,h4")?.textContent?.trim() || `Blackboard item ${index + 1}`,
        sourcePublishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null
      };
    }).filter(item => item.text && item.text.length >= 20 && item.text.length <= 12000);
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

  async function runBackgroundPageScan() {
    const params = new URLSearchParams(location.search);
    const page = location.pathname.endsWith("/announcements") ? "announcements" : "messages";
    await waitFor(() => {
      if (page === "messages") return document.querySelector("bb-course-conversations") || document.querySelector("main [role='main']");
      const bodyText = document.body?.innerText || "";
      return document.querySelector("announcement-list .announcement-item-row, announcement-list [role='listitem'], .announcement-item-row, [data-automation-id*='announcement']") ||
        (/announcements/i.test(bodyText) && /\b\d+\s+Total\b|no announcements|no items to show/i.test(bodyText));
    }, 20000).catch(() => null);
    // Even if Blackboard changes its announcement-list component, report an empty
    // result so the service worker can continue to that course's Messages fallback.
    const documents = collectDocuments();
    const result = await chrome.runtime.sendMessage({ type: "PROCESS_DOCUMENTS", documents });
    await chrome.runtime.sendMessage({
      type: "SAVE_AUTO_COURSE_PAGE",
      course: courseIdentity(),
      page,
      detected: result.detected || 0,
      scanMode: params.get("midterm_compass_mode") || "direct"
    });
  }

  function currentTermToken() {
    const now = new Date(); const month = now.getMonth() + 1;
    const term = month >= 8 ? "Fall" : month <= 5 ? "Spring" : "Summer";
    return `${term}_${now.getFullYear()}`;
  }

  let lastHomeScanSignature = "";
  function maybeStartCoursesHomeScan() {
    if (!/^\/ultra\/course\/?$/.test(location.pathname)) return;
    const term = currentTermToken();
    const courses = [...document.querySelectorAll("article[data-course-id]")]
      .filter(article => !article.classList.contains("courseUnavailable"))
      .map(article => {
        const code = article.querySelector(".course-id")?.textContent?.replace(/\s+/g, " ").trim() || "";
        return {
          id: article.dataset.courseId,
          code,
          name: article.querySelector("h4")?.textContent?.replace(/\s+/g, " ").trim() || code || "Course",
          term: term.replace("_", " ")
        };
      })
      .filter(course => course.id && course.code.includes(term));
    if (!courses.length) return;
    const signature = courses.map(course => course.id).sort().join("|");
    if (signature === lastHomeScanSignature) return;
    lastHomeScanSignature = signature;
    chrome.runtime.sendMessage({ type: "START_COURSES_HOME_SCAN", courses }).catch(() => {
      lastHomeScanSignature = "";
    });
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

  async function openCourseMessages(courseCode) {
    const findLink = () => [...document.querySelectorAll("bb-course-conversations-summary")]
      .find(node => node.innerText.includes(courseCode))
      ?.querySelector("a[analytics-id*='goToCourseMessages']");
    findLink()?.click();
    try {
      await waitFor(() => /\/ultra\/courses\/[^/]+\/messages/.test(location.pathname) && document.querySelector("bb-course-conversations"), 2500);
    } catch {
      if (!/^\/ultra\/messages\/?$/.test(location.pathname)) throw new Error("Blackboard opened an unexpected page.");
      const retryLink = findLink();
      if (!retryLink) throw new Error("The course message link disappeared before it could be scanned.");
      retryLink.click();
      await waitFor(() => /\/ultra\/courses\/[^/]+\/messages/.test(location.pathname) && document.querySelector("bb-course-conversations"), 15000);
    }
  }

  async function scanAllCurrentCourses() {
    if (!/^\/ultra\/messages\/?$/.test(location.pathname)) throw new Error("Open Blackboard’s main Messages page first.");
    const term = currentTermToken();
    const summaries = [...document.querySelectorAll("bb-course-conversations-summary")]
      .filter(node => node.innerText.includes(term) && node.querySelector("a[analytics-id*='goToCourseMessages']"))
      .map(node => {
        const titleLink = node.querySelector("h2 a[analytics-id*='goToCourseMessages']");
        const name = titleLink?.firstChild?.textContent?.trim() || titleLink?.innerText?.replace(/\s+\d+\s*$/, "").trim() || "Course";
        const code = (node.innerText.match(/\b[A-Z]{2,}\d+_\d+_(?:Fall|Spring|Summer)_\d{4}\b/) || [])[0] || name;
        return { name, code };
      });
    if (!summaries.length) throw new Error(`No ${term.replace("_", " ")} courses were found on this page.`);
    let detected = 0; let added = 0; let pages = 0; const errors = []; const courseResults = [];
    for (let index = 0; index < summaries.length; index += 1) {
      let historyDepth = 1;
      let courseDetected = 0;
      try {
        await openCourseMessages(summaries[index].code);
        const result = await chrome.runtime.sendMessage({ type: "PROCESS_DOCUMENTS", documents: collectDocuments() });
        courseDetected += result.detected || 0; detected += result.detected || 0; added += result.added || 0; pages += 1;
        const announcementsLink = document.querySelector("a[href*='/ultra/courses/'][href$='/announcements']");
        if (announcementsLink) {
          historyDepth = 2;
          announcementsLink.click();
          await waitFor(() => /\/ultra\/courses\/[^/]+\/announcements/.test(location.pathname) && document.querySelector("main [role='region']"));
          const announcementResult = await chrome.runtime.sendMessage({ type: "PROCESS_DOCUMENTS", documents: collectDocuments() });
          courseDetected += announcementResult.detected || 0; detected += announcementResult.detected || 0; added += announcementResult.added || 0; pages += 1;
        }
      } catch (error) { errors.push(summaries[index].name); }
      courseResults.push({ id: summaries[index].code, code: summaries[index].code, name: summaries[index].name, term: term.replace("_", " "), detected: courseDetected });
      history.go(-historyDepth);
      await waitFor(() => /^\/ultra\/messages\/?$/.test(location.pathname) && document.querySelector("bb-course-conversations-summary"), 15000);
    }
    await chrome.runtime.sendMessage({ type: "SAVE_COURSE_SCAN", term: term.replace("_", " "), courses: courseResults });
    return { ok: true, courses: summaries.length, pages, detected, added, pending: courseResults.filter(course => course.detected === 0).length, errors };
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

  const isBackgroundScan = new URLSearchParams(location.search).get("midterm_compass_background") === "1";
  if (isBackgroundScan) {
    runBackgroundPageScan().catch(error => console.warn("Midterm Compass background scan failed", error));
  } else {
    addButton();
    maybeStartCoursesHomeScan();
    let lastPath = location.pathname;
    new MutationObserver(() => {
      addButton();
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        lastHomeScanSignature = "";
      }
      maybeStartCoursesHomeScan();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
