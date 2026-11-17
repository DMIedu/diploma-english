# DMI Diploma in English – Practice Hub

DMI Computer Education · online practice for Diploma in English students.

**Student site:** `index.html` (apply / sign in) → `hub.html`
**Staff:** `admin.html`

## What students get

| Room | Content |
|---|---|
| Vocabulary | 856 verbs from the *Do it yourself* book (pages 80–99) with Tamil meanings, 5 verb forms, English + Tamil sentences, flashcards, quick practice, and 4 vocabulary tests (100 marks, 40 min) |
| Listening | 40 papers (A1, A2, B1, B2 × 10), 4 parts, 40 questions, read aloud by the browser, answers + transcript after marking |
| Reading | 1 paper per level (A1–B2), 15 questions |
| Writing | 11 tasks; AI feedback (if the AI key is set) and sent to the teacher to mark |
| Speaking | 40 units (41–80): model dialogue, key words, questions to listen to and record answers |
| My results | Every mark, plus teacher marks on writing |

All tests are open in any order and can be taken any number of times; every attempt is recorded.

## How accounts work

1. Student **applies** (name, mobile, branch, reg. no., course, own password).
2. Admin **approves** in `admin.html` → 3 months of access.
3. Student **signs in** with mobile number + password.
4. Admin can **+3 months**, **reset password** (shows a new 6-digit password), or **block**.

## Setup (one time)

1. Create a Google Sheet "DMI Diploma English Hub". Extensions → Apps Script → paste `apps-script/Code.gs` → Save.
2. Reload the sheet → menu **DMI Hub → 1. Set up the sheet tabs**, then **2. Add an admin user**.
3. (AI writing feedback) Apps Script → Project Settings → Script properties → add `GEMINI_API_KEY`. Then sheet menu **DMI Hub → Test AI writing key**.
4. Deploy → New deployment → Web app → Execute as **Me**, Who has access **Anyone** → copy the `/exec` URL.
5. Put the URL in `assets/config.js` → `API_URL: "…"` and commit.

## Notes

- Passwords are stored only as salted hashes. The AI key stays in Script properties, never in this repo.
- Test answers are in the public page files, so this is a practice hub, not a secure exam system.
- Edit branches, courses and vocabulary test pages in `assets/config.js`.
