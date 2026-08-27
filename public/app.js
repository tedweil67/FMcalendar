// Boot logic, main + mini FullCalendar instances, unscheduled sidebar panel.
// Modal logic (create/edit/client-link/map) lives in modal.js and is invoked
// from here via the global FMCalModal namespace.

let mainCalendar = null;
let miniCalendar = null;
let resourceConfig = { order: ['none'], colors: { none: '#ffffff' } };

async function apiFetch(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options && options.headers) },
  });
  if (res.status === 401) {
    window.location.href = 'login.html';
    throw new Error('Not authenticated');
  }
  return res;
}

async function checkSession() {
  const res = await fetch('/api/session');
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

async function loadResourceConfig() {
  const res = await apiFetch('/api/config/resources');
  resourceConfig = await res.json();
}

async function loadUnscheduled() {
  const res = await apiFetch('/api/appointments/unscheduled');
  const items = await res.json();
  const list = document.getElementById('unscheduled-list');
  list.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'unscheduled-empty';
    empty.textContent = 'Nothing unscheduled.';
    list.appendChild(empty);
    return;
  }
  for (const appt of items) {
    const el = document.createElement('div');
    el.className = 'unscheduled-item';
    const bg = resourceConfig.colors[appt.resource] || '#ffffff';
    const textColor = resourceConfig.textColors ? resourceConfig.textColors[appt.resource] : '#000';
    el.style.background = bg;
    el.style.color = textColor || '#000';
    el.textContent = appt.description || '(no description)';
    el.addEventListener('click', () => window.FMCalModal.openApptModal(appt.id));
    list.appendChild(el);
  }
}

function refreshAll() {
  if (mainCalendar) mainCalendar.refetchEvents();
  loadUnscheduled();
}

function initMainCalendar() {
  const el = document.getElementById('calendar');
  mainCalendar = new FullCalendar.Calendar(el, {
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'today prev,next title',
      center: '',
      right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek',
    },
    buttonText: {
      today: 'Today',
      day: 'Day',
      week: 'Week',
      month: 'Month',
      list: 'List',
    },
    allDaySlot: true,
    allDayText: 'Untimed',
    slotMinTime: '06:00:00',
    slotMaxTime: '23:00:00',
    height: '100%',
    nowIndicator: true,
    firstDay: 0,
    events: async (info, successCallback, failureCallback) => {
      try {
        const res = await apiFetch(
          `/api/appointments?start=${encodeURIComponent(info.startStr.slice(0, 10))}&end=${encodeURIComponent(
            info.endStr.slice(0, 10)
          )}`
        );
        successCallback(await res.json());
      } catch (err) {
        failureCallback(err);
      }
    },
    eventClick: (info) => {
      window.FMCalModal.openApptModal(info.event.id);
    },
    dateClick: (info) => {
      window.FMCalModal.openApptModal(null, { date: info.dateStr, allDay: info.allDay });
    },
  });
  mainCalendar.render();
}

function initMiniCalendar() {
  const el = document.getElementById('mini-calendar');
  miniCalendar = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    headerToolbar: { left: 'prev', center: 'title', right: 'next' },
    height: 'auto',
    firstDay: 0,
    dateClick: (info) => {
      mainCalendar.gotoDate(info.date);
    },
  });
  miniCalendar.render();
}

function wireToolbar() {
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-refresh').addEventListener('click', () => refreshAll());
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await apiFetch('/api/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });
  document.getElementById('btn-add').addEventListener('click', () => {
    window.FMCalModal.openApptModal(null, {});
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await checkSession();
  if (!ok) return;
  await loadResourceConfig();
  window.FMCalModal.init(resourceConfig, refreshAll);
  initMainCalendar();
  initMiniCalendar();
  wireToolbar();
  await loadUnscheduled();
  document.getElementById('app').hidden = false;
});
