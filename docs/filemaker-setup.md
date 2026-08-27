# Connecting FMcalendar to live FileMaker Server data

FMcalendar runs against an in-memory demo dataset by default (`FM_MODE=mock`) so it can be
built, tested, and deployed before FileMaker OData is available. This document is the
runbook for turning on the real connection.

## 1. Enable OData on FileMaker Server

**Server level (FileMaker Server Admin Console, `https://<fmserver-host>:16443/`):**

1. Go to the OData / Connectors settings.
2. Enable OData API access. Save/apply.

**Database (file) level, in FileMaker Pro against the hosted file:**

1. `File > Manage > Security`.
2. Create a **dedicated service account** for this app (recommended name: `odata_svc`) with
   its own privilege set — do not use an admin account. Give it a strong, unique password.
3. On that privilege set, under **Extended Privileges**, check **`fmodata`** ("Access via OData API").
4. Still on that privilege set, grant View/Create/Edit/Delete record access to the
   `Schedule`, `Intake_System`, and `Clients` tables — `fmodata` only gates the transport,
   table-level access is separate.
5. If the solution spans multiple files, repeat step 3 in every file involved.

**Add the new field:**

- Add a text field named `Phone` to the `Schedule` table (used to store a manually-entered
  phone number for appointments that aren't linked to a Clients record).

**Verify:**

- From a browser or `curl`, hit `https://<fmserver-host>/fmi/odata/v4/<FileName>/$metadata` —
  you should get a Basic-auth prompt, and after entering the `odata_svc` credentials, an XML
  metadata document listing the tables.

## 2. Networking prerequisite (not something we can configure from this side)

Render is a hosted platform, not on your office LAN — it calls FileMaker Server over the
public internet. Before cutover, confirm:

- FileMaker Server is reachable from the public internet on HTTPS (default port 443 for
  the Data/OData API), through your firewall/router.
- It has a **valid, CA-issued certificate** (Let's Encrypt or commercial) — not self-signed.
  The app will not disable TLS verification, so a self-signed cert will cause every request
  to fail.
- A DNS name points at it (e.g. `fmserver.yourcompany.com`).

This is IT/networking work on your end, separate from the application code.

## 3. Set the live environment variables

On Render (Dashboard → the `fmcalendar` service → Environment), or in a local `.env` file,
set:

```
FM_MODE=odata
FM_BASE_URL=https://fmserver.yourcompany.com
FM_DATABASE=YourDatabaseName
FM_USERNAME=odata_svc
FM_PASSWORD=<the odata_svc password>
```

Redeploy (Render redeploys automatically on env var changes, or trigger a manual deploy).

## 4. Verify against one real record before broader use

FileMaker's exact OData date/time formatting and empty-field behavior can vary slightly by
version and locale, and the two-hop client lookup (`Schedule.kf_Intake_ID` →
`Intake_System."Intake ID"` → `Intake_System."CS ID"` → `Clients.ClientID`) has not been
tested against a live server. After flipping `FM_MODE=odata`:

1. Open one real appointment in the calendar and confirm the date/time/description/address
   fields all show correctly.
2. If that appointment is linked to a client, confirm the pet name and client contact info
   hydrate correctly.
3. Create a test appointment, edit it, and delete it, confirming each round-trips to
   FileMaker (check the record in FileMaker Pro directly).
4. Only after these checks pass, treat the connection as trustworthy for daily use.

## Troubleshooting

- **401 from FileMaker**: check `FM_USERNAME`/`FM_PASSWORD` and that the `fmodata` extended
  privilege is checked on that account's privilege set.
- **403 on a specific table**: that privilege set is missing record access to that table.
- **Connection refused / timeout**: the networking prerequisite in step 2 isn't satisfied yet.
- **TLS/certificate errors**: FileMaker Server's certificate isn't valid/CA-issued for the
  hostname being used.
