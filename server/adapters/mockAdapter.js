const CalendarAdapter = require('./CalendarAdapter');
const { appointments, intakeSystem, clients, generateId } = require('./mockData');

function toAppointment(row) {
  return {
    id: row.kp_ScheduleID,
    startDate: row.Event_Start_Date || null,
    startTime: row.Event_Start_Time || null,
    endDate: row.Event_End_Date || null,
    endTime: row.Event_End_Time || null,
    untimed: !!row.All_Day_Event,
    description: row.Event_Description || '',
    notes: row.Event_Notes || '',
    address: row.Address || '',
    city: row.City || '',
    state: row.State || '',
    zip: row.Zip || '',
    phone: row.Phone || '',
    resource: row.Resources || 'none',
    intakeId: row.kf_Intake_ID || null,
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

// Overlap test: appointment overlaps the visible range if its date span
// intersects [startDate, endDate]. Appointments with no startDate are excluded
// here (they live in the Unscheduled bucket, not the range view).
function overlaps(row, startDate, endDate) {
  if (!row.Event_Start_Date) return false;
  const rowStart = row.Event_Start_Date;
  const rowEnd = row.Event_End_Date || row.Event_Start_Date;
  return rowStart <= endDate && rowEnd >= startDate;
}

class MockAdapter extends CalendarAdapter {
  async listAppointments({ startDate, endDate }) {
    return appointments.filter((row) => overlaps(row, startDate, endDate)).map(toAppointment);
  }

  async listUnscheduled() {
    return appointments.filter((row) => !row.Event_Start_Date).map(toAppointment);
  }

  async getAppointment(id) {
    const row = appointments.find((r) => r.kp_ScheduleID === id);
    return row ? toAppointment(row) : null;
  }

  async createAppointment(data) {
    const row = { kp_ScheduleID: generateId(), ...fromAppointment(data) };
    appointments.push(row);
    return toAppointment(row);
  }

  async updateAppointment(id, data) {
    const row = appointments.find((r) => r.kp_ScheduleID === id);
    if (!row) throw new Error(`Appointment ${id} not found`);
    Object.assign(row, fromAppointment(data));
    return toAppointment(row);
  }

  async deleteAppointment(id) {
    const idx = appointments.findIndex((r) => r.kp_ScheduleID === id);
    if (idx !== -1) appointments.splice(idx, 1);
  }

  async findClients(query) {
    const q = (query || '').trim().toLowerCase();
    const clientById = new Map(clients.map((c) => [c.ClientID, c]));
    return intakeSystem
      .map((intake) => {
        const client = clientById.get(intake['CS ID']);
        if (!client) return null;
        return {
          intakeId: intake['Intake ID'],
          petsName: intake.Pets_Name || '',
          clientId: client.ClientID,
          firstName: client['First Name'] || '',
          lastName: client['Last Name'] || '',
          phone: client.PhoneNumber || '',
          address: client['Street Address'] || '',
          city: client.City || '',
          state: client.State || '',
          zip: client.Zip || '',
        };
      })
      .filter(Boolean)
      .filter((c) => {
        if (!q) return true;
        const haystack = `${c.firstName} ${c.lastName} ${c.petsName} ${c.phone}`.toLowerCase();
        return haystack.includes(q);
      });
  }

  async hydrateClientForAppointment(intakeId) {
    if (!intakeId) return null;
    const intake = intakeSystem.find((i) => i['Intake ID'] === intakeId);
    if (!intake) return null;
    const client = clients.find((c) => c.ClientID === intake['CS ID']);
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

module.exports = new MockAdapter();
