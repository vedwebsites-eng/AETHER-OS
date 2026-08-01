<div align="center">

```
 ▄▄▄·▄▄▄ .▄▄▄▄▄ ▄ .▄      .▄▄ · 
▐█ ▄█▀▄.▀·•██  ██▪▐█▪     ▐█ ▀. 
 ██▀·▐▀▀▪▄ ▐█.▪██▀▐█ ▄█▀▄ ▄▀▀▀█▄
▐█▪·•▐█▄▄▌ ▐█▌·██▌▐▀▐█▌.▐▌▐█▄▪▐█
.▀    ▀▀▀  ▀▀▀ ▀▀▀ · ▀█▄▀▪ ▀▀▀▀ 
```

# AETHOS
### *One operating system for your ambition.*

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-12-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=flat-square&logo=vercel)](https://vercel.com)

**Built by a 16-year-old solo dev because no single app did everything.**

</div>

---

## What is AETHOS?

AETHOS is a full-stack, cyberpunk-themed **gamified self-improvement operating system**. It replaces Notion, Todoist, Day One, and a YouTube motivaton playlist with a single unified interface — and layers an XP system, streaks, achievements, and an AI life coach on top of all of it.

Built with React 19, TypeScript, Firebase/Firestore, Express, and Tailwind CSS. Deployed on Vercel. No paywalls. No ads. No premium tiers for core features.

---

## Navigation

![AETHOS Sidebar](ss_01_sidebar.png)

The left sidebar is your command interface. Every section is a module of your life:

| Label | Module |
|---|---|
| `CORE_COMMAND` | Dashboard — your mission control |
| `DAILY_WORK` | Tasks + Habits + Timetable |
| `REFLECT` | Journal — neural archive |
| `GROW` | Stats, Achievements, Evolution |
| `AETHOS_COACH` | Ace — your AI life coach |
| `CONFIG_OS` | Settings — identity, interface, preferences |
| `TERMINATE` | Sign out |

---

## Daily Check-In

![Daily Check-In](ss_02_checkin.png)

Every day starts with a `DAILY_CHECK_IN` — a lightweight ritual that keeps your streak alive and your system calibrated. Four nodes to clear:

- **DAILY_TASKS** — Mark at least one task complete
- **JOURNAL** — Write a neural log entry
- **WHEEL_OF_LIFE** — Run a life-balance sync
- **AI_CHECK_IN** — Talk to Ace

Progress is tracked top-right (`0/4` → `4/4`). Miss a day and your streak resets to zero. Clear all four and your streak chain grows.

---

## Your Profile

![User Profile](ss_03_profile.png)

Every user has a persistent XP-driven profile. No hidden stats, no black boxes:

- **Level system** — XP → Levels with 5 rank titles: `NOVICE` → `APPRENTICE` → `JOURNEYMAN` → `EXPERT` → `LEGEND`
- **XP Bar** — Live progress toward next level node (e.g. `451 / 750 XP`)
- **Streak chain** — Consecutive active days tracked and displayed
- **Share button** — Export a styled stat card as a PNG (powered by `html-to-image`)

Feature unlocks are gated by level — the more you do, the more the OS opens up.

<details>
<summary>Level unlocks</summary>

| Level | Feature |
|---|---|
| 5 | Recurring Tasks |
| 10 | Timetable Scheduling |
| 15 | Advanced Filters |
| 20 | Cosmetic Shop |
| 30 | Deep Analytics |
| 50 | Neural Insight Engine |
| 75 | Elite Protocol Access |
| 100 | LEGENDARY_CORE — lifetime status |

</details>

---

## Core Command (Dashboard)

### Metrics Sync

![Core Metrics](ss_04_metrics.png)

The top bar of `CORE_COMMAND` gives you a real-time snapshot across five nodes:

| Node | What it tracks |
|---|---|
| `XP_DATA` | Total XP earned lifetime |
| `TASKS_` | Total tasks completed |
| `STREAK` | Current day-chain |
| `LOGS` | Journal entries written |
| `NODE_S` | Life sync score (Wheel of Life avg) |

Below that: today's **Daily Challenge** — a procedurally assigned goal (`COMPLETE_5_TASKS`, `WRITE_A_JOURNAL`, etc.) with an XP bonus on completion.

### Achievements & Feed

![Achievements Panel](ss_05_achievements.png)

The `QUICK_OVERRIDE` panel surfaces:

- **Upcoming targets** — your next pinned tasks
- **Evolving protocols** — in-progress achievements with live progress bars
- **Daily inspiration** — a randomly pulled motivational quote
- **Next milestone** — the next level unlock, always visible

![Neural Feed](ss_06_feed.png)

The `NEURAL_FEED` shows your personal motivation vault — videos, quotes, and tracks you've added, ready to play directly from the dashboard.

### XP History

![Neural History](ss_07_history.png)

`NEURAL_HISTORY` logs every XP event with a timestamp, type label (`TASK`, `JOURNAL`, `HABIT`), and reward amount. Full audit trail — no XP appears without a logged source.

---

## Daily Work

### Task Manager

![Task Manager](ss_08_tasks.png)

The `INITIATE_PROTOCOL_CMD` panel is your task input:

- **Priority** — Low / Medium / High / Critical
- **Category** — Work, Health, Study, Personal, Finance, etc.
- **Estimate** — Time in minutes
- **Manual XP reward** — Override the AI-suggested XP with your own value
- **Boss Protocol** — Flag a task as a multi-step "Boss Task"; AI auto-generates 3–5 sub-tasks
- **Challenge Mode** — Double XP, higher difficulty multiplier

Tasks live in an `ACTIVE_QUEUE`. Complete one → confetti fires, XP is awarded, history logs it. A search bar + filters let you sort by priority, category, or status.

The `HABIT_SYNC_CENTER` on the right lets you push any active habit directly into today's task queue as a one-tap protocol.

### Habit Matrix

![Routine Matrix](ss_09_habits.png)

`ROUTINE_MATRIX` is your habit tracking module. Each habit has:

- **Streak counter** — consecutive days logged
- **One-tap complete** — check it off directly from the card
- **Heatmap** — `GLOBAL_CONSISTENCY_MAP` — a GitHub-style contribution grid showing your consistency over the past ~90 days. Color intensity = how often you logged that day.

Habits carry over daily. A missed day breaks the streak but never deletes the habit — your history stays intact.

### Timetable / Calendar

![Scheduler](ss_10_calendar.png)

`TEMPORAL_SYNCHRONIZATION_HUB` is a full calendar with three views: Month, Week, Day.

The AI timetable generator (`GENERATE_TIMETABLE`) takes your pending tasks + your fixed routine events and returns a scheduled day from 5 AM to 11 PM — no overlaps, built-in breaks, ordered by priority. Output is rendered directly on the calendar.

Two live stats in the header:
- `STREAK_STABILITY` — your current habit day-chain
- `PROTOCOL_EFFICIENCY` — task completion rate

---

## Journal (Neural Archive)

### Entry

![Journal Entry](ss_11_journal_entry.png)

The journal is a rich-text editor powered by Tiptap — bold, italic, underline, H1/H2, bullet lists, links, highlight, and inline code. Every entry gets:

- **Date stamp** with XP potential shown upfront (`+30 XP`)
- **Voice input** — tap the mic, speak, the OS transcribes it (ElevenLabs STT via the Express server)
- **Reflection prompt** — an optional randomly selected introspection question worth a bonus `+25 XP`
- **ENERGY_INDEX** — 5-state energy selector: 🪫 DRAINED / 😴 LOW / 😐 OK / ⚡ HIGH / 🔥 PEAK
- **NEURAL_TAGS** — mood tags like `#STRESSED`, `#FOCUSED`, `#GRATEFUL`, `#CREATIVE`

Hit `SYNC_TO_ARCHIVE` and the entry is saved to Firestore, XP is awarded, and the AI runs a background analysis pass.

### History

![Journal History](ss_12_journal_history.png)

Every entry is listed with date, word count, mood emoji, and energy level. Tap to expand the full entry inline. Delete individual entries or wipe the full archive.

### Insights

![Journal Insights](ss_13_journal_insights.png)

Three AI-powered analytics panels over your last 30 days:

- **MOOD_STABILITY_GRAPH** — bar chart of your mood score by day of week
- **WORD_DENSITY_TRENDS** — writing volume trends across the week
- **TEMPORAL_FREQUENCY** — a heatmap of which days you actually journal
- **TOP_MOOD_ARCHETYPE** — your most common emotional state
- **CONSISTENCY_HIGH / LOW** — streak rating on journaling consistency

---

## Wheel of Life

![Wheel of Life Radar](ss_14_wheel_radar.png)

The Wheel of Life is a radar chart across your life categories. You define which categories matter to you, and the AI scores each one based on your task history and journal entries — then plots them as a dynamic polygon.

![Life Category Scores](ss_15_wheel_scores.png)

Below the radar: each category gets a numerical score (1–10) with a colored progress bar. The header cards surface:

- **BALANCE_SCORE** — weighted average across all active nodes
- **NEEDS_FOCUS** — your lowest scoring category
- **STRONGEST_NODE** — your highest scoring category

The analysis runs via OpenRouter (LLaMA 70B) and re-syncs whenever you request it.

---

## Grow

### Neural Evolution

![Neural Evolution](ss_16_grow.png)

`NEURAL_EVOLUTION` gives you a month-over-month view across four dimensions:

| Metric | Source |
|---|---|
| `ROUTINE_SYNC` | Habit completion rate |
| `PROTOCOL_EXECUTION` | Task completion rate |
| `TEMPORAL_ADHERENCE` | Calendar / scheduled task rate |
| `NEURAL_ARCHIVAL` | Journal frequency |

Each metric shows a delta (% change vs previous month). The `NEURAL_MOTIVATION_CORE` panel surfaces a curated quote to push you through stagnation phases.

The `ARCHIVE` tab shows a historical monthly breakdown going back as far as your data exists.

### Achievements

A 30+ achievement system across categories: `milestone`, `streak`, `skill`, and `hidden`. Rarities: Common, Uncommon, Rare, Legendary. Hidden achievements surface only after you trigger them.

Sample achievements:

| Achievement | Trigger | XP |
|---|---|---|
| `INITIAL_BOOT` | Complete first task | 50 |
| `UPTIME_30D` | 30-day activity streak | 1,000 |
| `PROLIFIC_AUTHOR_I` | 10,000 words written | 500 |
| `WORD_WIZARD` | 1,000 words in one entry | 500 |
| `MIDNIGHT_THOUGHTS` | Journal at 3+ AM | 200 |
| `IRON_DISCIPLINE` | 30-day habit streak | 250 |
| `PERFECT_WEEK` | 100% habit completion for 7 days | 500 |
| `NODE_ASCENSION_III` | Reach Level 100 | 5,000 |
| `UPTIME_YEAR` | 365-day streak | 10,000 |

---

## Notepad

![Notepad](ss_17_notepad.png)

A persistent scratchpad that syncs to Firestore. Dump thoughts, quick to-dos, anything — without creating a formal task. Lines can be converted directly into tasks from the notepad with one click.

---

## AETHOS Coach (Ace)

![AETHOS Coach](ss_18_coach.png)

Ace is the AI life coach living inside AETHOS. Not a generic chatbot — Ace has full read access to your app data and uses it to give context-aware coaching.

**What Ace knows:**
- Your current tasks (pending, overdue, completed today)
- Your active habits and streaks
- Your recent journal entries and energy levels
- Your Wheel of Life scores and weakest category
- Long-term memory — key facts about you persist across every conversation via a background-synthesized memory summary (updated every 6 messages)

**What Ace can do:**
- Stream token-by-token responses in real time
- Create tasks and habits directly — with an inline confirm card before anything is written
- Trigger your Motivation Hub when it detects a zero-motivation state — plays a song from your vault automatically
- Generate AI titles for each conversation thread

**AI Stack:**
- Primary: `meta-llama/llama-3.3-70b-instruct:free` via OpenRouter
- Fallback: `openrouter/free` on 429 / 404
- Auto-retry on empty responses
- Stop button via AbortController — kills the stream mid-token

**Multi-chat sidebar:**
- New / rename / delete / search chats
- Cascade-delete clears messages on chat deletion
- Chat history synced to `coach_chats` + `coach_messages` Firestore collections
- Cross-chat memory in `coach_memory` collection

**Quick-action chips** surface on the empty state: `MY_JOURNAL`, `MY_TASKS`, `HABIT_STREAKS`, `LIFE_BALANCE`, `PLAN_TODAY` — one tap sends a pre-built context-rich prompt.

---

## Config OS

![Config OS](ss_19_config.png)

Five configuration tabs:

| Tab | Controls |
|---|---|
| `IDENTITY_CORE` | Display name, avatar, coach persona name |
| `OPERATION_LOGIC` | Difficulty multiplier, daily targets, category weights |
| `INTERFACE_STREAMS` | Theme, animation level, font preferences |
| `COMMS_PROTOCOLS` | Notification settings |
| `MARKETPLACE` | Cosmetic shop — skins and visual unlocks (level-gated) |

Data export and full account wipe are available here. Settings persist to `user_settings` Firestore collection.

---

## Tech Stack

```
Frontend        React 19 + TypeScript 5.8
Styling         Tailwind CSS v4 + custom CSS vars
Animation       Motion (Framer Motion)
Rich Text       Tiptap v3 (journal editor)
Charts          Recharts
Backend         Express.js via tsx (server.ts)
Database        Firebase Firestore v12
Auth            Firebase Authentication (Google + Email)
AI              OpenRouter — LLaMA 3.3 70B (primary), openrouter/free (fallback)
STT             ElevenLabs Speech-to-Text
Build           Vite 6
Deploy          Vercel (SPA + serverless Express)
```

**Firestore Collections:**

```
user_stats          XP, level, streak, achievements
user_settings       App preferences and config
tasks               Task queue
journals            Journal entries
habits              Habit definitions
habit_logs          Daily habit completion records
time_blocks         Timetable / calendar blocks
motivation_items    Vault entries (videos, quotes, music)
life_snapshots      Wheel of Life history
coach_chats         Chat thread metadata
coach_messages      Individual messages per thread
coach_profiles      Ace persona config per user
coach_memory        Long-term memory summaries
notepad_data        Scratchpad content
```

---

## Local Setup

**Prerequisites:** Node.js 18+, a Firebase project, an OpenRouter API key

### 1. Clone

```bash
git clone https://github.com/yourusername/aethos.git
cd aethos
npm install
```

### 2. Environment Variables

Create a `.env` file in the root (see `.env.example`):

```env
# OpenRouter (required — powers all AI features)
OPENROUTER_API_KEY=your_key_here

# Firebase (required — all user data and auth)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_DATABASE_ID=

# Optional
ELEVENLABS_API_KEY=        # Voice-to-text in journal
PORT=3000
NODE_ENV=development
```

### 3. Firebase Setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** → Google + Email/Password
3. Enable **Firestore** → create a database in production mode
4. Copy your project config into the `.env` vars above
5. Deploy the Firestore security rules:

```bash
firebase deploy --only firestore:rules
```

### 4. Run

```bash
npm run dev
```

This starts both the Vite dev server and the Express backend concurrently.

---

## Deploy to Vercel

1. Push to GitHub
2. Import the repo in [vercel.com/new](https://vercel.com/new)
3. Add all environment variables from `.env` in the Vercel project settings
4. Vercel auto-detects Vite — no framework config needed
5. The `vercel.json` handles SPA routing

```bash
# Build locally to test
npm run build
npm run start
```

---

## Firestore Security

AETHOS ships with production-grade Firestore rules:

- **Anti-cheat on XP** — every XP write is validated server-side: max +500 XP per write, level can only increment by 1, streak can only go up by 1 or reset to 0
- **Ownership enforcement** — users can only read/write their own documents
- **Email verification gate** — sensitive writes require a verified account or Google auth
- **Schema validation** — field types, sizes, and value ranges enforced at the database layer

---

## Project Structure

```
aethos/
├── src/
│   ├── App.tsx                 # Main app (~14,700 lines — single-file architecture)
│   ├── components/
│   │   ├── ChatManager.tsx     # Coach chat utilities
│   │   ├── ChronosClock.tsx    # Clock component
│   │   ├── DashboardLanding.tsx
│   │   ├── EmptyState.tsx
│   │   ├── OnboardingModal.tsx
│   │   ├── ShareCards.tsx      # Exportable stat cards
│   │   ├── SignUpModal.tsx
│   │   └── WheelOfLife.tsx
│   ├── services/
│   │   ├── geminiService.ts    # API call wrappers (frontend → server)
│   │   └── chronos.ts
│   ├── lib/
│   │   ├── firebase.ts         # Firebase init
│   │   └── utils.ts
│   └── types.ts                # All TypeScript interfaces
├── datasets/
│   ├── life_coaching.jsonl     # Ace's coaching playbook
│   └── productivity.jsonl      # Productivity reasoning dataset
├── server.ts                   # Express backend — all AI routes
├── firestore.rules             # Production security rules
├── vercel.json                 # Deployment config
└── .env.example                # Environment variable template
```

---

## Roadmap

- [ ] Daily 24-hour reset clock (Duolingo-style streak countdown)
- [ ] Crisis-safety Tier 3 standing instruction in Ace
- [ ] Performance pass — `useCallback` + listener consolidation
- [ ] Mobile-first responsive overhaul

---

<div align="center">

Built solo at 16. No team. No funding. Just shipping.

*AETHOS — Live your life like a system that needs to be optimized.*

</div>
