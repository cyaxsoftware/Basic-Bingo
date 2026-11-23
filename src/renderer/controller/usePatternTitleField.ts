import { useState, type FocusEventHandler, type KeyboardEventHandler } from 'react';

export interface PatternTitleField {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur: FocusEventHandler<HTMLInputElement>;
  readonly onKeyDown: KeyboardEventHandler<HTMLInputElement>;
}

/**
 * The working pattern's name as an inline text field. Typing is local; the name is committed to the game when
 * the field loses focus or Enter is pressed. An empty name is refused by the game, so the real title is just
 * shown again.
 */
export function usePatternTitleField(title: string, onRename: (title: string) => void): PatternTitleField {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? title,
    onChange: setDraft,
    onBlur: () => {
      const next = draft?.trim();
      setDraft(null);
      if (next && next !== title) onRename(next);
    },
    onKeyDown: (event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
    },
  };
}
