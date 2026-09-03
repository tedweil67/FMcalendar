// Create/edit appointment modal.
// Exposes window.FMCalModal = { init(resourceConfig, onSaved), openApptModal(id, prefill) }
//
// Client linking: rather than searching for a client from inside this app
// (which meant scanning the live Clients/Intake_System tables and was slow
// enough to time out), a FileMaker script hands this app an Intake ID via
// the URL when staff click "schedule appointment" from a client record - see
// README "Scheduling from a FileMaker client record". app.js resolves that
// into a prefill object (via GET /api/clients/by-intake/:id, a single fast
// key lookup) and passes it to openApptModal's `prefill` argument.

(function () {
  let resourceConfig = null;
  let onSaved = () => {};
  let currentId = null;
  let currentIntakeId = null;

  const $ = (id) => document.getElementById(id);

  function parseDateLocal(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function dayOfWeekFor(dateStr) {
    if (!dateStr) return '';
    return parseDateLocal(dateStr).toLocaleDateString(undefined, { weekday: 'long' });
  }

  function populateResourceSelect() {
    const select = $('field-resource');
    select.innerHTML = '';
    for (const resource of resourceConfig.order) {
      const opt = document.createElement('option');
      opt.value = resource;
      opt.textContent = resource;
      select.appendChild(opt);
    }
  }

  function setUntimedUI(untimed) {
    $('field-untimed').checked = untimed;
    $('label-start-time').hidden = untimed;
    $('label-end-time').hidden = untimed;
  }

  function resetForm() {
    $('appt-form').reset();
    $('field-id').textContent = '(new)';
    $('field-day-of-week').value = '';
    $('btn-delete').hidden = true;
    currentId = null;
    currentIntakeId = null;
    showLinkedClientNote(null);
    setUntimedUI(false);
  }

  function fillForm(appt) {
    currentId = appt.id;
    currentIntakeId = appt.intakeId || null;
    $('field-id').textContent = appt.id;
    $('btn-delete').hidden = false;
    $('field-resource').value = appt.resource || 'none';
    $('field-start-date').value = appt.startDate || '';
    $('field-end-date').value = appt.endDate || appt.startDate || '';
    $('field-start-time').value = appt.startTime || '';
    $('field-end-time').value = appt.endTime || '';
    setUntimedUI(!!appt.untimed);
    $('field-day-of-week').value = dayOfWeekFor(appt.startDate);
    $('field-description').value = appt.description || '';
    $('field-notes').value = appt.notes || '';
    $('field-address').value = appt.address || '';
    $('field-city').value = appt.city || '';
    $('field-state').value = appt.state || '';
    $('field-zip').value = appt.zip || '';
    $('field-phone').value = appt.phone || '';
    showLinkedClientNote(appt.client);
  }

  function showLinkedClientNote(client) {
    const row = $('linked-client-row');
    const note = $('linked-client-note');
    if (client) {
      row.hidden = false;
      note.textContent = `Linked to ${client.firstName} ${client.lastName}${
        client.petsName ? ` (${client.petsName})` : ''
      }`;
    } else {
      row.hidden = true;
      note.textContent = '';
    }
  }

  function applyClientPrefill(client) {
    currentIntakeId = client.intakeId || null;
    if (client.address != null) $('field-address').value = client.address;
    if (client.city != null) $('field-city').value = client.city;
    if (client.state != null) $('field-state').value = client.state;
    if (client.zip != null) $('field-zip').value = client.zip;
    if (client.phone != null) $('field-phone').value = client.phone;
    showLinkedClientNote(client);
  }

  async function openApptModal(id, prefill) {
    resetForm();
    if (id) {
      let appt;
      try {
        const res = await apiFetch(`/api/appointments/${encodeURIComponent(id)}`);
        appt = await res.json();
      } catch (err) {
        showError(`Couldn't load this appointment: ${err.message}`);
        return;
      }
      fillForm(appt);
    } else if (prefill) {
      if (prefill.date) {
        $('field-start-date').value = prefill.date;
        $('field-end-date').value = prefill.date;
        $('field-day-of-week').value = dayOfWeekFor(prefill.date);
      }
      setUntimedUI(!!prefill.allDay);
      if (prefill.intakeId) applyClientPrefill(prefill);
      if (prefill.description) $('field-description').value = prefill.description;
    }
    $('modal-overlay').hidden = false;
  }

  function closeApptModal() {
    $('modal-overlay').hidden = true;
  }

  function collectFormData() {
    return {
      resource: $('field-resource').value,
      startDate: $('field-start-date').value || null,
      endDate: $('field-end-date').value || $('field-start-date').value || null,
      startTime: $('field-start-time').value || null,
      endTime: $('field-end-time').value || null,
      untimed: $('field-untimed').checked,
      description: $('field-description').value,
      notes: $('field-notes').value,
      address: $('field-address').value,
      city: $('field-city').value,
      state: $('field-state').value,
      zip: $('field-zip').value,
      phone: $('field-phone').value,
      intakeId: currentIntakeId,
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const data = collectFormData();
    try {
      if (currentId) {
        await apiFetch(`/api/appointments/${encodeURIComponent(currentId)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch('/api/appointments', { method: 'POST', body: JSON.stringify(data) });
      }
    } catch (err) {
      showError(`Couldn't save this appointment: ${err.message}`);
      return;
    }
    closeApptModal();
    onSaved();
  }

  async function handleDelete() {
    if (!currentId) return;
    if (!window.confirm('Delete this appointment? This cannot be undone.')) return;
    try {
      await apiFetch(`/api/appointments/${encodeURIComponent(currentId)}`, { method: 'DELETE' });
    } catch (err) {
      showError(`Couldn't delete this appointment: ${err.message}`);
      return;
    }
    closeApptModal();
    onSaved();
  }

  function handleMap() {
    const parts = [$('field-address').value, $('field-city').value, $('field-state').value, $('field-zip').value]
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) {
      window.alert('Enter an address first.');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
    window.open(url, '_blank', 'noopener');
  }

  function handleRemoveLink() {
    currentIntakeId = null;
    showLinkedClientNote(null);
  }

  function wireEvents() {
    $('appt-form').addEventListener('submit', handleSubmit);
    $('btn-delete').addEventListener('click', handleDelete);
    $('btn-cancel').addEventListener('click', closeApptModal);
    $('btn-map').addEventListener('click', handleMap);
    $('btn-remove-link').addEventListener('click', handleRemoveLink);
    $('field-untimed').addEventListener('change', (e) => setUntimedUI(e.target.checked));
    $('field-start-date').addEventListener('change', (e) => {
      $('field-day-of-week').value = dayOfWeekFor(e.target.value);
      if (!$('field-end-date').value) $('field-end-date').value = e.target.value;
    });

    $('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeApptModal();
    });
  }

  function init(config, savedCallback) {
    resourceConfig = config;
    onSaved = savedCallback;
    populateResourceSelect();
    wireEvents();
  }

  window.FMCalModal = { init, openApptModal };
})();
