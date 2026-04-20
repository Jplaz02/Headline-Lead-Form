document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('lead-form');
    const submitBtn = document.getElementById('submit-btn');
    const formMessage = document.getElementById('form-message');
    const formView = document.getElementById('form-view');
    const successView = document.getElementById('success-view');
    const successMeta = document.getElementById('success-meta');
    const headerTitle = document.getElementById('header-title');
    const headerSub = document.getElementById('header-sub');

    const STORAGE_KEY = 'headline_lead_submitted';
    const SUBMIT_ENDPOINT = '/api/submit-lead';

    const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const showSuccessView = (record) => {
        formView.hidden = true;
        successView.hidden = false;

        if (headerTitle) {
            headerTitle.innerHTML = record && record.firstName
                ? `Thanks, <span class="text-amber">${escapeHtml(record.firstName)}</span>`
                : `You're all <span class="text-amber">set</span>`;
        }
        if (headerSub) {
            headerSub.textContent = 'Your entry has been locked in for the card-show giveaway.';
        }

        if (successMeta && record && record.submittedAt) {
            const when = new Date(record.submittedAt);
            successMeta.textContent = `Submitted ${when.toLocaleString()}`;
        }
    };

    // If this device has already submitted, skip the form.
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            showSuccessView(JSON.parse(stored));
            return;
        }
    } catch (err) {
        console.warn('Could not read submission state:', err);
    }

    // --- Validation helpers ---
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE_RE = /^[+]?[\d\s\-().]{7,}$/;

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
            setFieldError(input, `${input.previousElementSibling.firstChild.textContent.trim()} is required.`);
            return false;
        }
        if (input.type === 'email' && !EMAIL_RE.test(value)) {
            setFieldError(input, 'Please enter a valid email address.');
            return false;
        }
        if (input.type === 'tel' && !PHONE_RE.test(value)) {
            setFieldError(input, 'Please enter a valid phone number.');
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

    const validateInterest = () => {
        const selected = form.querySelector('input[name="interest"]:checked');
        if (!selected) {
            setGroupError('interest-group', 'interest-error', 'Please select one.');
            return false;
        }
        setGroupError('interest-group', 'interest-error', '');
        return true;
    };

    const validateSports = () => {
        const selected = form.querySelectorAll('input[name="sports"]:checked');
        if (selected.length === 0) {
            setGroupError('sports-group', 'sports-error', 'Please select at least one.');
            return false;
        }
        setGroupError('sports-group', 'sports-error', '');
        return true;
    };

    const validateForm = () => {
        const textInputs = form.querySelectorAll('input[required][type="text"], input[required][type="email"], input[required][type="tel"]');
        let firstInvalid = null;
        let allValid = true;
        textInputs.forEach((input) => {
            const valid = validateField(input);
            if (!valid) {
                allValid = false;
                if (!firstInvalid) firstInvalid = input;
            }
        });
        if (!validateInterest()) {
            allValid = false;
            if (!firstInvalid) firstInvalid = document.getElementById('interest-group');
        }
        if (!validateSports()) {
            allValid = false;
            if (!firstInvalid) firstInvalid = document.getElementById('sports-group');
        }
        if (firstInvalid && typeof firstInvalid.focus === 'function') {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (firstInvalid.tagName === 'INPUT') firstInvalid.focus();
        }
        return allValid;
    };

    // Clear error styling as the user corrects the field.
    form.querySelectorAll('input[required][type="text"], input[required][type="email"], input[required][type="tel"]').forEach((input) => {
        input.addEventListener('input', () => {
            const group = input.closest('.input-group');
            if (group.classList.contains('has-error')) {
                validateField(input);
            }
        });
        input.addEventListener('blur', () => {
            if (input.value.trim()) validateField(input);
        });
    });

    form.querySelectorAll('input[name="interest"]').forEach((el) => {
        el.addEventListener('change', validateInterest);
    });
    form.querySelectorAll('input[name="sports"]').forEach((el) => {
        el.addEventListener('change', validateSports);
    });

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
        const data = {
            firstName: formData.get('firstName').trim(),
            lastName: formData.get('lastName').trim(),
            email: formData.get('email').trim(),
            phone: formData.get('phone').trim(),
            interest: formData.get('interest'),
            sports: formData.getAll('sports'),
            referral: (formData.get('referral') || '').trim(),
            submittedAt: new Date().toISOString()
        };

        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const response = await fetch(SUBMIT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    phone: data.phone,
                    interest: data.interest,
                    sports: data.sports,
                    referral: data.referral
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Submission failed');
            }

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (err) {
                console.warn('Could not persist submission state:', err);
            }

            showSuccessView(data);

        } catch (error) {
            console.error('Error submitting form:', error);
            formMessage.textContent = 'Oops! Something went wrong. Please try again.';
            formMessage.className = 'error show';
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
});
