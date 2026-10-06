# Midterm Compass for Blackboard

Midterm Compass is a privacy-first Chrome extension that scans **visible Blackboard messages and announcements** for assigned midterm dates and turns them into an editable schedule.

It is configured for the UAEU sign-in address at `https://elearning.uaeu.ac.ae/` and its authenticated Blackboard Ultra host at `https://uaeu.blackboard.com/`.

## What it does

- Adds a **Midterm Compass** button to UAEU Blackboard pages.
- Can step through every course in the current term from Blackboard's main Messages page.
- Scans visible messages, announcements, and list items for exam language and dates.
- Understands phrases such as “the midterm is on 15th of October at 10:30 AM.”
- Deduplicates repeated scans and attaches a confidence score and source excerpt.
- Shows a chronological schedule with search and “needs review” filtering.
- Lets students add, correct, or remove entries manually.
- Exports the schedule as an `.ics` calendar file.
- Sends configurable local Chrome notifications 7 days and 1 day before an exam.
- Keeps data in the browser by default.

> **Important:** The extension is an assistant, not an official academic record. Always verify dates against the original Blackboard post and your course syllabus.

## Install locally

1. Download or clone this repository.
2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose this repository folder (the folder containing `manifest.json`).
6. Sign in to [UAEU Blackboard](https://elearning.uaeu.ac.ae/).

## Use it

1. In Blackboard, open the main **Messages** page from the left navigation.
2. Let the message list finish loading. Scroll to load older messages when needed.
3. Open the extension popup and choose **Scan current courses**. The Blackboard tab steps through each current-term course and returns to Messages when finished. For a single Messages or Announcements page, use the floating button or **Scan this page only**.
4. Open **Full schedule** and review low-confidence entries.
5. Export the reviewed schedule to Apple Calendar, Google Calendar, Outlook, or another app that accepts `.ics` files.

The extension intentionally scans the page the student has opened rather than using undocumented private Blackboard APIs. This is more resilient, avoids storing UAEU credentials, and keeps access aligned with what the signed-in user can already see.

## AI and privacy

The default **Private browser mode** processes text locally. It combines exam-aware classification, date/time parsing, confidence scoring, and cancellation filtering. No Blackboard message content leaves Chrome.

An optional **OpenAI-compatible API** mode is available in Settings. It is off by default. If enabled, scanned message excerpts are sent to the configured API endpoint for structured extraction. The API key is stored in `chrome.storage.local`; it is never committed to this repository. For production distribution, use a small authenticated backend instead of placing a long-lived provider key in a browser extension.

The API prompt treats Blackboard text as untrusted content and asks the model to return only structured exam data. Even with AI enabled, verify every result.

## Permissions

| Permission | Why it is used |
|---|---|
| `elearning.uaeu.ac.ae/*`, `uaeu.blackboard.com/*` | Run the scanner and injected button only on UAEU sign-in and Blackboard. |
| `storage` | Save settings and the local schedule. |
| `notifications`, `alarms` | Remind the student about upcoming midterms. |
| `downloads` | Export an `.ics` calendar file. |
| `activeTab` | Scan the Blackboard tab selected by the student. |
| Optional API origins | Granted only when API AI is explicitly enabled. |

The extension does not capture passwords, cookies, or authentication tokens.

## Development

There is no build step and no runtime dependency.

```bash
npm test
npm run check
```

After changing source files, click **Reload** on `chrome://extensions`, then refresh the Blackboard tab.

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

The all-course flow uses Blackboard's visible course links and current signed-in session; it does not call unsupported private endpoints or store credentials. It scans message previews currently rendered for the active term, and returns to the Messages index. Scan course-specific Announcements pages separately when an instructor posts dates there.

## Suggested next additions

- A guided “scan all courses” flow that advances only through user-visible course pages.
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
