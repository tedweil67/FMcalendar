const express = require('express');
const adapter = require('../adapters');
const { colorForResource, textColorForBackground } = require('../../config/resources');

const router = express.Router();

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Maps our Appointment shape to a FullCalendar event object. Kept here (not in
// the adapter) so the adapter stays FullCalendar-agnostic.
function toFullCalendarEvent(appt) {
  const bg = colorForResource(appt.resource);
  const base = {
    id: appt.id,
    title: appt.description || '(no description)',
    backgroundColor: bg,
    borderColor: bg,
    textColor: textColorForBackground(bg),
    extendedProps: {
      resource: appt.resource,
      notes: appt.notes,
      address: appt.address,
      city: appt.city,
      state: appt.state,
      zip: appt.zip,
      phone: appt.phone,
      intakeId: appt.intakeId,
      untimed: appt.untimed,
      startDate: appt.startDate,
      endDate: appt.endDate,
      startTime: appt.startTime,
      endTime: appt.endTime,
    },
  };

  if (appt.untimed || !appt.startTime) {
    base.allDay = true;
    base.start = appt.startDate;
    const endDate = appt.endDate || appt.startDate;
    // FullCalendar's all-day `end` is exclusive; only set it when the event
    // spans more than one day, otherwise let FullCalendar default to 1 day.
    if (endDate && endDate !== appt.startDate) {
      base.end = addDaysToDateStr(endDate, 1);
    }
  } else {
    base.allDay = false;
    base.start = `${appt.startDate}T${appt.startTime}:00`;
    const endDate = appt.endDate || appt.startDate;
    const endTime = appt.endTime || appt.startTime;
    base.end = `${endDate}T${endTime}:00`;
  }

  return base;
}

router.get('/', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
    }
    const startDate = start.slice(0, 10);
    // FullCalendar's range end is exclusive; convert to an inclusive end date for the adapter.
    const endDate = addDaysToDateStr(end.slice(0, 10), -1);
    const appointments = await adapter.listAppointments({ startDate, endDate });
    res.json(appointments.map(toFullCalendarEvent));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const appt = await adapter.getAppointment(req.params.id);
    if (!appt) return res.status(404).json({ error: 'Not found' });
    let client = null;
    if (appt.intakeId) {
      client = await adapter.hydrateClientForAppointment(appt.intakeId);
    }
    res.json({ ...appt, client });
  } catch (err) {
    next(err);
  }
});

// Every appointment must have a start and end date to be saved - there is no
// "unscheduled" state. (An appointment can still be "untimed": dated but with
// no time assigned yet - that's the separate `untimed` flag.)
function requireDates(data, res) {
  if (!data.startDate || !data.endDate) {
    res.status(400).json({ error: 'Start Date and End Date are required.' });
    return false;
  }
  return true;
}

router.post('/', async (req, res, next) => {
  try {
    const data = req.body || {};
    if (!requireDates(data, res)) return;
    const appt = await adapter.createAppointment(data);
    res.status(201).json(appt);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = req.body || {};
    if (!requireDates(data, res)) return;
    const appt = await adapter.updateAppointment(req.params.id, data);
    res.json(appt);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await adapter.deleteAppointment(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
