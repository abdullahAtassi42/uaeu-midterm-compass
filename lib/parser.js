(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MidtermParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MONTHS = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
    april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
    august: 7, aug: 7, september: 8, sept: 8, sep: 8,
    october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
  };
  const KEYWORDS = /\b(mid[\s-]?term|midsemester|mid-semester|exam(?:ination)?|test|quiz)\b/i;
  const NEGATIVE = /\b(no|not|cancel(?:led|ed)?|practice|mock)\b.{0,20}\b(mid[\s-]?term|exam|test|quiz)\b/i;
  const REVISION = /\b(reschedul(?:ed|ing)|postponed|moved|changed|updated?|new\s+(?:date|time|room|location)|instead)\b/i;

  function pad(value) { return String(value).padStart(2, "0"); }
  function isoDate(year, month, day) {
    const date = new Date(year, month, day, 12, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }
  function inferYear(month, day, now) {
    const thisYear = now.getFullYear();
    const candidate = new Date(thisYear, month, day, 12);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return candidate < sixMonthsAgo ? thisYear + 1 : thisYear;
  }
  function normalizeYear(value) {
    const year = Number(value);
    if (!value) return null;
    return year < 100 ? 2000 + year : year;
  }
  function findDate(text, now = new Date()) {
    let match;
    const monthNames = Object.keys(MONTHS).join("|");
    const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${monthNames})\\.?(?:[\\s,]+(20\\d{2}|\\d{2}))?\\b`, "i");
    const monthFirst = new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[\\s,]+(20\\d{2}|\\d{2}))?\\b`, "i");
    if ((match = text.match(dayFirst))) {
      const month = MONTHS[match[2].toLowerCase()];
      return { date: isoDate(normalizeYear(match[3]) || inferYear(month, Number(match[1]), now), month, Number(match[1])), raw: match[0] };
    }
    if ((match = text.match(monthFirst))) {
      const month = MONTHS[match[1].toLowerCase()];
      return { date: isoDate(normalizeYear(match[3]) || inferYear(month, Number(match[2]), now), month, Number(match[2])), raw: match[0] };
    }
    const numeric = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}|\d{2}))?\b/);
    if (numeric) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]) - 1;
      return { date: isoDate(normalizeYear(numeric[3]) || inferYear(month, day, now), month, day), raw: numeric[0] };
    }
    return null;
  }
  function findTime(text) {
    const range = text.match(/\b(?:from\s+)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (range) {
      let hour = Number(range[1]);
      const meridiem = (range[3] || range[6] || "").toLowerCase();
      if (meridiem.startsWith("p") && hour < 12) hour += 12;
      if (meridiem.startsWith("a") && hour === 12) hour = 0;
      return `${pad(hour)}:${range[2] || "00"}`;
    }
    const match = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i) ||
      text.match(/\b(?:at\s+)([01]?\d|2[0-3]):([0-5]\d)\b/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = (match[3] || "").toLowerCase();
    if (meridiem.startsWith("p") && hour < 12) hour += 12;
    if (meridiem.startsWith("a") && hour === 12) hour = 0;
    return `${pad(hour)}:${pad(minute)}`;
  }
  function findDuration(text) {
    const match = text.match(/\b(?:duration|for)\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?)\b/i);
    if (!match) return 60;
    const amount = Number(match[1]);
    return /^h/i.test(match[2]) ? amount * 60 : amount;
  }
  function cleanTitle(text) {
    const sentence = text.split(/[\n.!?]/).find(part => KEYWORDS.test(part)) || "Midterm exam";
    return sentence.replace(/\s+/g, " ").trim().slice(0, 110);
  }
  function assessmentKey(course, text) {
    const midterm = text.match(/\bmid[\s-]?(?:term|semester)(?:\s+(?:exam(?:ination)?)?)?\s*#?\s*(\d+)?/i);
    if (midterm) return `${course}|midterm${midterm[1] ? `-${midterm[1]}` : ""}`.toLowerCase();
    const exam = text.match(/\bexam(?:ination)?\s*#?\s*(\d+)?/i);
    if (exam) return `${course}|exam${exam[1] ? `-${exam[1]}` : ""}`.toLowerCase();
    const test = text.match(/\btest\s*#?\s*(\d+)?/i);
    if (test) return `${course}|test${test[1] ? `-${test[1]}` : ""}`.toLowerCase();
    const quiz = text.match(/\bquiz\s*#?\s*(\d+)?/i);
    return `${course}|quiz${quiz?.[1] ? `-${quiz[1]}` : ""}`.toLowerCase();
  }
  function fingerprint(event) {
    return [event.course, event.date, event.time || "", event.title]
      .join("|").toLowerCase().replace(/[^a-z0-9|]/g, "").slice(0, 240);
  }
  function parseDocument(document, now = new Date()) {
    const text = String(document.text || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
    if (!KEYWORDS.test(text) || NEGATIVE.test(text)) return [];
    const revisionMatch = text.match(REVISION);
    const currentDetails = revisionMatch ? text.slice(revisionMatch.index) : text;
    const dateResult = findDate(currentDetails, now) || findDate(text, now);
    if (!dateResult || !dateResult.date) return [];
    const keyword = text.match(KEYWORDS);
    const distance = keyword ? Math.abs(text.indexOf(dateResult.raw) - keyword.index) : 999;
    let confidence = 0.58;
    if (/mid[\s-]?term|midsemester/i.test(text)) confidence += 0.2;
    if (distance < 180) confidence += 0.12;
    if (document.course) confidence += 0.05;
    const locationMatch = currentDetails.match(/\b(?:room|hall|building|venue|location)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 -]{0,30}?)(?=\s+(?:at|on|from)\b|[.,;\n]|$)/i) ||
      text.match(/\b(?:room|hall|building|venue|location)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 -]{0,30}?)(?=\s+(?:at|on|from)\b|[.,;\n]|$)/i);
    const event = {
      id: "evt_" + Math.random().toString(36).slice(2) + Date.now().toString(36),
      course: String(document.course || "Unknown course").trim(),
      title: cleanTitle(text),
      date: dateResult.date,
      time: findTime(currentDetails) || findTime(text),
      durationMinutes: findDuration(text),
      location: locationMatch?.[1]?.trim() || "",
      confidence: Math.min(confidence, 0.95),
      sourceUrl: document.sourceUrl || "",
      sourceLabel: document.sourceLabel || "Blackboard message",
      sourceExcerpt: text.slice(0, 320),
      sourcePublishedAt: document.sourcePublishedAt || null,
      revision: Boolean(revisionMatch),
      detectedBy: "local-parser",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    event.assessmentKey = assessmentKey(event.course, text);
    event.fingerprint = fingerprint(event);
    return [event];
  }
  function parseDocuments(documents, now = new Date()) {
    return (documents || []).flatMap(doc => parseDocument(doc, now));
  }
  return { parseDocument, parseDocuments, findDate, findTime, assessmentKey, fingerprint };
});
