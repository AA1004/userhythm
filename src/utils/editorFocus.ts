import React from 'react';

const INTERACTIVE_EDITOR_TARGET_SELECTOR =
  'input, textarea, select, button, a[href], [role="button"], [contenteditable], [tabindex]:not([tabindex="-1"])';

const TEXT_EDITING_TARGET_SELECTOR =
  'textarea, input:not([type]), input[type="text"], input[type="number"], input[type="search"], input[type="email"], input[type="url"], input[type="password"], input[type="tel"], [contenteditable="true"], [contenteditable=""], [role="textbox"]';

const TRANSIENT_EDITOR_ACTION_SELECTOR = '[data-editor-transient-action="true"]';

const POINTER_CLEANUP_SELECTOR =
  '[data-editor-transient-action="true"], button, [role="button"], input[type="range"], input[type="checkbox"], input[type="radio"]';

const CHANGE_CLEANUP_SELECTOR = 'select';

let pendingPointerCleanupElement: HTMLElement | null = null;

const removePendingPointerCleanupListeners = () => {
  window.removeEventListener('pointerup', finishPendingEditorPointerCleanup, true);
  window.removeEventListener('pointercancel', finishPendingEditorPointerCleanup, true);
};

function finishPendingEditorPointerCleanup() {
  const focusElement = pendingPointerCleanupElement;
  pendingPointerCleanupElement = null;
  removePendingPointerCleanupListeners();

  if (focusElement && document.activeElement === focusElement) {
    focusElement.blur();
  }
}

export const isInteractiveElementFocused = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest(INTERACTIVE_EDITOR_TARGET_SELECTOR) !== null;

export const isTextEditingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(TEXT_EDITING_TARGET_SELECTOR) !== null;
};

export const isTransientEditorAction = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest(TRANSIENT_EDITOR_ACTION_SELECTOR) !== null;

export const getTransientEditorActionElement = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof HTMLElement)) return null;
  const candidate = target.closest(TRANSIENT_EDITOR_ACTION_SELECTOR);
  return candidate instanceof HTMLElement ? candidate : null;
};

export const preventTransientEditorActionFocus = (
  event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>
) => {
  if (isTextEditingTarget(event.target)) return;
  const actionElement = getTransientEditorActionElement(event.target);
  if (!actionElement) return;

  // Preventing the action button from taking focus would otherwise leave a
  // previously edited input/select focused. Blur it first so its value commits
  // and editor shortcuts become available immediately after the action.
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    activeElement !== actionElement &&
    isInteractiveElementFocused(activeElement)
  ) {
    activeElement.blur();
  }

  event.preventDefault();
};

export const blurEditorTransientAction = (event: React.MouseEvent<HTMLElement>) => {
  if (event.detail <= 0) return;
  getTransientEditorActionElement(event.target)?.blur();
};

export const getEditorFocusCleanupElement = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof HTMLElement)) return null;
  const candidate = target.closest(POINTER_CLEANUP_SELECTOR);
  return candidate instanceof HTMLElement ? candidate : null;
};

// Pointer release can happen outside the slider or editor after a drag. Keep a
// window-level release guard so non-text controls never retain editor focus.
export const armEditorPointerFocusCleanup = (event: React.PointerEvent<HTMLElement>) => {
  if (isTextEditingTarget(event.target)) return;
  const focusElement = getEditorFocusCleanupElement(event.target);
  if (!focusElement) return;

  if (pendingPointerCleanupElement) {
    finishPendingEditorPointerCleanup();
  }

  pendingPointerCleanupElement = focusElement;
  window.addEventListener('pointerup', finishPendingEditorPointerCleanup, true);
  window.addEventListener('pointercancel', finishPendingEditorPointerCleanup, true);
};

export const prepareEditorPointerFocus = (event: React.PointerEvent<HTMLElement>) => {
  armEditorPointerFocusCleanup(event);
  preventTransientEditorActionFocus(event);
};

export const blurEditorNonTextControlAfterPointer = (
  event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>
) => {
  if (isTextEditingTarget(event.target)) return;
  const focusElement = getEditorFocusCleanupElement(event.target);
  if (focusElement && document.activeElement === focusElement) {
    focusElement.blur();
  }
};

export const blurEditorSelectAfterChange = (event: React.FormEvent<HTMLElement>) => {
  if (!(event.target instanceof HTMLElement)) return;
  const select = event.target.closest(CHANGE_CLEANUP_SELECTOR);
  if (!(select instanceof HTMLElement)) return;
  requestAnimationFrame(() => {
    if (document.activeElement === select) select.blur();
  });
};


