# Project Backups

Central private repo for Firestore dumps. Each Firebase project gets its own folder:

```text
backups/
  golden-k-tech-dev/
    firestore-backup-….json
  pharmacy-prod/          # add later
    firestore-backup-….json
```

## Schedule

| When | What |
|------|------|
| Daily 12:42 GMT | Backup every project in the workflow matrix |
| Monday 06:00 UTC | Delete oldest **half** of files **per project folder** |
| Manual | Actions → **Firestore Multi-Project Backup** → Run workflow |

## Add another project

1. Create a folder placeholder: `backups/<slug>/.gitkeep`
2. Add three GitHub Actions secrets (see below)
3. Append a matrix entry in `.github/workflows/firestore-backup.yml`

## GitHub secrets required

Add these under **Settings → Secrets and variables → Actions** on **this** repo (`project_backups`).

There is no `.env` file on GitHub — only **Actions secrets**.

### Per project (Golden K — already in matrix)

| Secret name | What to put |
|-------------|-------------|
| `GOLDEN_K_FIREBASE_PROJECT_ID` | `golden-k-tech-dev` |
| `GOLDEN_K_FIREBASE_CLIENT_EMAIL` | Service account email, e.g. `firebase-adminsdk-…@golden-k-tech-dev.iam.gserviceaccount.com` |
| `GOLDEN_K_FIREBASE_PRIVATE_KEY` | Full private key PEM — include `BEGIN`/`END` lines, **no** surrounding quotes |

### Optional (only if push is blocked by branch protection)

| Secret | What to put |
|--------|-------------|
| `GH_PAT` | PAT with `contents: write` on this repo (then update the push steps to use it) |

### For a second project (example)

| Secret |
|--------|
| `PHARMACY_FIREBASE_PROJECT_ID` |
| `PHARMACY_FIREBASE_CLIENT_EMAIL` |
| `PHARMACY_FIREBASE_PRIVATE_KEY` |

Then uncomment the `pharmacy-prod` lines in `.github/workflows/firestore-backup.yml`.

## Local test

```bash
yarn install
export FIREBASE_PROJECT_ID=…
export FIREBASE_CLIENT_EMAIL=…
export FIREBASE_PRIVATE_KEY=…
export BACKUP_PROJECT_SLUG=golden-k-tech-dev
yarn backup
```
