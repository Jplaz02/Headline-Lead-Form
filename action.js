document.addEventListener('DOMContentLoaded', () => {
    const STATUS_ENDPOINT = '/api/break-status';
    const SUBMIT_ENDPOINT = '/api/log-break-event';

    const RECORD_ID_PATTERN = /^rec[A-Za-z0-9]{14}$/;

    // Status → action label. Anything not here falls through to the error view.
    const STATUS_TO_ACTION = {
        'Waiting to Sort': 'Start Sorting',
        'Sorting': 'Finish Sorting',
        'Ready to Ship': 'Start Shipping',
        'Waiting to Ship': 'Start Shipping',
        'Shipping': 'Finish Shipping',
    };

    const loadingView = document.getElementById('loading-view');
    const formView = document.getElementById('form-view');
    const infoView = document.getElementById('info-view');
    const successView = document.getElementById('success-view');

    const summaryBreakNumber = document.getElementById('summary-break-number');
    const summaryStatus = document.getElementById('summary-status');
    const summaryBreakerRow = document.getElementById('summary-breaker-row');
    const summaryBreaker = document.getElementById('summary-breaker');
    const summaryStudioRow = document.getElementById('summary-studio-row');
    const summaryStudio = document.getElementById('summary-studio');

    const form = document.getElementById('action-form');
    const submitBtn = document.getElementById('submit-btn');
    const submitBtnText = document.getElementById('submit-btn-text');
    const formMessage = document.getElementById('form-message');
    const scannedByInput = document.getElementById('scannedBy');

    const infoTitle = document.getElementById('info-title');
    const infoMessage = document.getElementById('info-message');
    const infoIcon = document.getElementById('info-icon');

    const successAction = document.getElementById('success-action');
    const successBreakNumber = document.getElementById('success-break-number');
    const successName = document.getElementById('success-name');

    const showOnly = (view) => {
        [loadingView, formView, infoView, successView].forEach((v) => {
            if (!v) return;
            v.hidden = v !== view;
        });
    };

    const showError = (message) => {
        infoTitle.textContent = 'Something went wrong';
        infoMessage.textContent = message || 'Contact your admin.';
        infoIcon.classList.add('is-error');
        showOnly(infoView);
    };

    const showComplete = () => {
        infoTitle.textContent = 'This break is already complete.';
        infoMessage.textContent = 'No further action required.';
        infoIcon.classList.remove('is-error');
        showOnly(infoView);
    };

    let breakRecordId = '';
    let breakNumber = '';
    let currentAction = '';

    const params = new URLSearchParams(window.location.search);
    const idParam = (params.get('id') || '').trim();
    if (!RECORD_ID_PATTERN.test(idParam)) {
        showError('Missing or invalid break ID. Contact your admin.');
        return;
    }
    breakRecordId = idParam;

    // ───── Fetch break status ─────
    (async () => {
        try {
            const res = await fetch(`${STATUS_ENDPOINT}?id=${encodeURIComponent(breakRecordId)}`);
            if (!res.ok) {
                showError('Could not load this break. Contact your admin.');
                return;
            }
            const data = await res.json();
            const status = data?.status?.name || data?.status || null;
            breakNumber = data?.breakNumber || '';
            const breaker = data?.breaker || '';
            const studio = data?.showRoom?.name || data?.showRoom || '';

            if (status === 'Shipped') {
                summaryBreakNumber.textContent = breakNumber || '—';
                showComplete();
                return;
            }

            const action = STATUS_TO_ACTION[status];
            if (!action) {
                showError('Contact your admin.');
                return;
            }

            currentAction = action;
            summaryBreakNumber.textContent = breakNumber || '—';
            summaryStatus.textContent = status;
            if (breaker) {
                summaryBreaker.textContent = breaker;
                summaryBreakerRow.hidden = false;
            }
            if (studio) {
                summaryStudio.textContent = studio;
                summaryStudioRow.hidden = false;
            }
            submitBtnText.textContent = action;
            showOnly(formView);
        } catch (err) {
            console.error('Failed to load break status:', err);
            showError('Could not reach the server. Contact your admin.');
        }
    })();

    // ───── Validation ─────
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

    const validateName = () => {
        const value = scannedByInput.value.trim();
        if (!value) {
            setFieldError(scannedByInput, 'Your Name is required.');
            return false;
        }
        setFieldError(scannedByInput, '');
        return true;
    };

    scannedByInput.addEventListener('input', () => {
        const group = scannedByInput.closest('.input-group');
        if (group.classList.contains('has-error')) validateName();
    });
    scannedByInput.addEventListener('blur', () => {
        if (scannedByInput.value.trim()) validateName();
    });

    // ───── Submit ─────
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitBtn.classList.contains('loading')) return;

        formMessage.classList.remove('show', 'success', 'error');

        if (!validateName()) {
            formMessage.textContent = 'Please enter your name before submitting.';
            formMessage.className = 'error show';
            return;
        }

        const scannedBy = scannedByInput.value.trim();
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const response = await fetch(SUBMIT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    breakId: breakRecordId,
                    action: currentAction,
                    scannedBy,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.error('Submission error payload:', err);
                const detail = err.airtableError && (err.airtableError.message || err.airtableError.type)
                    ? ` (Airtable: ${err.airtableError.message || err.airtableError.type})`
                    : '';
                throw new Error(`${err.error || 'Submission failed'}${detail}`);
            }

            successAction.textContent = currentAction;
            successBreakNumber.textContent = breakNumber || '—';
            successName.textContent = scannedBy;
            showOnly(successView);
        } catch (error) {
            console.error('Error logging event:', error);
            formMessage.textContent = error.message && error.message !== 'Submission failed'
                ? error.message
                : 'Oops! Something went wrong. Please try again.';
            formMessage.className = 'error show';
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
});
