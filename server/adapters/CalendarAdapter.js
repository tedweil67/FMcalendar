/**
 * Adapter contract implemented identically by mockAdapter.js and odataAdapter.js.
 * Routes only ever import ./index.js (env-selected) so swapping backends
 * requires no route or frontend changes.
 *
 * @typedef {Object} Appointment
 * @property {string} id            kp_ScheduleID
 * @property {string|null} startDate  Event_Start_Date, 'YYYY-MM-DD' or null (unscheduled)
 * @property {string|null} startTime  Event_Start_Time, 'HH:MM' or null
 * @property {string|null} endDate    Event_End_Date, 'YYYY-MM-DD' or null
 * @property {string|null} endTime    Event_End_Time, 'HH:MM' or null
 * @property {boolean} untimed        All_Day_Event
 * @property {string} description     Event_Description
 * @property {string} notes           Event_Notes
 * @property {string} address
 * @property {string} city
 * @property {string} state
 * @property {string} zip
 * @property {string} phone
 * @property {string} resource        Resources
 * @property {string|null} intakeId   kf_Intake_ID, null = standalone appointment
 */

class CalendarAdapter {
  /** @returns {Promise<Appointment[]>} dated appointments overlapping [startDate, endDate] */
  async listAppointments({ startDate, endDate }) {
    throw new Error('not implemented');
  }

  /** @returns {Promise<Appointment[]>} appointments with no startDate at all */
  async listUnscheduled() {
    throw new Error('not implemented');
  }

  /** @returns {Promise<Appointment|null>} */
  async getAppointment(id) {
    throw new Error('not implemented');
  }

  /** @returns {Promise<Appointment>} */
  async createAppointment(data) {
    throw new Error('not implemented');
  }

  /** @returns {Promise<Appointment>} */
  async updateAppointment(id, data) {
    throw new Error('not implemented');
  }

  /** @returns {Promise<void>} */
  async deleteAppointment(id) {
    throw new Error('not implemented');
  }

  /**
   * Searches Intake_System + Clients for the "Enter Client Info" picker.
   * @returns {Promise<Array<{intakeId: string, petsName: string, clientId: string,
   *   firstName: string, lastName: string, phone: string, address: string,
   *   city: string, state: string, zip: string}>>}
   */
  async findClients(query) {
    throw new Error('not implemented');
  }

  /**
   * Two-hop lookup: Schedule.kf_Intake_ID -> Intake_System."Intake ID" -> Clients.ClientID.
   * @returns {Promise<{petsName: string, firstName: string, lastName: string,
   *   phone: string, address: string, city: string, state: string, zip: string}|null>}
   */
  async hydrateClientForAppointment(intakeId) {
    throw new Error('not implemented');
  }
}

module.exports = CalendarAdapter;
