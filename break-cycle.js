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
    const resetBtn = document.getElementById('reset-btn');

    const SUBMIT_ENDPOINT = '/api/submit-break-cycle';

    const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    // ───── Dynamic break rows ─────
    let breakCounter = 0;

    const renumberRows = () => {
        const rows = breakList.querySelectorAll('.break-row');
        rows.forEach((row, idx) => {
            const indexEl = row.querySelector('.break-index');
            if (indexEl) indexEl.textContent = String(idx + 1).padStart(2, '0');
            const removeBtn = row.querySelector('.break-remove-btn');
            if (removeBtn) removeBtn.style.display = rows.length > 1 ? 'flex' : 'none';
        });
    };

    const addBreakRow = (focus = true) => {
        breakCounter += 1;
        const id = `break-${breakCounter}`;
        const row = document.createElement('div');
        row.className = 'break-row';
        row.innerHTML = `
            <div class="break-input-wrap">
                <span class="break-index"></span>
                <input
                    type="text"
                    name="breakNumber"
                    id="${id}"
                    placeholder="Break number"
                    maxlength="50"
                    autocomplete="off"
                    required
                />
            </div>
            <button type="button" class="break-remove-btn" aria-label="Remove break">
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
            renumberRows();
        });

        renumberRows();
        if (focus) input.focus();
    };

    addBreakBtn.addEventListener('click', () => addBreakRow(true));

    // Start with one break row
    addBreakRow(false);

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

    const validateBreaks = () => {
        const rows = breakList.querySelectorAll('.break-row');
        if (rows.length === 0) {
            setGroupError('breaks-group', 'breaks-error', 'Please add at least one break.');
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
            setGroupError('breaks-group', 'breaks-error', 'Fill in every break number, or remove the empty ones.');
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
            // Skip break inputs — handled by validateBreaks
            if (input.name === 'breakNumber') return;
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
        if (!validateBreaks()) {
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
    const showSuccessView = (record) => {
        formView.hidden = true;
        successView.hidden = false;
        if (headerTitle) {
            headerTitle.innerHTML = `Logged. <span class="text-gold">Nice.</span>`;
        }
        if (headerSub) {
            headerSub.textContent = 'Your show and breaks are in Airtable.';
        }
        const breakCount = record?.breakNumbers?.length || 0;
        if (successSummary) {
            successSummary.textContent = `${breakCount} break${breakCount === 1 ? '' : 's'}`;
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
        breakCounter = 0;
        addBreakRow(false);
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
        const breakNumbers = formData
            .getAll('breakNumber')
            .map((v) => String(v).trim())
            .filter(Boolean);

        const data = {
            showName: formData.get('showName').trim(),
            breakerName: formData.get('breakerName').trim(),
            showRoom: formData.get('showRoom'),
            breakNumbers,
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
                throw new Error(err.error || 'Submission failed');
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
