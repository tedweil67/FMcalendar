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

// FileMaker OData primary keys used here (kp_ScheduleID, "Intake ID", ClientID) are
// text/serial fields in this schema; quote-and-escape as an OData string literal.
// Single quotes inside the value are doubled per OData string-literal escaping rules.
function keyLiteral(id) {
  return `'${String(id).replace(/'/g, "''")}'`;
}

// OData string literal for use inside $filter (same escaping as keyLiteral).
function stringLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function odataFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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
    const filter =
      `Event_Start_Date le ${stringLiteral(endDate)} and ` +
      `(Event_End_Date ge ${stringLiteral(startDate)} or (Event_End_Date eq null and Event_Start_Date ge ${stringLiteral(startDate)}))`;
    const qs = new URLSearchParams({ $filter: filter, $orderby: 'Event_Start_Date' });
    const json = await odataFetch(`/${SCHEDULE}?${qs.toString()}`);
    return (json.value || []).map(toAppointment);
  }

  async listUnscheduled() {
    const qs = new URLSearchParams({ $filter: 'Event_Start_Date eq null' });
    const json = await odataFetch(`/${SCHEDULE}?${qs.toString()}`);
    return (json.value || []).map(toAppointment);
  }

  async getAppointment(id) {
    try {
      const row = await odataFetch(`/${SCHEDULE}(${keyLiteral(id)})`);
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
    await odataFetch(`/${SCHEDULE}(${keyLiteral(id)})`, { method: 'PATCH', body: fromAppointment(data) });
    return this.getAppointment(id);
  }

  async deleteAppointment(id) {
    await odataFetch(`/${SCHEDULE}(${keyLiteral(id)})`, { method: 'DELETE' });
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
      odataFetch(`/${CLIENTS}?${new URLSearchParams({ $top: '500' })}`),
      odataFetch(`/${INTAKE}?${new URLSearchParams({ $top: '500' })}`),
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
    const intake = await odataFetch(`/${INTAKE}(${keyLiteral(intakeId)})`).catch((err) => {
      if (/404/.test(err.message)) return null;
      throw err;
    });
    if (!intake) return null;
    const csId = intake['CS ID'];
    if (csId == null) return null;
    const client = await odataFetch(`/${CLIENTS}(${keyLiteral(csId)})`).catch((err) => {
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
