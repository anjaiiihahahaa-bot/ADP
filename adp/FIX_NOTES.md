# ADP startup and logging fixes

This source revision addresses the startup/configuration faults found during review:

- The installer previously wrote `DB_ENGINE=postgres` and only `POSTGRES_*`/`MARIADB_*`, while the backend expected `postgresql` and `DB_*`. The backend now accepts both legacy and canonical names, and the installer writes canonical `DB_*` values.
- `.env` is now loaded from the project root independent of whether Node/PM2 starts from the project root, `backend/`, or `backend/dist/`.
- The logger creates its log directory before opening file transports and avoids JSON stringify/parse redaction that could break on unusual error objects.
- Startup errors are also written to stderr so they remain visible if file logging fails.
- Removed `.env.example` as requested; installer generates the private `.env` file.

After replacing source on the VPS, rebuild the backend and restart only the `adp` PM2 process. Preserve the existing `.env`; do not overwrite it with `.env.example`.

Note: this environment could not complete dependency installation/build validation because `npm install` timed out. Run `npm run build` on the VPS after copying the source. MariaDB migration compatibility is not certified; the migration SQL currently uses PostgreSQL-specific types and placeholders, so PostgreSQL is the supported path for this revision.

- Installer prints the admin username, email, and password once at the end and instructs the operator to save them privately. No separate plaintext credentials file is created.
