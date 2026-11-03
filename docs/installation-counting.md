# Installation counting and privacy

Tucky measures downloads separately from optional first launches. Neither metric
is an exact number of people, active users, or a download-to-install conversion rate.

## Download totals

The daily GitHub workflow counts `.dmg`, `.tar.gz`, and `.exe` release-asset downloads
across all release API pages, excluding unpublished drafts. It excludes signatures and other assets. Downloads
include updates, repeated downloads, aliases, and automation; they are not unique
installations. Windows Actions artifacts are outside this release-asset count.

Adding DMGs will cause a historical jump in `stats/downloads.json`. That increase
must not be presented as new installations on the day the workflow is updated.
Existing snapshots are preserved. No workflow has been run remotely for this change.

## Optional first-launch report

Only a fresh primary installation offers the choice during onboarding. Existing
settings stores (including a reset store) and isolated variants are ineligible.
There is no startup report, preselected consent, persistent server-side identity,
or ongoing usage reporting. Continuing or skipping setup sends nothing.

The separate **Count this installation** button sends this exact shape:

```json
{"event":"first_launch","version":"1.0.28","platform":"macos"}
```

The version is the installed package version. Platforms are macos/windows/linux.
The app saves a local choice before sending, serializes concurrent choices, uses
an eight-second timeout, refuses redirects, and does not retry an ambiguous delivery.
Only HTTP 204 confirms acceptance. **Don't send** persists a refusal locally and
makes no request. The collector rejects extra fields, including identifiers or content.
No recordings, transcripts, names, emails, hardware details, or usage history are sent.

Counts represent consenting first launches, with intentional undercounting on network
failures. Removing all application settings can allow a later installation to be counted
again. Declined or unreported installs cannot be estimated reliably from these numbers.
Existing users cannot be retroactively measured by this feature.

## Local collector and reading totals

The standard-library collector stores only daily UTC totals by version and platform
in SQLite. There is no public read endpoint, individual event table, exact request
timestamp, or request/access/error logging. It ignores request metadata and does not
store or hash IP addresses. The HTTP connection necessarily exposes the source IP to
the network and hosting infrastructure; absence of logging in this process alone
cannot guarantee that a host, proxy, CDN, or monitoring service does not retain it.

For a local check (use a throwaway path, not a tracked file):

```sh
python3 services/adoption/collector.py --database /tmp/tucky-counts.sqlite
python3 services/adoption/collector.py --database /tmp/tucky-counts.sqlite --summary
```

The listener is loopback-only on port 8788. Read aggregates on the host or through an
SSH tunnel. Treat the database and its backups as aggregates; do not add raw request logs.

## Activation requires a separate deployment

Reporting is **disabled in ordinary builds** until `TUCKY_ADOPTION_ENDPOINT` is set
at Rust compile time to an HTTPS URL ending in `/first-launch`. An invalid or absent
address produces an unavailable message and no report. There is no default destination.
This change does not deploy a collector, push code, publish a release, or change the
installed app.

Before enabling a release:

1. Deploy the collector privately behind a hardened HTTPS reverse proxy. Keep the
   listener inaccessible from outside the host. Use a dedicated service account and
   persistent database location. Do not expose Python's listener directly to the internet.
2. Disable request/access logging and request-data capture throughout the proxy,
   hosting, CDN, monitoring, and backup chain. Confirm provider retention behavior.
   For example, an nginx location needs both `access_log off;` and
   `error_log /dev/null;`, with no inherited request mirroring or tracing.
3. Limit request bodies and connection rates at the edge without persisting IPs.
   The public endpoint has no client secret or persistent deduplication identifier;
   fabricated requests can inflate totals. These are directional adoption metrics.
4. Verify HTTPS, 204 responses, rejected extra fields, aggregate storage, and absence
   of retained metadata using synthetic traffic. Confirm the UI privacy disclosure
   matches the deployed infrastructure before enabling it.
5. Build with `TUCKY_ADOPTION_ENDPOINT=https://YOUR_HOST/first-launch` in the Rust
   build environment, then test a fresh isolated data location without reporting
   developer/simulator installs as new public installations. Publish only with approval.

The endpoint itself is public configuration, not a secret. Never embed an admin key
in the app. The optional disclosure appears in English for locales without a translation.

## Verification

```sh
python3 scripts/test-download-counts.py
python3 -m unittest discover -s services/adoption -p 'test_*.py'
bun run build
bun run test:e2e -- e2e/installation-count.spec.ts e2e/onboarding.spec.ts
cd src-tauri && cargo test --lib adoption::tests
```
