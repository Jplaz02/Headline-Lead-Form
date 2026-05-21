document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('break-form');
    const submitBtn = document.getElementById('submit-btn');
    const formMessage = document.getElementById('form-message');
    const formView = document.getElementById('form-view');
    const successView = document.getElementById('success-view');
    const successSummary = document.getElementById('success-summary');
    const successShowName = document.getElementById('success-show-name');
    const headerTitle = document.getElementById('header-title');
    const headerSub = document.getElementById('header-sub');
    const breakList = document.getElementById('break-list');
    const addBreakBtn = document.getElementById('add-break-btn');
    const addPersonalBtn = document.getElementById('add-personal-btn');
    const resetBtn = document.getElementById('reset-btn');

    const SUBMIT_ENDPOINT = '/api/submit-break-cycle';

    // ───── Entry type config ─────
    const ENTRY_CONFIG = {
        Break: {
            rowClass: 'type-break',
            badge: 'Break',
            placeholder: 'Break number',
            maxlength: 50,
            removeLabel: 'Remove break',
        },
        Personal: {
            rowClass: 'type-personal',
            badge: 'Personal',
            placeholder: 'Customer name',
            maxlength: 100,
            removeLabel: 'Remove personal',
        },
    };

    // ───── Dynamic entry rows ─────
    let entryCounter = 0;

    const updateRemoveButtons = () => {
        const rows = breakList.querySelectorAll('.break-row');
        rows.forEach((row) => {
            const removeBtn = row.querySelector('.break-remove-btn');
            if (removeBtn) removeBtn.style.display = rows.length > 1 ? 'flex' : 'none';
        });
    };

    const addEntryRow = (type, focus = true) => {
        const cfg = ENTRY_CONFIG[type];
        if (!cfg) return;
        entryCounter += 1;
        const id = `entry-${entryCounter}`;
        const row = document.createElement('div');
        row.className = `break-row ${cfg.rowClass}`;
        row.dataset.type = type;
        row.innerHTML = `
            <div class="break-input-wrap">
                <span class="break-type-badge">${cfg.badge}</span>
                <input
                    type="text"
                    name="entryValue"
                    id="${id}"
                    placeholder="${cfg.placeholder}"
                    maxlength="${cfg.maxlength}"
                    autocomplete="off"
                    required
                />
            </div>
            <button type="button" class="break-remove-btn" aria-label="${cfg.removeLabel}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        breakList.appendChild(row);

        const input = row.querySelector('input');
        input.addEventListener('input', () => {
            if (row.classList.contains('has-error')) {
                row.classList.remove('has-error');
                clearGroupError('breaks-group', 'breaks-error');
            }
        });

        row.querySelector('.break-remove-btn').addEventListener('click', () => {
            const rows = breakList.querySelectorAll('.break-row');
            if (rows.length <= 1) return;
            row.remove();
            updateRemoveButtons();
        });

        updateRemoveButtons();
        if (focus) input.focus();
    };

    addBreakBtn.addEventListener('click', () => addEntryRow('Break', true));
    addPersonalBtn.addEventListener('click', () => addEntryRow('Personal', true));

    // Start with one break row
    addEntryRow('Break', false);

    // ───── Validation helpers ─────
    const setFieldError = (input, message) => {
        const group = input.closest('.input-group');
        const errorEl = document.getElementById(`${input.id}-error`);
        if (message) {
            group.classList.add('has-error');
            input.setAttribute('aria-invalid', 'true');
            if (errorEl) errorEl.textContent = message;
        } else {
            group.classList.remove('has-error');
            input.removeAttribute('aria-invalid');
            if (errorEl) errorEl.textContent = '';
        }
    };

    const validateField = (input) => {
        const value = input.value.trim();
        if (!value) {
            const labelText = input.previousElementSibling?.firstChild?.textContent?.trim() || 'This field';
            setFieldError(input, `${labelText} is required.`);
            return false;
        }
        setFieldError(input, '');
        return true;
    };

    const setGroupError = (groupId, errorId, message) => {
        const group = document.getElementById(groupId);
        const errorEl = document.getElementById(errorId);
        if (message) {
            group.classList.add('has-error');
            if (errorEl) errorEl.textContent = message;
        } else {
            group.classList.remove('has-error');
            if (errorEl) errorEl.textContent = '';
        }
    };

    const clearGroupError = (groupId, errorId) => setGroupError(groupId, errorId, '');

    const validateShowRoom = () => {
        const selected = form.querySelector('input[name="showRoom"]:checked');
        if (!selected) {
            setGroupError('showRoom-group', 'showRoom-error', 'Please pick a studio.');
            return false;
        }
        setGroupError('showRoom-group', 'showRoom-error', '');
        return true;
    };

    const validateEntries = () => {
        const rows = breakList.querySelectorAll('.break-row');
        if (rows.length === 0) {
            setGroupError('breaks-group', 'breaks-error', 'Please add at least one break or personal.');
            return false;
        }

        let allValid = true;
        rows.forEach((row) => {
            const input = row.querySelector('input');
            if (!input.value.trim()) {
                row.classList.add('has-error');
                allValid = false;
            } else {
                row.classList.remove('has-error');
            }
        });

        if (!allValid) {
            setGroupError('breaks-group', 'breaks-error', 'Fill in every break number and customer name, or remove the empty rows.');
            return false;
        }

        setGroupError('breaks-group', 'breaks-error', '');
        return true;
    };

    const validateForm = () => {
        const textInputs = form.querySelectorAll('.form-section input[required][type="text"]');
        let firstInvalid = null;
        let allValid = true;
        textInputs.forEach((input) => {
            // Skip entry inputs — handled by validateEntries
            if (input.name === 'entryValue') return;
            const valid = validateField(input);
            if (!valid) {
                allValid = false;
                if (!firstInvalid) firstInvalid = input;
            }
        });
        if (!validateShowRoom()) {
            allValid = false;
            if (!firstInvalid) firstInvalid = document.getElementById('showRoom-group');
        }
        if (!validateEntries()) {
            allValid = false;
            if (!firstInvalid) firstInvalid = document.getElementById('breaks-group');
        }
        if (firstInvalid && typeof firstInvalid.scrollIntoView === 'function') {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (firstInvalid.tagName === 'INPUT') firstInvalid.focus();
        }
        return allValid;
    };

    // Live error clearing on the static fields
    form.querySelectorAll('#showName, #breakerName').forEach((input) => {
        input.addEventListener('input', () => {
            const group = input.closest('.input-group');
            if (group.classList.contains('has-error')) validateField(input);
        });
        input.addEventListener('blur', () => {
            if (input.value.trim()) validateField(input);
        });
    });

    form.querySelectorAll('input[name="showRoom"]').forEach((el) => {
        el.addEventListener('change', validateShowRoom);
    });

    // ───── Submit ─────
    const summarizeEntries = (entries) => {
        const breaks = entries.filter((e) => e.type === 'Break').length;
        const personals = entries.filter((e) => e.type === 'Personal').length;
        const parts = [];
        if (breaks) parts.push(`${breaks} break${breaks === 1 ? '' : 's'}`);
        if (personals) parts.push(`${personals} personal${personals === 1 ? '' : 's'}`);
        return parts.join(' · ') || '0 entries';
    };

    const showSuccessView = (record) => {
        formView.hidden = true;
        successView.hidden = false;
        if (headerTitle) {
            headerTitle.innerHTML = `Logged. <span class="text-gold">Nice.</span>`;
        }
        if (headerSub) {
            headerSub.textContent = 'Your show and breaks are in Airtable.';
        }
        if (successSummary) {
            successSummary.textContent = summarizeEntries(record?.entries || []);
        }
        if (successShowName) {
            successShowName.textContent = record?.showName || '';
        }
    };

    const resetView = () => {
        successView.hidden = true;
        formView.hidden = false;
        if (headerTitle) {
            headerTitle.innerHTML = `Start a <span class="text-gold">Break Cycle</span>`;
        }
        if (headerSub) {
            headerSub.textContent = 'Log a show and its breaks. Each break gets linked back to the show automatically.';
        }
        form.reset();
        breakList.innerHTML = '';
        entryCounter = 0;
        addEntryRow('Break', false);
        formMessage.classList.remove('show', 'success', 'error');
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (resetBtn) resetBtn.addEventListener('click', resetView);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitBtn.classList.contains('loading')) return;

        formMessage.classList.remove('show', 'success', 'error');

        if (!validateForm()) {
            formMessage.textContent = 'Please complete the highlighted fields before submitting.';
            formMessage.className = 'error show';
            return;
        }

        const formData = new FormData(form);
        const entries = Array.from(breakList.querySelectorAll('.break-row'))
            .map((row) => ({
                type: row.dataset.type,
                value: row.querySelector('input').value.trim(),
            }))
            .filter((entry) => entry.value);

        const data = {
            showName: formData.get('showName').trim(),
            breakerName: formData.get('breakerName').trim(),
            showRoom: formData.get('showRoom'),
            entries,
        };

        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const response = await fetch(SUBMIT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.error('Submission error payload:', err);
                const detail = err.airtableError && (err.airtableError.message || err.airtableError.type)
                    ? ` (Airtable: ${err.airtableError.message || err.airtableError.type})`
                    : '';
                throw new Error(`${err.error || 'Submission failed'}${detail}`);
            }

            showSuccessView(data);
        } catch (error) {
            console.error('Error submitting break cycle:', error);
            formMessage.textContent = error.message && error.message !== 'Submission failed'
                ? error.message
                : 'Oops! Something went wrong. Please try again.';
            formMessage.className = 'error show';
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
});
