# FMcalendar

A web-based scheduling calendar backed by a FileMaker Server database (via the FileMaker
OData API). Works as a normal web app in any browser and embeds cleanly in a FileMaker
Web Viewer.

- Create/edit/delete appointments, color-coded by department/resource
- Multi-day events (separate start/end dates) plus start/end times - every appointment
  requires both a start and end date to be saved
- "Untimed" appointments (date known, time TBD) shown in a separate section per day
- Appointments can link to a FileMaker customer record (pulling name/address/phone) or
  stand alone with manually-entered details - see "Scheduling from a FileMaker client
  record" below for the intended way to create a linked appointment
- One-tap "Map" button to navigate to an appointment's address

## Running locally (demo data, no FileMaker needed)

```
npm install
cp .env.example .env
# edit .env: set SHARED_USERNAME / SHARED_PASSWORD / SESSION_SECRET to anything for local dev
npm run dev
```

Then open http://localhost:3000 and sign in with the `SHARED_USERNAME`/`SHARED_PASSWORD`
you set. `FM_MODE=mock` (the default) serves realistic seeded demo data from
`server/adapters/mockData.js` — no live FileMaker connection required, so the whole app is
fully clickable end to end before FileMaker OData is ever turned on.

## Connecting to live FileMaker data

See [`docs/filemaker-setup.md`](docs/filemaker-setup.md) for the full runbook: enabling
OData on FileMaker Server, the account/privileges required, the networking prerequisite
(FileMaker Server must be reachable from the public internet over HTTPS with a valid cert),
and the environment variables to flip `FM_MODE` from `mock` to `odata`.

## Deploying to Render

This repo includes a `render.yaml`. In the Render dashboard, create a new Blueprint from
this repo, then set the secret environment variables (`SHARED_USERNAME`, `SHARED_PASSWORD`,
and, once ready for live data, `FM_BASE_URL`/`FM_DATABASE`/`FM_USERNAME`/`FM_PASSWORD`) —
`SESSION_SECRET` is auto-generated.

## Embedding in a FileMaker Web Viewer

Point a Web Viewer object at the deployed Render URL and staff will see the normal login
screen. Sessions use a same-origin, `SameSite=Lax` cookie so sign-in persists across
navigation inside the Web Viewer for the life of the session (12 hours).

To skip the login screen entirely inside FileMaker, use the silent auto-login link instead
of the plain URL. On Render, `WEBVIEWER_TOKEN` is auto-generated as a secret separate from
the human-facing `SHARED_USERNAME`/`SHARED_PASSWORD` — copy its value from the Render
dashboard's Environment tab, then set the Web Viewer's URL to a calculation like:

```
"https://your-app.onrender.com/auto-login.html#token=" & "<paste the WEBVIEWER_TOKEN value here>"
```

The token travels in the URL fragment (after `#`), which browsers never send to the server,
so it never shows up in Render's access logs the way a normal query parameter would. The
page immediately scrubs it from the visible URL/history and redirects to the calendar once
signed in. Treat this token like a password — anyone with it has full access to the
calendar — and rotate it on Render (regenerate the env var) if the FileMaker file it's
embedded in is ever shared outside your organization.

## Scheduling from a FileMaker client record

There's no in-app client search — an earlier version tried that, but bulk-scanning the
live Clients table from the browser was too slow. Instead, staff schedule a new appointment
for an existing client the way they already do: a button/script on the client record in
FileMaker that opens (or redirects) the Web Viewer to this app with the client's Intake ID
in the URL:

```
https://your-app.onrender.com/index.html?intakeId=<Intake ID>
```

The app looks up that Intake ID (one fast, targeted lookup — not a search) and opens a new
appointment already linked to that client, with their address and phone prefilled. Staff
still pick the date/time/resource and save it themselves.

If the Web Viewer isn't already signed in (a fresh session, not the same one that's been
sitting on the calendar view), combine this with the auto-login link above — both the token
(in the fragment) and `intakeId` (in the query string) can be on the same URL:

```
"https://your-app.onrender.com/auto-login.html?intakeId=" & YourTable::IntakeID & "#token=<the WEBVIEWER_TOKEN value>"
```

`auto-login.html` forwards the `intakeId` query string through automatically once it's
signed in, so this works the same either way — script it as an **Open URL** or **Set Web
Viewer** step wherever your Client layout's "schedule appointment" button already lives.

## Project structure

```
server/
  app.js                 Express entry point, session/auth, static file serving
  routes/                auth, appointments, clients, config REST endpoints
  adapters/               CalendarAdapter interface + mockAdapter + odataAdapter
config/resources.js       Single source of truth for the resource -> color mapping
public/                   Frontend: FullCalendar-based UI (no build step)
docs/filemaker-setup.md   FileMaker OData enablement runbook
```
