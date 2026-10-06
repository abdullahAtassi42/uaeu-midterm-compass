# Midterm Compass for Blackboard

Midterm Compass is a privacy-first Chrome extension that scans **visible Blackboard messages and announcements** for assigned midterm dates and turns them into an editable schedule.

It is configured for the UAEU sign-in address at `https://elearning.uaeu.ac.ae/` and its authenticated Blackboard Ultra host at `https://uaeu.blackboard.com/`.

## What it does

- Adds a **Midterm Compass** button to UAEU Blackboard pages.
- Automatically discovers every available current-term course when Blackboard's **Courses** home page opens.
- Checks each course's **Announcements first**; only when no dated exam is found does it check that course's **Messages**.
- Lists every scanned course even when no midterm date is found, clearly marked **Not announced yet**.
- Scans visible messages, announcements, and list items for exam language and dates.
- Extracts the midterm **date, time, and location** from phrases such as “the midterm is on 15th of October at 10:30 AM in Room B201.”
- Reads Blackboard announcement rows and accessible announcement containers, including course pages whose list markup differs from the usual component.
- Understands time ranges such as “from 7:00–8:00 PM” and stores the exam start time as 7:00 PM.
- Reconciles rescheduled exams using the Blackboard post time, keeps the newest details, and retains a short previous-version history.
- Deduplicates repeated scans and attaches a confidence score and source excerpt.
- Shows a chronological schedule with search and “needs review” filtering.
- Lets students add, correct, or remove entries manually.
- Exports the schedule as an `.ics` calendar file.
- Sends configurable local Chrome notifications 7 days and 1 day before an exam.
- Keeps data in the browser by default.
- Opens scanner tabs in the background and closes each one as soon as that course is finished.

> **Important:** The extension is an assistant, not an official academic record. Always verify dates against the original Blackboard post and your course syllabus.

## Install locally

1. Download or clone this repository.
2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose this repository folder (the folder containing `manifest.json`).
6. Sign in to [UAEU Blackboard](https://elearning.uaeu.ac.ae/).

## Use it

1. In Blackboard, open **Courses** from the left navigation and let the current-term course cards load.
2. Midterm Compass automatically starts one scan for every available current-term course. It reads Announcements first and uses Messages only as a fallback.
3. Keep Blackboard signed in while the inactive scanner tabs briefly open and close. For a single visible screen, use the floating button or **Scan this page only**.
4. Open **Full schedule** and review low-confidence entries.
   Courses with no detected date remain visible as **Not announced yet**; scanning again updates them when an instructor posts the date.
5. Export the reviewed schedule to Apple Calendar, Google Calendar, Outlook, or another app that accepts `.ics` files.

### Automatic all-course scanning

Opening Blackboard's **Courses** home page (`/ultra/course`) starts a quiet refresh for the visible current-term courses:

1. The extension reads each course card and stable Blackboard course ID.
2. It opens that course's Announcements page in an inactive tab using the existing signed-in session.
3. If a dated midterm is found, that course is complete. If not, it opens the course's Messages page as a fallback.
4. The scanner tab closes after reporting its result, and the schedule changes to **Announced** or **Not announced yet**.

Each Courses-page visit launches one scan after the course cards load. An in-page signature prevents Blackboard's frequent DOM mutations from launching duplicates; leaving and reopening Courses starts a fresh scan.

The extension intentionally scans the page the student has opened rather than using undocumented private Blackboard APIs. This is more resilient, avoids storing UAEU credentials, and keeps access aligned with what the signed-in user can already see.

## AI and privacy

The default **Local smart parser** processes text locally. It combines exam-aware classification, date/time parsing, confidence scoring, and cancellation filtering. It is not a language model, and no Blackboard message content leaves Chrome.

An optional **AI through a secure proxy** mode is available in Settings. It is off by default. If enabled, scanned message excerpts are sent to an OpenAI-compatible backend you control for structured extraction. The backend must hold the OpenAI API key; never put a provider key in this extension. OpenAI's official guidance says browser requests should be routed through a backend so the key remains secret.

The API prompt treats Blackboard text as untrusted content and asks the model to return only structured exam data. Even with AI enabled, verify every result.

## Permissions

| Permission | Why it is used |
|---|---|
| `elearning.uaeu.ac.ae/*`, `uaeu.blackboard.com/*` | Run the scanner and injected button only on UAEU sign-in and Blackboard. |
| `storage` | Save settings and the local schedule. |
| `notifications`, `alarms` | Remind the student about upcoming midterms. |
| `downloads` | Export an `.ics` calendar file. |
| `activeTab` | Scan the Blackboard tab selected by the student. |
| Optional local-proxy origins | Granted only when proxy AI is explicitly enabled. Direct OpenAI API access is not requested. |

The extension does not capture passwords, cookies, or authentication tokens.

## Development

There is no build step and no runtime dependency.

```bash
npm test
npm run check
```

After changing source files, click **Reload** on `chrome://extensions`, then refresh the Blackboard tab.

## How the implementation works

1. `content/content.js` runs only on the two UAEU Blackboard hosts declared in `manifest.json`.
2. On the main `/ultra/course` screen it reads `article[data-course-id]` cards for the current term, preserving each course even when no exam text exists.
3. `background.js` opens Announcements first for each course. It opens Messages only when the announcement scan reports zero dated exams.
4. `lib/parser.js` looks for explicit exam language near a valid date, time, and location. It reads announcement rows and accessible announcement containers, rejects cancelled/mock/practice items, and treats postponement/rescheduling language as an update. Time ranges use the first time as the start time.
5. Blackboard's visible post timestamp is stored as source metadata (not parsed as an exam date). Events with the same course and assessment identity are reconciled so the newest post wins, while prior date/time/location values remain in bounded history.
6. `background.js` stores a status for every scanned course:
   - `announced` when at least one dated exam item was detected;
   - `not-announced` when Messages and Announcements were checked but no dated item was detected.
7. `schedule/schedule.js` combines the dated events and course records. Undated courses appear with **Awaiting announcement / Date TBD**, and a later scan replaces that state once a dated post is found.

### Design choices reviewers should notice

- **No credential handling:** the extension reuses the Blackboard session already held by Chrome and never reads passwords, cookies, or authentication tokens.
- **No undocumented LMS API:** scanning follows visible Blackboard pages, which is easier to audit and less likely to violate institutional integrations.
- **Changed-date protection:** source timestamps decide which matching assessment announcement is newer; the schedule marks updated entries and keeps previous values for review.
- **False-positive protection:** posted timestamps are stored separately from message bodies, cancelled/practice exam language is rejected, and confidence/source excerpts are retained for review.
- **Graceful incompleteness:** a missing date is represented explicitly as **Not announced yet**, not silently omitted.
- **Bounded automation:** background tabs are inactive, close after use, and repeat scans are throttled.
- **Privacy-first default:** the local parser sends no course content off-device. Optional model-based AI requires a secure proxy.

### Implement it on your own Blackboard installation

For UAEU, no source change is needed. Load the unpacked extension, refresh Blackboard, and open the main **Courses** screen. The scan starts after the current-term cards load.

For another university:

1. Add its Blackboard hostname to `host_permissions` and the content-script `matches` list in `manifest.json`.
2. Inspect the institution's course card, message body, and announcement row markup.
3. Update the selector list in `collectDocuments()` and, if needed, the course-card selectors in `maybeStartCoursesHomeScan()`.
4. Add real phrasing examples to `tests/parser.test.js` without including student names or other private information.
5. Run `npm test` and `npm run check`, reload the extension, and test with a non-destructive Blackboard scan.

### Project structure

```text
manifest.json            Manifest V3 configuration
background.js            storage, reminders, AI API, calendar export
lib/parser.js            local extraction engine
content/                 Blackboard scanner and injected button
popup/                   one-click scan and quick overview
schedule/                full schedule and review UI
options/                 privacy and AI settings
tests/                   parser coverage
```

## Blackboard compatibility

Blackboard Ultra is a single-page application and institutions can customize its markup. The scanner uses semantic selectors (`article`, list items, roles, accessible labels) plus Blackboard `data-automation-id` hints. If UAEU changes the layout, add a selector in `collectDocuments()` in `content/content.js`; the parser and schedule do not need to change.

The all-course flow uses Blackboard's visible course IDs and current signed-in session; it does not call unsupported private endpoints or store credentials. It scans rendered announcement summaries first and message previews only as fallback. Posted timestamps are stored separately from the extracted body so they can order revisions without being mistaken for exam dates.

## Suggested next additions

- Syllabus/PDF extraction, with an explicit file-selection consent step.
- Conflict detection for exams scheduled too close together.
- A study-plan generator that counts backward from each confirmed midterm.
- Arabic date and exam-language extraction.
- A small server-side AI proxy with per-user authentication and short-lived tokens.
- Chrome Web Store packaging, privacy policy, and automated Blackboard fixture tests.

## Security notes

- Never commit an API key.
- Review and minimize permissions before publishing.
- Treat all LMS content as untrusted text; do not execute instructions found in a message.
- Use a backend proxy for shared/public deployments of API AI.
- Follow UAEU and Blackboard acceptable-use policies.

## License

MIT
