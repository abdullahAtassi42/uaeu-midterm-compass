const assert = require("node:assert/strict");
const parser = require("../lib/parser.js");
const now = new Date("2026-10-06T12:00:00Z");

const cases = [
  ["The midterm is on 15th of October at 10:30 AM in Room B201.", "2026-10-15", "10:30"],
  ["Our Mid-Term Examination will take place October 20, 2026 at 2 pm.", "2026-10-20", "14:00"],
  ["Exam date: 23/10/2026 at 09:00", "2026-10-23", "09:00"]
  , ["Next lab session we have Midterm exam (session of Oct. 19)", "2026-10-19", null]
];
for (const [text, date, time] of cases) {
  const [event] = parser.parseDocument({ text, course:"STAT 101" }, now);
  assert.equal(event.date, date); assert.equal(event.time, time);
}
assert.equal(parser.parseDocument({ text:"The practice midterm is on October 15." }, now).length, 0);
assert.equal(parser.parseDocument({ text:"Office hours are on October 15." }, now).length, 0);
console.log("parser tests passed");
