# Research Participation Portal

A **multi‑study** research platform for computing education. Each study can be composed of a flexible set of modules: background survey, pre‑test, interactive puzzles, reflection, code bridge, review phase, post‑test, and delayed follow‑up. The portal automatically adapts the participant flow based on the study’s configuration.

## Features

- **Hero page** – explains study benefits before collecting personal data.
- **Participant registration** – collects name, matric number, email, gender, academic session, class section.
- **Consent management** – explicit checkbox per study.
- **Background survey** – configurable Likert and select fields (optional).
- **Pre‑test / Post‑test** – multiple‑choice questions with optional attention checks (optional, can be skipped).
- **Interactive puzzles** – drag‑and‑drop card ordering with faded guidance, multiple attempts, and misconception feedback (optional).
- **Reflection & code bridge** – write reflections and view pseudocode per puzzle (optional).
- **Review phase** – randomly selects 3 puzzles for review after all are solved (optional).
- **Delayed post‑test** – configurable waiting period between pre‑test and post‑test (e.g., 7 days).
- **Delayed follow‑up** – weeks after main completion (optional).
- **Automatic resume** – participants can leave and return exactly where they left off (cards, answers, puzzle progress all restored). Uses localStorage (scoped by participant code + enrolment id) and server backup.
- **Certificate generation** – downloadable HTML certificate with QR code for verification.
- **Dark mode toggle** – persists across sessions.
- **Admin dashboard** – view study statistics, open/close enrolment, set capacity, send email reminders to inactive participants.
- **CSV/JSON export** – anonymised data export per study.
- **Email reminders** – automatically notify participants who haven’t completed after a configurable number of days (requires SMTP).
- **Bilingual support** – per‑study toggle (English/Hausa) if `bilingual: true`.
- **Audio read‑aloud** – for prompts and code blocks (browser speech synthesis).

## Tech Stack

- **Backend**: Node.js, Express, Supabase (PostgreSQL), Express Session, Nodemailer.
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (custom design with dark mode).
- **Deployment**: Render (or any Node.js hosting).

## Project Structure
