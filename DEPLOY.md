# Deploy in 3 minutes

The app is a static page plus two tiny Python functions. Nothing to configure, no
environment variables, no build step.

---

## 1 · Push to GitHub

```bash
cd dispo-app
git remote add origin https://github.com/<your-user>/dispo-app.git
git branch -M main
git push -u origin main
```

The repo already contains a commit, `.gitignore`, two workflows and a `vercel.json`.
If you prefer the GitHub CLI:

```bash
gh auth login
gh repo create dispo-app --private --source=. --remote=origin --push
```

---

## 2 · Deploy to Vercel

### With the CLI (recommended — takes one minute)

```bash
npm i -g vercel
vercel login
vercel --prod
```

Answer the prompts like this:

| Prompt | Answer |
|---|---|
| Set up and deploy? | **Y** |
| Which scope? | your personal account |
| Link to existing project? | **N** |
| Project name? | `dispo-app` |
| In which directory is your code located? | `./` |
| Want to modify the settings? | **N** (the `vercel.json` already sets everything) |

You get a URL like `https://dispo-app-<hash>.vercel.app`.

### With the dashboard

1. **vercel.com → Add New → Project → Import Git Repository**
2. Pick `dispo-app`
3. Framework preset **Other**, build command **empty**, output directory **`.`**
4. **Deploy**

### One-click button (after step 1)

Add this line to the top of your GitHub README and the button will do steps 2 for anyone:

```md
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/<your-user>/dispo-app)
```

---

## 3 · Turn on protection (the data is private)

The app shows real buyer names, phones and emails and has no login, so:

**Vercel → Project → Settings → Deployment Protection → Vercel Authentication: Standard
Protection**, or set a **Password Protection** code. Then share the URL plus the code with
your team only.

If you'd rather keep it fully public, remove the phone/email columns in `template.html`
and rebuild — but the default build is meant for internal use.

---

## 4 · Automation after deploy

| What | Where | How often |
|---|---|---|
| Full data refresh (statuses, prices, KPIs, rebuild) | GitHub Actions → *Refresh site data* | every 6 hours |
| Live check from the browser | the **Refresh from site** button | on demand |
| Automatic redeploy | Vercel Git integration | on every push to `main` |

To change the schedule edit `.github/workflows/refresh-data.yml`:

```yaml
on:
  schedule:
    - cron: '0 */6 * * *'   # every 6 hours → change to */2 for every 2 hours
```

To run it immediately: **Actions → Refresh site data → Run workflow**.

> The Action commits the refreshed `data.json` and `index.html`, and Vercel redeploys
> automatically — so the deployed site tracks the website without anyone touching it.

---

## 5 · Custom domain (optional)

**Vercel → Project → Settings → Domains → Add** → `dispo.yourdomain.com` → add the CNAME
record Vercel shows you. HTTPS is issued automatically.

---

## Local development

```bash
npm run dev        # static only      → http://localhost:8080
vercel dev         # static + /api/*  → http://localhost:3000
npm run build      # rebuild index.html from template.html + data.json
npm run scrape     # refresh site data (writes site_snapshot.json)
```

`python3 scripts/apply_snapshot.py` merges a snapshot into `data.json`; run it after
`npm run scrape`, then `npm run build`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| “Live refresh unavailable” toast | you're on the static build (`npm run dev`) — use `vercel dev` or the deployed URL |
| A property shows `Off-market` | the scraper didn't find it on the site; open **Site Changes** to see what is live |
| Action fails at `git push` | repo → Settings → Actions → General → Workflow permissions → **Read and write** |
| Build shows the old data | Vercel cached the page — the header sets `must-revalidate`, do a hard reload |
