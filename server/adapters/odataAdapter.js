const CalendarAdapter = require('./CalendarAdapter');

const FM_BASE_URL = process.env.FM_BASE_URL; // e.g. https://fmserver.example.com
const FM_DATABASE = process.env.FM_DATABASE; // e.g. HospiceDB
const FM_USERNAME = process.env.FM_USERNAME;
const FM_PASSWORD = process.env.FM_PASSWORD;

const SCHEDULE = 'Schedule';
const INTAKE = 'Intake_System';
const CLIENTS = 'Clients';

function baseUrl() {
  if (!FM_BASE_URL || !FM_DATABASE) {
    throw new Error('FM_BASE_URL and FM_DATABASE must be set when FM_MODE=odata');
  }
  return `${FM_BASE_URL.replace(/\/$/, '')}/fmi/odata/v4/${encodeURIComponent(FM_DATABASE)}`;
}

function authHeader() {
  const token = Buffer.from(`${FM_USERNAME}:${FM_PASSWORD}`).toString('base64');
  return `Basic ${token}`;
}

// OData string literal for use inside $filter (single quotes inside the value
// are doubled per OData string-literal escaping rules).
function stringLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Single-record addressing. FileMaker Server's OData implementation matches
// the shorthand EntitySet('value') form against its own internal numeric
// record ID, not against whichever field your schema calls its primary key -
// using that shorthand against a text-keyed table throws "incompatible data
// types" (error 8309). The explicit named-key form EntitySet(Field='value')
// forces the match onto the field we actually mean.
function keyPredicate(keyField, value) {
  return `${encodeURIComponent(keyField)}=${stringLiteral(value)}`;
}

// OData Edm.Date literal for use inside $filter - unquoted 'YYYY-MM-DD', per
// spec. FileMaker's Event_Start_Date/Event_End_Date are real Date-typed
// fields, and comparing them against a quoted string literal (which is what
// this used to send) doesn't error, it just silently matches nothing.
function dateLiteral(value) {
  return String(value);
}

// Two encoding bugs to avoid here, both learned the hard way against a live
// FileMaker Server:
// 1. URLSearchParams.toString() encodes spaces as '+' (the
//    application/x-www-form-urlencoded convention), but FileMaker's OData
//    endpoint rejects '+' in the query string as a syntax error - it wants
//    strict percent-encoding (%20) instead.
// 2. The system query option names ($filter, $orderby, $top, ...) must stay
//    literal - encodeURIComponent would turn '$filter' into '%24filter',
//    which FileMaker's OData parser doesn't recognize as $filter at all. It
//    doesn't error on an unrecognized parameter, it just silently drops it
//    and returns its default (unfiltered) result set - which is what was
//    happening: every request "succeeded" but ignored our filter entirely.
// So: percent-encode parameter VALUES only, never the $-prefixed keys.
function buildQuery(params) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

const REQUEST_TIMEOUT_MS = Number(process.env.FM_REQUEST_TIMEOUT_MS) || 20000;

async function odataFetch(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `FileMaker OData ${method} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms - the query may be scanning an unindexed field on a large table`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`FileMaker OData ${method} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function toAppointment(row) {
  return {
    id: String(row.kp_ScheduleID),
    startDate: row.Event_Start_Date || null,
    startTime: row.Event_Start_Time ? row.Event_Start_Time.slice(0, 5) : null,
    endDate: row.Event_End_Date || null,
    endTime: row.Event_End_Time ? row.Event_End_Time.slice(0, 5) : null,
    untimed: !!row.All_Day_Event,
    description: row.Event_Description || '',
    notes: row.Event_Notes || '',
    address: row.Address || '',
    city: row.City || '',
    state: row.State || '',
    zip: row.Zip || '',
    phone: row.Phone || '',
    resource: row.Resources || 'none',
    intakeId: row.kf_Intake_ID != null ? String(row.kf_Intake_ID) : null,
  };
}

function fromAppointment(data) {
  return {
    Event_Start_Date: data.startDate || null,
    Event_Start_Time: data.untimed ? null : data.startTime || null,
    Event_End_Date: data.endDate || data.startDate || null,
    Event_End_Time: data.untimed ? null : data.endTime || null,
    Event_Description: data.description || '',
    Event_Notes: data.notes || '',
    Address: data.address || '',
    City: data.city || '',
    State: data.state || '',
    Zip: data.zip || '',
    Phone: data.phone || '',
    Resources: data.resource || 'none',
    All_Day_Event: !!data.untimed,
    kf_Intake_ID: data.intakeId || null,
  };
}

class ODataAdapter extends CalendarAdapter {
  async listAppointments({ startDate, endDate }) {
    // A single compound filter (Event_Start_Date le X and (Event_End_Date ge Y
    // or (Event_End_Date eq null and Event_Start_Date ge Y))) forces FileMaker
    // to evaluate an OR across two different fields including a null check -
    // on a 49k-row table that's a full scan even with indexes in place, slow
    // enough to time out. Split into two simple AND-only, single-index-friendly
    // queries and merge the results instead:
    //   A. appointments that start within the visible window (the vast
    //      majority, including legacy rows with a blank Event_End_Date)
    //   B. multi-day appointments that started earlier but still overlap the
    //      visible window (rare - only true multi-day spans hit this)
    const queryA = buildQuery({
      $filter: `Event_Start_Date ge ${dateLiteral(startDate)} and Event_Start_Date le ${dateLiteral(endDate)}`,
      $orderby: 'Event_Start_Date',
    });
    const queryB = buildQuery({
      $filter: `Event_Start_Date lt ${dateLiteral(startDate)} and Event_End_Date ge ${dateLiteral(startDate)}`,
    });
    const [jsonA, jsonB] = await Promise.all([
      odataFetch(`/${SCHEDULE}?${queryA}`),
      odataFetch(`/${SCHEDULE}?${queryB}`),
    ]);
    const byId = new Map();
    for (const row of [...(jsonA.value || []), ...(jsonB.value || [])]) {
      byId.set(row.kp_ScheduleID, row);
    }
    return [...byId.values()].map(toAppointment);
  }

  async getAppointment(id) {
    try {
      const row = await odataFetch(`/${SCHEDULE}(${keyPredicate('kp_ScheduleID', id)})`);
      return row ? toAppointment(row) : null;
    } catch (err) {
      if (/404/.test(err.message)) return null;
      throw err;
    }
  }

  async createAppointment(data) {
    const row = await odataFetch(`/${SCHEDULE}`, { method: 'POST', body: fromAppointment(data) });
    return toAppointment(row);
  }

  async updateAppointment(id, data) {
    await odataFetch(`/${SCHEDULE}(${keyPredicate('kp_ScheduleID', id)})`, {
      method: 'PATCH',
      body: fromAppointment(data),
    });
    return this.getAppointment(id);
  }

  async deleteAppointment(id) {
    await odataFetch(`/${SCHEDULE}(${keyPredicate('kp_ScheduleID', id)})`, { method: 'DELETE' });
  }

  async findClients(query) {
    // OData $filter expressions can't reliably reference property names that
    // contain spaces (First Name, Last Name, Intake ID, CS ID all do), and this
    // is unverified against a live FileMaker Server. Rather than guess at
    // FileMaker's exact escaping rules for that, fetch both tables (capped by
    // $top so this stays cheap) and match/join in JS instead - it costs two
    // requests instead of one but avoids a class of bug we can't test for.
    const q = (query || '').trim().toLowerCase();
    const [clientsJson, intakeJson] = await Promise.all([
      odataFetch(`/${CLIENTS}?${buildQuery({ $top: '500' })}`),
      odataFetch(`/${INTAKE}?${buildQuery({ $top: '500' })}`),
    ]);
    const clientById = new Map((clientsJson.value || []).map((c) => [String(c.ClientID), c]));

    const results = [];
    for (const intake of intakeJson.value || []) {
      const csId = intake['CS ID'];
      if (csId == null) continue;
      const client = clientById.get(String(csId));
      if (!client) continue;
      const entry = {
        intakeId: String(intake['Intake ID']),
        petsName: intake.Pets_Name || '',
        clientId: String(client.ClientID),
        firstName: client['First Name'] || '',
        lastName: client['Last Name'] || '',
        phone: client.PhoneNumber || '',
        address: client['Street Address'] || '',
        city: client.City || '',
        state: client.State || '',
        zip: client.Zip || '',
      };
      if (!q) {
        results.push(entry);
        continue;
      }
      const haystack = `${entry.firstName} ${entry.lastName} ${entry.petsName} ${entry.phone}`.toLowerCase();
      if (haystack.includes(q)) results.push(entry);
    }
    return results;
  }

  async hydrateClientForAppointment(intakeId) {
    if (!intakeId) return null;
    const intake = await odataFetch(`/${INTAKE}(${keyPredicate('Intake ID', intakeId)})`).catch((err) => {
      if (/404/.test(err.message)) return null;
      throw err;
    });
    if (!intake) return null;
    const csId = intake['CS ID'];
    if (csId == null) return null;
    const client = await odataFetch(`/${CLIENTS}(${keyPredicate('ClientID', csId)})`).catch((err) => {
      if (/404/.test(err.message)) return null;
      throw err;
    });
    if (!client) return null;
    return {
      petsName: intake.Pets_Name || '',
      firstName: client['First Name'] || '',
      lastName: client['Last Name'] || '',
      phone: client.PhoneNumber || '',
      address: client['Street Address'] || '',
      city: client.City || '',
      state: client.State || '',
      zip: client.Zip || '',
    };
  }
}

module.exports = new ODataAdapter();
