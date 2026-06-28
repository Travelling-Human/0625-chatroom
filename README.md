# 0625

Anonymous, no-account chatrooms. Text + voice only — never photo or video.
Anyone can start a channel on any topic; the creator can flip it between
**public** (listed for everyone) and **private** (link/code only).

Stack: **Node.js + Express + Socket.IO + MongoDB (Mongoose)**, plain
HTML/CSS/JS frontend (no build step, no React) — chosen specifically so it
runs comfortably inside Termux.

---

## 1. Install prerequisites in Termux

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git unzip
node -v        # should print v18+ or v20+
```

## 2. Get the project files onto your phone

If you downloaded `0625.zip` from this chat:

```bash
cd ~
unzip 0625.zip
cd 0625
```

(If you move this to GitHub instead, `git clone <your-repo-url>` works too —
and you'll want a repo there anyway for step 7, deploying.)

## 3. Install dependencies

```bash
npm install
```

This only needs `express`, `mongoose`, `socket.io`, `dotenv`, and `nanoid` —
all pure JavaScript, nothing that needs to compile, so it installs cleanly
on Termux/Android.

## 4. Set up MongoDB

MongoDB itself doesn't run natively on Android/Termux, so the easiest path
is a free **MongoDB Atlas** cluster (cloud-hosted, works fine from a phone):

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. Create a free **M0** cluster (any region near you).
3. Under **Database Access**, create a database user with a username/password.
4. Under **Network Access**, add `0.0.0.0/0` (allow access from anywhere) —
   simplest option for a personal project. You can lock this down later.
5. Click **Connect → Drivers**, copy the connection string. It looks like:
   `mongodb+srv://USER:[email protected]/?retryWrites=true&w=majority`

Then in the project folder:

```bash
cp .env.example .env
nano .env
```

Paste your connection string into `MONGODB_URI` (keep `/0625` in the path so
it uses a database called "0625"). While you're in there, also set
`ADMIN_KEY` to a long random string of your own — this unlocks the admin
console covered further down. Save with `Ctrl+O`, `Enter`, exit with
`Ctrl+X`.

## 5. Run it locally

```bash
npm start
```

You should see:

```
[OK] Connected to MongoDB
[OK] 0625 online at http://localhost:3000
```

Open `http://localhost:3000` in any browser app on the same phone (Chrome,
Firefox, etc — Termux itself has no browser). Text chat, emoji, room
creation, and the public/private toggle all work immediately over plain
`localhost`.

## 6. About voice messages and HTTPS

Browsers only allow microphone access (`MediaRecorder`/`getUserMedia`) on
**secure contexts**: `https://` or `localhost`. So:

- On the **same phone**, `http://localhost:3000` works fine for voice notes.
- From **another device** on your network (`http://<phone-ip>:3000`), text
  chat will work but voice recording will likely be blocked by the browser
  because it isn't HTTPS.
- Once deployed to Render (step 7), the live URL is HTTPS automatically, so
  voice notes work for everyone, everywhere.

For a quick local test with friends without deploying anywhere, tunnel your
Termux server through HTTPS:

```bash
npx localtunnel --port 3000
```

This prints a public `https://something.loca.lt` URL you can share. No
account needed — but it only stays up while that Termux session is running.

---

## 7. Deploying it for real (free, always-on, no credit card)

**Hosting: Render.**
As of 2026, Render is the most reliable option for a small Node + Socket.IO
app that needs to stay genuinely free with no credit card: it natively
supports WebSocket connections, includes a free TLS certificate, and lets
you attach a custom domain at no extra charge. The honest trade-offs: the
free tier sleeps after ~15 minutes of no traffic (the first visitor after
that waits 30–50 seconds for a cold start), and it caps you at 750 hours/month
(more than enough for one always-used app). Socket.IO's client already
auto-reconnects when a connection drops, and 0625 shows a "connection lost,
retrying..." message for exactly this case, so neither of these is a
dealbreaker for a project like this.

Alternatives if you outgrow Render: Railway and Fly.io are both solid but
now require a credit card and aren't really "free" past a one-time trial
credit — worth it later if you want more headroom, not needed to start.

**Steps:**

1. Push this project to a GitHub repo (you'll need a free GitHub account):
   ```bash
   cd ~/0625
   git init
   git add .
   git commit -m "0625 — initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/0625.git
   git push -u origin main
   ```
   (`git push` from Termux will ask for your GitHub username and a
   [personal access token](https://github.com/settings/tokens) instead of a
   password — generate one with "repo" scope and use that.)
2. Go to https://render.com, sign up free (no card), click **New → Web
   Service**, and connect your `0625` GitHub repo.
3. Configure it:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Under **Environment**, add an environment variable `MONGODB_URI` with
   your Atlas connection string (same one from step 4 above). Also add
   `MAX_VOICE_SECONDS` / `MAX_VOICE_BYTES` if you want non-default limits.
5. Deploy. Render gives you a free live URL like `https://0625.onrender.com`
   immediately, with HTTPS already handled.

## 8. Adding a custom domain ("0625.com" instead of "0625.onrender.com")

Worth being upfront about: **a real top-level domain (`.com`, `.dev`, `.xyz`,
etc.) is not free anywhere long-term** — registrars charge a yearly fee, full
stop. Freenom (the old "free `.tk`/`.ml`" service) shut down in 2023. What
*is* available for free:

- **Use Render's free subdomain** — `0625.onrender.com` — and skip buying a
  domain entirely. Simplest option, zero cost, already HTTPS.
- **Free third-party subdomains** — services like
  [eu.org](https://eu.org) let you register something like `0625.eu.org` at
  no cost, forever, though it requires a manual approval step and DNS
  setup. Not as instant as Render's own subdomain, but a real custom-looking
  address.
- **A cheap real domain** — if you want an actual `.com`/`.xyz`/etc., the
  cheapest reputable registrars in 2026 (Porkbun, Cloudflare Registrar,
  Namecheap) sell common extensions from around $1–12/year, sometimes less
  for the first year on less common TLDs. Once you own it, pointing it at
  Render is free: add it under your Render service's **Settings → Custom
  Domains**, then add the CNAME/A record Render gives you at your registrar.
  Render issues the SSL certificate automatically.

---

## What's new: age/terms gate

First-time visitors (to either page) see a full-screen notice with your
warning text and a checkbox ("I confirm I am 18+ and agree to the terms").
The `[ ENTER ]` button stays disabled until the box is checked. On accept:

- The acceptance is saved in the browser's `localStorage`, so the same
  device won't see it again (until you change `TERMS_VERSION` in
  `public/js/consent.js`, which forces everyone to re-accept — bump this any
  time you materially change the wording).
- It's also logged to MongoDB via `POST /api/consent`, recording the IP
  address, user-agent, timestamp, and terms version — a record you can point
  to later if you ever need to show someone agreed before using the site.
- A "leave" link is included for anyone who doesn't agree, sending them
  away from the site rather than just leaving them stuck.

One honest legal note, since you mentioned this is partly for legal
reasons: logging IP addresses is itself collecting personal data in many
jurisdictions (e.g. it counts as such under GDPR). That doesn't mean don't
do it — it's a completely standard practice — but if this ever gets real
traffic, it's worth pairing this notice with an actual privacy policy
covering what you log and why. I'm not a lawyer and this isn't legal advice.

## What's new: admin console (banning IPs)

There's a moderation page at **`/admin.html`** — not linked from anywhere in
the UI, only reachable if you type the URL. It does nothing without the
`ADMIN_KEY` you set in `.env`, entered into the key field on that page (kept
only in that browser tab's `sessionStorage`, so it clears when the tab
closes).

What it does:

- **Look up a channel's messages** by code, including the sender's IP next
  to each one (IPs are never shown anywhere in the normal chat UI — only
  here). Each message has a **[ ban this ip ]** button right next to it.
- **Ban an IP** directly, with an optional reason. Banning disconnects that
  IP immediately if they're currently online, and blocks them from creating
  rooms, sending messages, or joining any channel from then on.
- **Manage the ban list** — see every banned IP with its reason and date,
  and unban any of them.

A couple of things worth knowing:

- This is the realistic, best-effort version of "banning" discussed earlier
  — it bans an **IP address**, not a person. It stops casual repeat
  offenders cold; it won't stop someone who switches networks or uses a VPN.
- Keep `ADMIN_KEY` private — anyone who has it can ban/unban and read
  message-sender IPs. Treat it like a password; don't commit it anywhere
  public.
- The admin API enforces the key server-side (`X-Admin-Key` header, checked
  with a constant-time comparison), so the page itself being reachable isn't
  a real exposure — but it's still worth not linking to `/admin.html` from
  the site, which this build deliberately doesn't.

## What's new: emoji

The composer has a 🙂 button next to the text input that opens a small
categorized picker (smileys, gestures, hearts, tech/hacker symbols). Tapping
an emoji inserts it at your cursor position. This is just a convenience —
emoji already worked before this button existed, since messages are plain
Unicode text end-to-end (phone keyboards, MongoDB, and the page itself all
handle it natively); the picker just makes them easy to reach without
switching keyboards.

## How it works

- **No accounts.** Each browser tab gets a random codename (e.g.
  `CIPHER_8841`) stored only in `sessionStorage` — gone when the tab closes.
- **Rooms** are created with a topic + visibility. The creator's browser
  stores a secret "owner token" in `localStorage`, which is the only way to
  flip a room's visibility later (lost if you clear browser data — there's
  no recovery, by design, since there are no accounts).
- **Public rooms** are listed on the homepage, sorted by recent activity.
- **Private rooms** aren't listed — only reachable via direct link or the
  channel code, via the "join by code" box on the homepage.
- **Messages** are real-time over Socket.IO and persisted in MongoDB
  (`Room` and `Message` collections). Voice notes are stored as binary
  (`Buffer`) directly in MongoDB, capped at 60 seconds / ~2MB by default
  (tune `MAX_VOICE_SECONDS` / `MAX_VOICE_BYTES` in `.env`).
- **No photo/video upload exists anywhere in the code** — not hidden behind
  a flag, just not built, per your spec.

## Project structure

```
0625/
├── server.js              Express + Socket.IO + REST API
├── models/
│   ├── Room.js              topic, isPrivate, hashed owner token
│   ├── Message.js           text or voice (Buffer), per room, ip for mods
│   ├── Consent.js           age/terms acceptance log
│   └── Ban.js               banned IP addresses
├── utils/handles.js        anonymous codename generator (server-side)
├── public/
│   ├── index.html           homepage: create / join / browse channels
│   ├── room.html             chat room shell
│   ├── admin.html            moderation console (unlinked, key-gated)
│   ├── css/style.css         the whole "90s hacker movie" design system
│   └── js/
│       ├── matrix-rain.js     canvas rain background effect
│       ├── boot.js            terminal boot/typewriter sequence
│       ├── utils.js           shared client helpers (handles, formatting)
│       ├── consent.js         age/terms gate
│       ├── home.js             homepage logic
│       ├── room.js             chat logic, Socket.IO, voice + emoji
│       └── admin.js            moderation console logic
├── .env.example
└── package.json
```

## Known limitations (worth knowing before going public with this)

- No automatic moderation, profanity filter, or rate limiting — moderation
  is manual, via the admin console's IP bans. Like 4chan, anyone can post
  anything in a public room until you ban them.
- Private rooms are "unlisted," not password-protected — anyone with the
  link/code can join. Fine for sharing with friends, not for real secrecy.
- Online counts are tracked in memory and reset if the server restarts.
- No message deletion/editing yet, and channel history isn't paginated past
  the most recent 50 messages — both are reasonable next features.

## Customizing the look

All colors, fonts, and glow effects live as CSS variables at the top of
`public/css/style.css` (`:root { --green-core: ...; --cyan-signal: ...; }`).
Change those and the whole site re-themes — no need to hunt through files.
