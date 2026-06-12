# Amoredio Events

A small internal web app for emailing event participants. Sign in with your
organization's Google account, pick an event from your Drive's **Events**
folder, choose its registration-responses sheet, compose a personalized email
(reminder or thank-you), and send it to everyone who registered.

- **Reminder** and **thank-you** email templates
- Gmail-style rich text editor with **inline images** and **attachments**
- `{name}` personalization per recipient
- Sends through the **Gmail API** as your org account (good deliverability)
- Reads everything from your existing **Google Drive / Forms** setup — no database

---

## How it works

1. **Sign in** with the organization's Google account.
2. The app lists the subfolders inside your Drive **Events** folder — one per event.
3. Open an event → pick the **registration form responses** Google Sheet.
4. The app reads the `Name` and `Email Address` columns (auto-detected, with a
   dropdown to override).
5. Compose the email and click **Send**. Each person gets an individual,
   personalized message.

---

## One-time Google Cloud setup

You need a Google Cloud project with the right APIs and an OAuth client. This
takes ~10 minutes and only has to be done once.

### 1. Create / select a project
- Go to <https://console.cloud.google.com/> and create a project (or pick one).

### 2. Enable the APIs
In **APIs & Services → Library**, enable all three:
- **Google Drive API**
- **Google Sheets API**
- **Gmail API**

### 3. Configure the OAuth consent screen
- **APIs & Services → OAuth consent screen**.
- User type: **Internal** (if the org uses Google Workspace) or **External**.
- Fill in the app name and your support email.
- The app will request these scopes: `drive.readonly`, `spreadsheets.readonly`,
  `gmail.send`, plus `openid email profile`.
- If you chose **External**, add your Google account under **Test users**
  (otherwise Google blocks sign-in until the app is verified).

### 4. Create the OAuth client
- **APIs & Services → Credentials → Create credentials → OAuth client ID**.
- Application type: **Web application**.
- **Authorized redirect URI**:
  ```
  http://localhost:3000/api/auth/callback/google
  ```
- Create it, then copy the **Client ID** and **Client secret**.

### 5. Fill in your environment
Open `.env.local` (already created for you) and paste the values:
```env
AUTH_GOOGLE_ID=your-client-id.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=your-client-secret
```
`AUTH_SECRET` is already generated. Leave `AUTH_URL=http://localhost:3000`.

### 6. Point the app at your Events folder
Either keep the default (it searches Drive for a folder literally named
`Events`):
```env
EVENTS_FOLDER_NAME=Events
```
…or, to be unambiguous, open the folder in Drive and copy its ID from the URL
(`https://drive.google.com/drive/folders/THE_ID`) into:
```env
EVENTS_FOLDER_ID=THE_ID
```

---

## Run it

```bash
npm install      # already done if you scaffolded this
npm run dev
```

Open <http://localhost:3000>, sign in, and you're ready.

---

## Notes & limits

- **Sending model**: you click **Send** at the moment you want the email to go
  out (e.g. the day before / day after the event). There's no scheduler.
- **Inline images** are converted from data-URIs into `cid:` attachments at send
  time, because Gmail strips base64 data-URIs from received mail.
- **Attachments** are capped at ~20 MB total (Gmail's hard limit is 25 MB).
- Built for **< 100 participants per event** — emails are sent one by one, so a
  send takes a few seconds per couple dozen recipients.
- Recipients with blank, invalid, or duplicate emails are automatically skipped;
  the count is shown before you send.
- The app holds **no database**. It reads Drive/Sheets live and sends through
  Gmail; nothing is stored.

## Deploying to Vercel

This app needs a Node server (it has API routes that call Gmail/Drive/Sheets),
so it can't be hosted as a static site. Vercel runs it for free on the **Hobby**
tier with automatic HTTPS, which OAuth requires.

### 1. Push to GitHub
Create a **private** repo and push. Secrets stay out of git: `.env.local` and
`public/tinymce` are gitignored, and the `postinstall` script re-copies TinyMCE
into `public/` during Vercel's build automatically.

### 2. Import the repo into Vercel
At <https://vercel.com> → **New Project** → import the repo. It auto-detects
Next.js. Set the environment variables (below) **before** the first deploy.

### 3. Set environment variables
In Vercel → **Project → Settings → Environment Variables**, add the same keys as
`.env.example`, with `AUTH_URL` pointing at your production domain:

```env
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_SECRET=...                 # reuse yours, or: openssl rand -base64 32
AUTH_URL=https://your-domain    # NOT localhost
EVENTS_FOLDER_ID=...
```

### 4. Add your custom domain
**Project → Settings → Domains** → add your domain. Vercel shows the exact DNS
records to create. In your domain registrar's DNS panel, add those records
(typically an `A` record for the apex and a `CNAME` for `www`) — use the values
Vercel displays. HTTPS is issued automatically once DNS resolves.

### 5. Update Google OAuth for the new domain
In Google Cloud Console → your OAuth client, **keep the localhost entries** and
add the production ones:
- **Authorized JavaScript origins**: `https://your-domain`
- **Authorized redirect URIs**: `https://your-domain/api/auth/callback/google`

### 6. Who can sign in
The OAuth app starts in **Testing** mode, so only the owner and added test users
can log in. For wider access either set the consent screen to **Internal** (if
the org uses Google Workspace), add each person under **Test users**, or submit
the app for Google verification (needed to publish, because it uses the
sensitive `gmail.send` / Drive scopes).

## Tech

Next.js (App Router) · TypeScript · Tailwind · Auth.js · googleapis · TinyMCE
(self-hosted) · nodemailer (MIME building).
