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
    activeModal.querySelector('.modal-dialog')?.classList.remove('modal-dialog--info', 'modal-dialog--success', 'modal-dialog--warning', 'modal-dialog--danger', 'modal-dialog--wide');
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

  const openDialog = ({ title, message, tone = 'info', wide = false, controls, actions, cancelResult }) => new Promise(resolve => {
    const modal = document.getElementById('appDialogModal');
    if (!modal) throw new Error('Common dialog markup is not loaded.');
    const dialog = modal.querySelector('.modal-dialog');
    if (wide && dialog) dialog.classList.add('modal-dialog--wide');
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

  const prompt = ({ title, message, label, placeholder = '', initialValue = '', required = true, confirmLabel = '저장', cancelLabel = '취소', tone = 'info' }) => openDialog({
    title, message, tone, cancelResult: null,
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
      addButton(area, confirmLabel, tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary', () => {
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

  const selectCards = ({ title, message, options = [], confirmLabel = '선택', cancelLabel = '취소', tone = 'info', multiSelect = true }) => openDialog({
    title, message, tone, wide: true, cancelResult: null,
    controls: (area) => {
      let selectedValues = multiSelect
        ? (options.length > 0 ? [options[0].value] : [])
        : (options.length > 0 ? options[0].value : null);

      const container = document.createElement('div');
      container.className = 'modal-card-grid';
      container.setAttribute('role', multiSelect ? 'group' : 'radiogroup');
      container.setAttribute('aria-label', title);

      const updateContainerState = () => {
        container.dataset.selectedValue = multiSelect ? JSON.stringify(selectedValues) : (selectedValues || '');
      };

      if (options.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'modal-card-empty';
        empty.textContent = '선택할 수 있는 항목이 없습니다.';
        container.appendChild(empty);
        area.appendChild(container);
        return container;
      }

      options.forEach(option => {
        const card = document.createElement('div');
        const isSelected = multiSelect
          ? selectedValues.includes(option.value)
          : option.value === selectedValues;

        card.className = 'modal-select-card' + (isSelected ? ' is-selected' : '');
        card.tabIndex = 0;
        card.dataset.value = option.value;
        card.setAttribute('role', multiSelect ? 'checkbox' : 'radio');
        card.setAttribute('aria-checked', isSelected ? 'true' : 'false');

        const header = document.createElement('div');
        header.className = 'modal-select-card__header';

        const titleEl = document.createElement('div');
        titleEl.className = 'modal-select-card__title';
        titleEl.textContent = option.title || option.label || '';

        const checkIndicator = document.createElement('div');
        checkIndicator.className = 'modal-select-card__check';
        checkIndicator.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

        header.appendChild(titleEl);
        header.appendChild(checkIndicator);
        card.appendChild(header);

        const body = document.createElement('div');
        body.className = 'modal-select-card__body';

        if (option.badge) {
          const badgeEl = document.createElement('span');
          badgeEl.className = 'modal-select-card__badge';
          badgeEl.textContent = option.badge;
          body.appendChild(badgeEl);
        }

        if (option.description) {
          const descEl = document.createElement('p');
          descEl.className = 'modal-select-card__desc';
          descEl.textContent = option.description;
          body.appendChild(descEl);
        }

        if (option.lessons && option.lessons.length > 0) {
          const lessonContainer = document.createElement('div');
          lessonContainer.className = 'modal-select-card__lessons';
          option.lessons.forEach((lTitle, idx) => {
            const chip = document.createElement('span');
            chip.className = 'modal-select-card__chip';
            chip.textContent = `${idx + 1}차시 ${lTitle}`;
            lessonContainer.appendChild(chip);
          });
          if (option.totalLessons && option.totalLessons > option.lessons.length) {
            const more = document.createElement('span');
            more.className = 'modal-select-card__chip-more';
            more.textContent = `+ ${option.totalLessons - option.lessons.length}개 차시`;
            lessonContainer.appendChild(more);
          }
          body.appendChild(lessonContainer);
        }

        if (body.children.length > 0) {
          card.appendChild(body);
        }

        const toggleThisCard = () => {
          if (multiSelect) {
            if (selectedValues.includes(option.value)) {
              selectedValues = selectedValues.filter(v => v !== option.value);
              card.classList.remove('is-selected');
              card.setAttribute('aria-checked', 'false');
            } else {
              selectedValues.push(option.value);
              card.classList.add('is-selected');
              card.setAttribute('aria-checked', 'true');
            }
          } else {
            container.querySelectorAll('.modal-select-card').forEach(c => {
              c.classList.remove('is-selected');
              c.setAttribute('aria-checked', 'false');
            });
            card.classList.add('is-selected');
            card.setAttribute('aria-checked', 'true');
            selectedValues = option.value;
          }
          updateContainerState();
        };

        card.addEventListener('click', toggleThisCard);

        card.addEventListener('dblclick', () => {
          if (!multiSelect) {
            toggleThisCard();
            const confirmBtn = document.querySelector('#appDialogActions button[data-modal-primary="true"]');
            if (confirmBtn) confirmBtn.click();
          }
        });

        card.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggleThisCard();
          }
        });

        container.appendChild(card);
      });

      updateContainerState();
      area.appendChild(container);
      return container.querySelector('.modal-select-card.is-selected') || container.querySelector('.modal-select-card');
    },
    actions: (area, done) => {
      addButton(area, cancelLabel, 'btn btn-secondary', () => done(null));
      addButton(area, confirmLabel, 'btn btn-primary', () => {
        const container = document.querySelector('#appDialogControl .modal-card-grid');
        if (!container || !container.dataset.selectedValue) {
          done(multiSelect ? [] : null);
          return;
        }
        if (multiSelect) {
          try {
            const arr = JSON.parse(container.dataset.selectedValue);
            if (!Array.isArray(arr) || arr.length === 0) {
              alert('최소 1개 이상의 프로젝트를 선택해 주세요.');
              return;
            }
            done(arr);
          } catch (e) {
            done([]);
          }
        } else {
          done(container.dataset.selectedValue);
        }
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

  window.ModalService = { normalizeInput, findOption, alert, confirm, prompt, select, selectCards, showCustom, hideCustom };
  window.alert = (message) => { void alert({ title: '안내', message: String(message), tone: 'info' }); };
})();
