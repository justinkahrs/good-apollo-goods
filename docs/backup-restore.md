# Backup and restore

Production recovery was configured and verified November 11, 2026. The existing 04:00 America/Detroit encrypted capture includes both store databases and private Garage media/configuration; the existing hourly minute-20 TrueNAS pull verifies ciphertext and retains a separate Good Apollo archive with **30 daily / 12 monthly points plus its last verified restore**. Maximum loss window: 24 hours; data restoration target: four hours. An independent five-minute TrueNAS observer checks snapshot age and public store health and delivers receipt-aware operations Slack alerts. A repair-time manual recovery succeeded; the next natural 04:00 capture remains a future scheduled run, monitored by those existing checks.

Justin approved the 50 GiB/$5-per-month recovery-buffer volume. Its UUID is checked before capture, so a missing/wrong mount cannot fall back to the root disk. Existing prelaunch recovery points and rollback images remain; only the separately approved, hash-matched duplicate root copy was removed. The source buffer retains five daily points plus the last globally verified restore. Existing shared TrueNAS retention is preserved; Good Apollo's scoped archive is independent of its deletion decisions. Same-day intermediate repair copies can expire under the existing retention policies.

The source is `~/Projects/infra/operations/recovery/backup.py`; deployed code is `.runtime/recovery-release5/code/backup.py` on Senna. TrueNAS uses `runtime/nas_job.py` and `good_apollo_archive.py` under `/mnt/Main/backups/senna-automation`. Store snapshots live under `/mnt/Main/backups/senna-automation/good-apollo-goods`. Private GPG decryption keys stay on the operator Mac, separate from encrypted VPS/NAS artifacts. The generated source manifest contains all 30 table hashes in each store database and object-storage recovery files; it contains no plaintext customer rows.

Garage metadata must use its [consistent online snapshot](https://github.com/deuxfleurs-org/garage/blob/main-v2/doc/book/reference-manual/configuration.md), not a raw live SQLite/WAL copy. Capture runs `/garage meta snapshot --all`; restore promotes the latest captured `meta/snapshots/<timestamp>/db.sqlite` before starting the isolated Garage. Immutable object blocks and private configuration are backed up alongside database references.

## November 11 independent production-media restore

Full run `20261111T194945Z` contains 48 encrypted artifacts / 7,080,697,891 bytes; the existing native NAS pull verified the set. Manual scoped catch-up `20261111T200511Z` contains six artifacts / 102,530,691 bytes, manifest SHA-256 `ca5a61899571546fe9e155d5efc81cd3832eaf20f90e05f4444b70bf370e5854`. It was verified on TrueNAS and then independently retrieved from that host for restoration into new, labeled network-none Docker resources on the existing VPS. This is an isolated data-recovery environment, not a bare-metal failover or production cutover.

Both production and preview databases matched all 30 table hashes each; both stock ledgers had zero drift. The restored production gallery and image returned 200, and the image decoded as 800×800 WebP. The retained synthetic preview order preserved $23.95 paid/refunded, two lines, three units and one shipment. Data restoration took **430.8 seconds**; backup age at start was 195.6 seconds. All five temporary containers/two volumes were removed. No production domain data or real provider was written. Evidence: ignored `output/launch-audit/store-nas-restore.json`; its matching restore receipt is retained with the NAS snapshot.

Repeat with an independently retrieved scoped snapshot, the existing operator key, and the exact app/Garage images recorded in encrypted runtime metadata (retain/rebuild the recorded application revision before disaster recovery):

```sh
DOCKER_HOST=ssh://senna-infra python3 ~/Projects/infra/operations/recovery/restore_good_apollo.py \
  /private/path/to/retrieved-snapshot \
  --key-home ~/.codex/ops/senna-recovery-keys \
  --report /private/path/to/restore-report.json
```

The helper verifies table hashes, the immutable November 11 rehearsal order, consistent Garage metadata and an actual rendered gallery. It forbids production mounts, published ports and provider networking. A separate `probe_good_apollo_outages.py` helper, with the same arguments, verifies private storage failure, durable mail retry across an app restart/exactly-once controlled recovery, and database unhealthy status. The latter uses a local synthetic HMAC acceptance endpoint and makes no real send.

After a real incident, reconcile Stripe/provider activity after the snapshot before any production cutover. Never overwrite accepted orders with an older snapshot. Whole-host/provider resumption remains a separate procedure from this measured data restore.

## Optional local application archive tool

The original local `.gagbackup` workflow below remains available for disposable drills; production uses the managed GPG/NAS process above.

`scripts/backup.ts` takes a consistent PostgreSQL exported snapshot, dumps the database and copies every referenced original/derivative plus historical order image reference. Immutable media keys make that manifest stable. Media hashes are recorded. The resulting `.gagbackup` is AES-256-GCM encrypted with a separately stored 32-byte hex `BACKUP_KEY`. The key must not be stored with the off-host backup. Private temporary plaintext is deleted after success or failure. Never commit backups or keys.

Configure `BACKUP_KEY`, `BACKUP_DIR` and optional `PG_DUMP_BIN` privately. The backup identity needs database read/snapshot access and S3 read access for the dedicated bucket; no Vesper scope. Run `npx tsx scripts/backup.ts` on an operations host with matching PostgreSQL tools, then transfer the encrypted file to restricted off-host storage. A daily independent scheduler must alert on missed/failed backups; local manual execution is not a backup service. The script currently bounds archive memory to 512 MB and is intended for the launch-sized store; expand to a streaming archive before exceeding that size.

For an isolated drill, create an empty localhost database named `good_apollo_restore` and a separate local S3 bucket. Set `RESTORE_DATABASE_URL`, `RESTORE_S3_BUCKET` and the private decryption key, then run `npx tsx scripts/restore.ts <backup-file>`. This script refuses a nonempty database, non-local target, a target not ending in `_restore`, or the source media bucket. It authenticates the archive, checks path/media integrity and restores into the separate target. It does not clean or overwrite the source.

After restoration, run ledger/reservation consistency queries, inspect immutable purchase/item totals, and request a restored sample gallery using the restored database/media environment. Record start/end time, backup timestamp, counts, actual gallery result and ledger/order checks in the release packet. Rehearse with a historical fixture order, not merely an empty schema. A successful command alone does not prove a complete four-hour recovery.

In production incidents, disable new sales, reconcile any payments/orders accepted after the snapshot, restore to a new environment and cut over only after accounting for that gap. Never overwrite newer accepted orders as an automatic deployment rollback. This original application script remains limited to local drills; the managed production-data procedure and measured boundaries are described above.

## Observed isolated drill

September 30, 2026, 21:47:20 UTC: `npx tsx scripts/restore-drill.ts` completed in four seconds using separate random local source/restore databases and S3 buckets, synthetic data and a new private encryption key. It restored one product, one historical paid order, two stock movements and four referenced media objects. The restored storefront gallery and image route returned successfully; the WebP decoded, the ledger and balance both contained three unsold units, and the immutable order total remained $122.97. Redacted evidence: `output/validation/restore-drill.json` (ignored local artifact). Private target/key configuration is in `.local/restore-drill.env` and must never be committed.

The drill requires the standalone build, PostgreSQL dump/restore tools, isolated local S3 and a localhost administration connection with database-create privileges. `DRILL_ADMIN_DATABASE_URL` overrides the Mac's current-user local administrator. It creates new fixture databases rather than overwriting development or existing tests. Keep the restored environment only as needed for inspection; clean up its exact random fixture database/bucket names after review. This historical local drill does not replace the newer production-media evidence above.
