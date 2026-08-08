/* ========================================================================== 
   Modal Service: accessible, promise-based application dialogs
   ========================================================================== */

(function () {
  let activeModal = null;
  let activeTrigger = null;
  let activeResolver = null;
  let keydownHandler = null;
  let backdropHandler = null;

  const normalizeInput = (value, required) => {
    const normalized = String(value ?? '').trim();
    return required && !normalized ? null : normalized;
  };

  const findOption = (options, value) => options.find(option => option.value === value) ?? null;

  const focusableSelector = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[href]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const getFocusable = (modal) => Array.from(modal.querySelectorAll(focusableSelector))
    .filter(element => !element.hidden && element.offsetParent !== null);

  const cleanup = () => {
    if (!activeModal) return;
    activeModal.hidden = true;
    activeModal.querySelector('.modal-dialog')?.classList.remove('modal-dialog--info', 'modal-dialog--success', 'modal-dialog--warning', 'modal-dialog--danger');
    activeModal.removeEventListener('click', backdropHandler);
    document.removeEventListener('keydown', keydownHandler);
    document.body.classList.remove('modal-open');
    const trigger = activeTrigger;
    activeModal = null;
    activeTrigger = null;
    activeResolver = null;
    keydownHandler = null;
    backdropHandler = null;
    if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
  };

  const close = (result) => {
    const resolve = activeResolver;
    cleanup();
    if (resolve) resolve(result);
  };

  const activate = (modal, { tone = 'info', cancelResult, onCancel, initialFocus } = {}) => {
    activeModal = modal;
    activeTrigger = document.activeElement;
    const dialog = modal.querySelector('.modal-dialog');
    dialog?.classList.add(`modal-dialog--${tone}`);
    modal.hidden = false;
    document.body.classList.add('modal-open');

    const cancel = () => {
      if (typeof onCancel === 'function') onCancel();
      else close(cancelResult);
    };
    keydownHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(modal);
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    backdropHandler = (event) => {
      if (event.target === modal || event.target.closest('[data-modal-close]')) cancel();
    };
    document.addEventListener('keydown', keydownHandler);
    modal.addEventListener('click', backdropHandler);
    requestAnimationFrame(() => (initialFocus || getFocusable(modal)[0] || dialog)?.focus());
  };

  const openDialog = ({ title, message, tone = 'info', controls, actions, cancelResult }) => new Promise(resolve => {
    const modal = document.getElementById('appDialogModal');
    if (!modal) throw new Error('Common dialog markup is not loaded.');
    document.getElementById('appDialogTitle').textContent = title;
    document.getElementById('appDialogMessage').textContent = message || '';
    const control = document.getElementById('appDialogControl');
    const actionArea = document.getElementById('appDialogActions');
    control.replaceChildren();
    actionArea.replaceChildren();
    const initialFocus = controls?.(control);
    actions(actionArea, close);
    activeResolver = resolve;
    activate(modal, { tone, cancelResult, initialFocus });
  });

  const addButton = (container, label, className, handler, primary = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    if (primary) button.dataset.modalPrimary = 'true';
    button.addEventListener('click', handler);
    container.appendChild(button);
  };

  const alert = ({ title, message, tone = 'info', confirmLabel = '확인' }) => openDialog({
    title, message, tone, cancelResult: undefined,
    actions: (area, done) => addButton(area, confirmLabel, 'btn btn-primary', () => done(), true)
  });

  const confirm = ({ title, message, tone = 'warning', confirmLabel = '확인', cancelLabel = '취소' }) => openDialog({
    title, message, tone, cancelResult: false,
    actions: (area, done) => {
      addButton(area, cancelLabel, 'btn btn-secondary', () => done(false));
      addButton(area, confirmLabel, tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary', () => done(true), true);
    }
  });

  const prompt = ({ title, message, label, placeholder = '', initialValue = '', required = true, confirmLabel = '저장', cancelLabel = '취소' }) => openDialog({
    title, message, cancelResult: null,
    controls: (area) => {
      const group = document.createElement('label');
      group.className = 'form-group modal-dialog__field';
      group.textContent = label;
      const input = document.createElement('input');
      input.className = 'form-input';
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = initialValue;
      input.required = required;
      group.appendChild(input);
      area.appendChild(group);
      return input;
    },
    actions: (area, done) => {
      const input = document.querySelector('#appDialogControl input');
      addButton(area, cancelLabel, 'btn btn-secondary', () => done(null));
      addButton(area, confirmLabel, 'btn btn-primary', () => {
        const value = normalizeInput(input.value, required);
        if (value === null) {
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        done(value);
      }, true);
    }
  });

  const select = ({ title, message, label, options, placeholder = '선택하세요', confirmLabel = '선택', cancelLabel = '취소' }) => openDialog({
    title, message, cancelResult: null,
    controls: (area) => {
      const group = document.createElement('label');
      group.className = 'form-group modal-dialog__field';
      group.textContent = label;
      const selectElement = document.createElement('select');
      selectElement.className = 'form-select';
      const blank = new Option(placeholder, '');
      blank.disabled = true;
      blank.selected = true;
      selectElement.add(blank);
      options.forEach(option => selectElement.add(new Option(option.label, option.value)));
      group.appendChild(selectElement);
      area.appendChild(group);
      return selectElement;
    },
    actions: (area, done) => {
      const selectElement = document.querySelector('#appDialogControl select');
      addButton(area, cancelLabel, 'btn btn-secondary', () => done(null));
      addButton(area, confirmLabel, 'btn btn-primary', () => {
        const option = findOption(options, selectElement.value);
        if (!option) {
          selectElement.setAttribute('aria-invalid', 'true');
          selectElement.focus();
          return;
        }
        done(option.value);
      }, true);
    }
  });

  const showCustom = (modalId, initialFocusId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'grid';
    activate(modal, { onCancel: () => hideCustom(modalId), initialFocus: initialFocusId ? document.getElementById(initialFocusId) : null });
  };

  const hideCustom = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }
    if (activeModal?.id === modalId) cleanup();
  };

  window.ModalService = { normalizeInput, findOption, alert, confirm, prompt, select, showCustom, hideCustom };
  window.alert = (message) => { void alert({ title: '안내', message: String(message), tone: 'info' }); };
})();
