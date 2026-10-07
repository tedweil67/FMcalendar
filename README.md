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

There's no in-app client search or lookup — two earlier approaches were tried (a bulk
search, then a targeted lookup-by-Intake-ID) and both ran into live problems: bulk-scanning
the Clients table from the browser was too slow, and the Intake table's base table (a large,
~200-field table covering the whole intake/case workflow, with repeating fields and several
container fields) errors on every single-record OData fetch regardless of query shape.

Instead, staff schedule a new appointment for an existing client the way they already do: a
FileMaker script gathers the details itself — it has fast, native access to its own data,
possibly pulling from more than one table/source — and hands them straight to the web app as
URL parameters. No backend lookup is involved at all. Save the gathered values into script
variables and build the URL from those, e.g.:

```
Set Variable [ $description ; Value: ... ]
Set Variable [ $address ; Value: ... ]
Set Variable [ $city ; Value: ... ]
Set Variable [ $state ; Value: ... ]
Set Variable [ $zip ; Value: ... ]
Set Variable [ $phone ; Value: ... ]

Open URL [
  "https://your-app.onrender.com/index.html"
  & "?description=" & GetAsURLEncoded ( $description )
  & "&address=" & GetAsURLEncoded ( $address )
  & "&city=" & GetAsURLEncoded ( $city )
  & "&state=" & GetAsURLEncoded ( $state )
  & "&zip=" & GetAsURLEncoded ( $zip )
  & "&phone=" & GetAsURLEncoded ( $phone )
]
```

Every parameter is optional and independent — pass whichever ones you have. The app opens a
new appointment with `description` filling Event Description and the rest filling the
Address/City/State/Zip/Phone fields; staff still pick the date/time/resource and save it
themselves. To also link the new appointment's `kf_Intake_ID` (for your own records — the
app won't try to look anything up from it), add `&intakeId=` & GetAsURLEncoded ( $intakeId ).

Only wrap values in `GetAsURLEncoded()` here if something else isn't *also* encoding the
URL — encoding twice corrupts the values (confirmed live: it turned a value containing a
space into garbled text, and the app came up entirely blank when the double-encoded URL
also had a literal, un-encoded space slip through). The Web Viewer object itself has its own
**"Automatically encode URL"** setting (in its configuration/inspector, separate from
whatever the `Open URL`/`Set Web Viewer` script step does) — if that's turned on, drop
`GetAsURLEncoded()` from the calculation entirely and pass the raw values, since the Web
Viewer encodes them for you. If it's off, keep `GetAsURLEncoded()` around each value as
shown above. Either way, test with a value that has a space in it and confirm it arrives
correctly (no `%20` visible in the saved appointment) before relying on this for real data.

If the Web Viewer isn't already signed in (a fresh session, not the same one that's been
sitting on the calendar view), combine this with the auto-login link above — both the token
(in the fragment) and these fields (in the query string) can be on the same URL:

```
"https://your-app.onrender.com/auto-login.html?description=" & GetAsURLEncoded ( $description ) & "&address=" & GetAsURLEncoded ( $address ) & "#token=<the WEBVIEWER_TOKEN value>"
```

`auto-login.html` forwards the whole query string through automatically once it's signed in,
so this works the same either way — script it as an **Open URL** or **Set Web Viewer** step
wherever your Client layout's "schedule appointment" button already lives.

## Jumping back to the intake record

When an appointment is linked to an intake (`kf_Intake_ID` is set), its pop-up shows a
**Go to Intake** button. Clicking it runs a FileMaker script named `Go to Intake` (the
`GO_TO_INTAKE_SCRIPT` constant at the top of `public/modal.js`) with the Intake ID as the
script parameter. On the FileMaker side:

1. In the Web Viewer's setup, turn on **Allow JavaScript to perform FileMaker scripts**
   (FileMaker 19+) - a separate checkbox from "Allow interaction with web viewer content",
   which only makes the page clickable. Without it, FileMaker doesn't give the page its
   `FileMaker.PerformScript` hook, and the pop-up says it can't reach FileMaker.
2. Create a script with exactly that name that navigates using `Get ( ScriptParameter )`,
   e.g. go to the Intake layout and find the record whose Intake ID matches it.

The button only does anything inside the FileMaker Web Viewer. In a regular browser it
shows the same "can't reach FileMaker" message. After a successful call it shows "Asked
FileMaker to run ..." - if that appears but nothing happens, the problem is on the FileMaker
side (script name, or the script's own steps).

## Project structure

```
server/
  app.js                 Express entry point, session/auth, static file serving
  routes/                auth, appointments, config REST endpoints
  adapters/               CalendarAdapter interface + mockAdapter + odataAdapter
config/resources.js       Single source of truth for the resource -> color mapping
public/                   Frontend: FullCalendar-based UI (no build step)
docs/filemaker-setup.md   FileMaker OData enablement runbook
```
