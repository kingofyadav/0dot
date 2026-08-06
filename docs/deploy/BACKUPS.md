# Database backups

`scripts/backup-db.mjs` takes a hot backup of the SQLite database via
`better-sqlite3`'s native backup API (SQLite's official online-backup
mechanism) — safe to run while the app is serving traffic, unlike copying
the `.db` file directly, which can capture a torn snapshot mid-write.

```bash
node scripts/backup-db.mjs
```

Env vars (all optional):

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Same value the app uses |
| `BACKUP_DIR` | `./backups` | Where `.bak` files are written |
| `BACKUP_RETENTION_DAYS` | `14` | Backups older than this are pruned each run |

## Scheduling on the VPS (systemd timer)

`/etc/systemd/system/0dot-backup.service`:

```ini
[Unit]
Description=0dot.in database backup

[Service]
Type=oneshot
WorkingDirectory=/opt/0dot-app
EnvironmentFile=/opt/0dot-app/.env
ExecStart=/usr/bin/node scripts/backup-db.mjs
```

`/etc/systemd/system/0dot-backup.timer`:

```ini
[Unit]
Description=Run 0dot.in database backup daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now 0dot-backup.timer
sudo systemctl list-timers 0dot-backup.timer   # confirm it's scheduled
sudo systemctl start 0dot-backup.service       # run once now to sanity-check
```

A plain cron entry works the same way if you'd rather not use systemd:

```cron
0 3 * * * cd /opt/0dot-app && /usr/bin/node scripts/backup-db.mjs >> /var/log/0dot-backup.log 2>&1
```

## Off-site copy

Everything above still leaves every backup on the same disk as the live
database — a disk failure takes both out at once. Once backups are landing
reliably, add a second step that ships the latest file off the VPS (e.g.
`rclone copy` to object storage, or `scp`/`rsync` to a second host) as part
of the same service/cron job. Not automated yet — pick a destination first.

## Restoring

```bash
# Stop the app first so nothing writes to the DB mid-restore.
cp backups/dev.db.<timestamp>.bak prisma/dev.db   # or wherever DATABASE_URL points
# Start the app back up.
```

No rollback/restore procedure has been tested end-to-end yet beyond this —
worth a dry run against a copy of production before relying on it during a
real incident.
