// Create/edit appointment modal.
// Exposes window.FMCalModal = { init(resourceConfig, onSaved), openApptModal(id, prefill) }
//
// Client linking: rather than searching for or looking up a client from
// inside this app (which meant querying the live Clients/Intake_System
// tables - too slow via a bulk search, and Intake_System turned out to
// error on every single-record fetch regardless), a FileMaker script
// gathers the appointment details itself (it already has fast, native
// access, possibly from more than one source) and hands them to this app
// directly via URL params when staff click "schedule appointment" from a
// client record - see README "Scheduling from a FileMaker client record".
// app.js reads those straight off the URL into a prefill object and passes
// it to openApptModal's `prefill` argument - no backend lookup involved.

(function () {
  // FileMaker script run by "Go to Intake", with the appointment's
  // kf_Intake_ID as its parameter - see README "Jumping back to the intake
  // record". Must match the script's name in the FileMaker file exactly.
  const GO_TO_INTAKE_SCRIPT = 'Go to Intake';

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
    setIntakeNavStatus('');
    const row = $('linked-client-row');
    const note = $('linked-client-note');
    if (!client || (!client.intakeId && !client.firstName && !client.lastName)) {
      row.hidden = true;
      note.textContent = '';
      return;
    }
    row.hidden = false;
    // A linked name alone (no Intake ID) has nothing to navigate to.
    $('btn-go-to-intake').hidden = !currentIntakeId;
    // Full name/pet details (from hydrateClientForAppointment, used for an
    // already-linked appointment opened via its id) vs. just an Intake ID
    // (from a FileMaker-initiated hand-off - see applyClientPrefill/README,
    // which passes address/phone/description directly rather than an id to
    // look up, so there's no name to show here).
    if (client.firstName || client.lastName) {
      note.textContent = `Linked to ${client.firstName} ${client.lastName}${
        client.petsName ? ` (${client.petsName})` : ''
      }`;
    } else {
      note.textContent = `Linked to Intake ID: ${client.intakeId}`;
    }
  }

  function applyClientPrefill(prefill) {
    currentIntakeId = prefill.intakeId || null;
    if (prefill.address != null) $('field-address').value = prefill.address;
    if (prefill.city != null) $('field-city').value = prefill.city;
    if (prefill.state != null) $('field-state').value = prefill.state;
    if (prefill.zip != null) $('field-zip').value = prefill.zip;
    if (prefill.phone != null) $('field-phone').value = prefill.phone;
    showLinkedClientNote(currentIntakeId ? { intakeId: currentIntakeId } : null);
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
      if (prefill.intakeId || prefill.address || prefill.city || prefill.state || prefill.zip || prefill.phone) {
        applyClientPrefill(prefill);
      }
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

  // Shown inline rather than via alert/showError: FileMaker's Web Viewer may
  // not display JavaScript alerts, and the error banner sits behind the modal.
  function setIntakeNavStatus(message, isError) {
    const el = $('intake-nav-status');
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
    el.hidden = !message;
  }

  // window.FileMaker is injected into the page only when it's running inside
  // a FileMaker Web Viewer with "Allow JavaScript to perform FileMaker
  // scripts" turned on (FileMaker 19+); in a regular browser it's absent.
  function handleGoToIntake() {
    if (!currentIntakeId) return;
    if (!window.FileMaker || typeof window.FileMaker.PerformScript !== 'function') {
      setIntakeNavStatus(
        'Can\'t reach FileMaker. In the Web Viewer setup, turn on "Allow JavaScript ' +
          'to perform FileMaker scripts", then reload the calendar.',
        true
      );
      return;
    }
    try {
      // Plain PerformScript queues the script behind any FileMaker script
      // that's already running or paused (e.g. the one that opened this
      // calendar). Option '5' (Suspend and Resume) runs it now.
      if (typeof window.FileMaker.PerformScriptWithOption === 'function') {
        window.FileMaker.PerformScriptWithOption(GO_TO_INTAKE_SCRIPT, currentIntakeId, '5');
      } else {
        window.FileMaker.PerformScript(GO_TO_INTAKE_SCRIPT, currentIntakeId);
      }
    } catch (err) {
      setIntakeNavStatus(`FileMaker rejected the script call: ${err.message}`, true);
      return;
    }
    setIntakeNavStatus(`Asked FileMaker to run "${GO_TO_INTAKE_SCRIPT}" for ${currentIntakeId}.`, false);
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
    $('btn-go-to-intake').addEventListener('click', handleGoToIntake);
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
