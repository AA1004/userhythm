import React from 'react';

const INTERACTIVE_EDITOR_TARGET_SELECTOR =
  'input, textarea, select, button, a[href], [role="button"], [contenteditable], [tabindex]:not([tabindex="-1"])';

const TEXT_EDITING_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]';

const TRANSIENT_EDITOR_ACTION_SELECTOR = '[data-editor-transient-action="true"]';

const RANGE_INPUT_SELECTOR = 'input[type="range"]';

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
  if (event.detail <= 0) return;
  if (isTextEditingTarget(event.target)) return;
  if (getTransientEditorActionElement(event.target)) {
    event.preventDefault();
  }
};

export const blurEditorTransientAction = (event: React.MouseEvent<HTMLElement>) => {
  if (event.detail <= 0) return;
  getTransientEditorActionElement(event.target)?.blur();
};

export const blurEditorTransientActionOnFocus = (event: React.FocusEvent<HTMLElement>) => {
  if (isTextEditingTarget(event.target)) return;
  const actionElement = getTransientEditorActionElement(event.target);
  if (actionElement && document.activeElement === actionElement) {
    actionElement.blur();
  }
};

export const getEditorFocusCleanupElement = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof HTMLElement)) return null;
  const candidate =
    target.closest(TRANSIENT_EDITOR_ACTION_SELECTOR) ?? target.closest(RANGE_INPUT_SELECTOR);
  return candidate instanceof HTMLElement ? candidate : null;
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

export const blurEditorNonTextControlOnFocus = (event: React.FocusEvent<HTMLElement>) => {
  if (isTextEditingTarget(event.target)) return;
  const focusElement = getEditorFocusCleanupElement(event.target);
  if (focusElement && document.activeElement === focusElement) {
    requestAnimationFrame(() => {
      if (document.activeElement === focusElement) {
        focusElement.blur();
      }
    });
  }
};

