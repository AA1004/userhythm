import React, { useEffect, useRef, useState } from 'react';
import { CHART_EDITOR_THEME } from './constants';

interface EditorNumberInputProps {
  value: number | null;
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  allowEmpty?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  selectOnFocus?: boolean;
  style?: React.CSSProperties;
}

const formatValue = (value: number | null) => (value == null ? '' : String(value));

export const EditorNumberInput: React.FC<EditorNumberInputProps> = ({
  value,
  onCommit,
  min,
  max,
  integer = false,
  allowEmpty = false,
  disabled = false,
  placeholder,
  ariaLabel,
  selectOnFocus = true,
  style,
}) => {
  const [draft, setDraft] = useState(() => formatValue(value));
  const [error, setError] = useState<string | null>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current && !error) {
      setDraft(formatValue(value));
    }
  }, [value, error]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed && allowEmpty) {
      setError(null);
      onCommit(null);
      return true;
    }

    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed)) {
      setError('올바른 숫자를 입력해주세요.');
      return false;
    }
    if (integer && !Number.isInteger(parsed)) {
      setError('정수로 입력해주세요.');
      return false;
    }
    if (min !== undefined && parsed < min) {
      setError(`${min} 이상으로 입력해주세요.`);
      return false;
    }
    if (max !== undefined && parsed > max) {
      setError(`${max} 이하로 입력해주세요.`);
      return false;
    }

    setError(null);
    setDraft(formatValue(parsed));
    onCommit(parsed);
    return true;
  };

  return (
    <span style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 2, ...style }}>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onFocus={(event) => {
          focusedRef.current = true;
          if (selectOnFocus) event.currentTarget.select();
        }}
        onBlur={() => {
          focusedRef.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (commit()) event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(formatValue(value));
            setError(null);
            event.currentTarget.blur();
          }
        }}
        onWheel={(event) => event.currentTarget.blur()}
        style={{
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          padding: '4px 6px',
          borderRadius: CHART_EDITOR_THEME.radiusSm,
          border: `1px solid ${error ? CHART_EDITOR_THEME.danger : CHART_EDITOR_THEME.borderSubtle}`,
          backgroundColor: '#020617',
          color: CHART_EDITOR_THEME.textPrimary,
          fontSize: 11,
          opacity: disabled ? 0.55 : 1,
        }}
      />
      {error && (
        <span style={{ color: CHART_EDITOR_THEME.danger, fontSize: 9, lineHeight: 1.2 }}>
          {error}
        </span>
      )}
    </span>
  );
};
