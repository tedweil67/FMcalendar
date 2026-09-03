// Create/edit appointment modal + client-link search modal.
// Exposes window.FMCalModal = { init(resourceConfig, onSaved), openApptModal(id, prefill) }

(function () {
  let resourceConfig = null;
  let onSaved = () => {};
  let currentId = null;
  let currentIntakeId = null;
  let clientSearchTimer = null;

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
    $('linked-client-note').hidden = true;
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
    const note = $('linked-client-note');
    if (client) {
      note.hidden = false;
      note.textContent = `Linked to ${client.firstName} ${client.lastName}${
        client.petsName ? ` (${client.petsName})` : ''
      }`;
    } else {
      note.hidden = true;
      note.textContent = '';
    }
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

  // ---- Client search modal ----

  const MIN_SEARCH_LENGTH = 2;

  function openClientModal() {
    $('client-modal-overlay').hidden = false;
    $('client-search').value = '';
    $('client-search').focus();
    showClientPrompt(`Type at least ${MIN_SEARCH_LENGTH} characters to search.`);
  }

  function closeClientModal() {
    $('client-modal-overlay').hidden = true;
  }

  function showClientPrompt(text) {
    const container = $('client-results');
    container.innerHTML = '';
    const prompt = document.createElement('div');
    prompt.className = 'empty-message';
    prompt.textContent = text;
    container.appendChild(prompt);
  }

  async function searchClients(query) {
    // Fetching and scanning the Clients/Intake_System tables is expensive on
    // a live FileMaker Server with no search term to narrow anything down -
    // don't do it until there's something worth searching for.
    if (query.trim().length < MIN_SEARCH_LENGTH) {
      showClientPrompt(`Type at least ${MIN_SEARCH_LENGTH} characters to search.`);
      return;
    }
    let results;
    try {
      const res = await apiFetch(`/api/clients/search?q=${encodeURIComponent(query)}`);
      results = await res.json();
    } catch (err) {
      showError(`Couldn't search clients: ${err.message}`);
      return;
    }
    const container = $('client-results');
    container.innerHTML = '';
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-message';
      empty.textContent = 'No matching clients.';
      container.appendChild(empty);
      return;
    }
    for (const client of results) {
      const row = document.createElement('div');
      row.className = 'client-result';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = `${client.firstName} ${client.lastName}${client.petsName ? ` — ${client.petsName}` : ''}`;
      const details = document.createElement('div');
      details.className = 'details';
      details.textContent = [client.phone, client.address, client.city, client.state, client.zip]
        .filter(Boolean)
        .join(', ');
      row.appendChild(name);
      row.appendChild(details);
      row.addEventListener('click', () => selectClient(client));
      container.appendChild(row);
    }
  }

  function selectClient(client) {
    currentIntakeId = client.intakeId;
    $('field-address').value = client.address || '';
    $('field-city').value = client.city || '';
    $('field-state').value = client.state || '';
    $('field-zip').value = client.zip || '';
    $('field-phone').value = client.phone || '';
    showLinkedClientNote({ firstName: client.firstName, lastName: client.lastName, petsName: client.petsName });
    closeClientModal();
  }

  function unlinkClient() {
    currentIntakeId = null;
    showLinkedClientNote(null);
    closeClientModal();
  }

  function wireEvents() {
    $('appt-form').addEventListener('submit', handleSubmit);
    $('btn-delete').addEventListener('click', handleDelete);
    $('btn-cancel').addEventListener('click', closeApptModal);
    $('btn-map').addEventListener('click', handleMap);
    $('field-untimed').addEventListener('change', (e) => setUntimedUI(e.target.checked));
    $('field-start-date').addEventListener('change', (e) => {
      $('field-day-of-week').value = dayOfWeekFor(e.target.value);
      if (!$('field-end-date').value) $('field-end-date').value = e.target.value;
    });

    $('btn-client-info').addEventListener('click', openClientModal);
    $('btn-client-cancel').addEventListener('click', closeClientModal);
    $('btn-client-unlink').addEventListener('click', unlinkClient);
    $('client-search').addEventListener('input', (e) => {
      clearTimeout(clientSearchTimer);
      const value = e.target.value;
      clientSearchTimer = setTimeout(() => searchClients(value), 200);
    });

    $('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeApptModal();
    });
    $('client-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'client-modal-overlay') closeClientModal();
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
