import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { Box, Flex, Button, SingleSelect, SingleSelectOption, Typography } from '@strapi/design-system';
import { Play, Loader } from '@strapi/icons';
import { useDbViewTheme } from '../../hooks/useDbViewTheme';

interface Props {
  sql: string;
  onChange: (sql: string) => void;
  onRun: (sql: string, limit: number) => void;
  onExplain: (sql: string) => void;
  onExplainAnalyze: (sql: string) => void;
  isLoading: boolean;
}

export interface SqlEditorHandle {
  /** Insert text at the current caret (replacing any selection) and refocus. */
  insertAtCursor: (text: string) => void;
}

const ROW_LIMITS = [25, 50, 100, 500, 1000, 5000];

export const SqlEditor = forwardRef<SqlEditorHandle, Props>(function SqlEditor(
  { sql: sqlValue, onChange, onRun, onExplain, onExplainAnalyze, isLoading },
  ref
) {
  const [limit, setLimit] = useState(100);
  const { colors, isDark } = useDbViewTheme();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeRef = useRef(new Compartment());

  // Callbacks are read through refs so the editor never has to be rebuilt when
  // a parent re-render hands us new function identities.
  const latest = useRef({ sql: sqlValue, limit, onChange, onRun });
  latest.current = { sql: sqlValue, limit, onChange, onRun };

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: latest.current.sql,
        extensions: [
          basicSetup,
          sql(),
          keymap.of([
            {
              key: 'Mod-Enter',
              preventDefault: true,
              run: () => {
                const { sql: current, limit: rows, onRun: run } = latest.current;
                if (current.trim()) run(current, rows);
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              latest.current.onChange(update.state.doc.toString());
            }
          }),
          EditorView.theme({ '&': { height: '240px' }, '.cm-scroller': { fontFamily: 'monospace' } }),
          themeRef.current.of(isDark ? oneDark : []),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Built once; value and theme are pushed in via the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push external changes (insert table, load from history/saved) into the document.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === sqlValue) return; // Echo of the user's own typing — leave the cursor alone.

    view.dispatch({
      changes: { from: 0, to: current.length, insert: sqlValue },
    });
  }, [sqlValue]);

  // Swap the theme in place rather than tearing the editor down.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeRef.current.reconfigure(isDark ? oneDark : []),
    });
  }, [isDark]);

  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      const view = viewRef.current;
      if (!view) return;

      const range = view.state.selection.main;
      const before =
        range.from > 0 ? view.state.doc.sliceString(range.from - 1, range.from) : '';
      // Add a separating space only when inserting mid-token; not at the
      // start of the doc, after whitespace, or right after an opening paren.
      const insert = (before === '' || /[\s(]/.test(before) ? '' : ' ') + text;

      view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: { anchor: range.from + insert.length },
      });
      view.focus();
    },
  }));

  return (
    <Box>
      <Box
        borderRadius="4px"
        style={{ border: `1px solid ${colors.neutral200}`, overflow: 'hidden' }}
      >
        <div ref={hostRef} />
      </Box>

      <Flex marginTop={3} gap={2} alignItems="center" wrap="wrap">
        <Button
          startIcon={isLoading ? <Loader /> : <Play />}
          onClick={() => onRun(sqlValue, limit)}
          disabled={isLoading || !sqlValue.trim()}
          size="S"
        >
          Run (⌘↵)
        </Button>

        <Button
          variant="secondary"
          onClick={() => onExplain(sqlValue)}
          disabled={isLoading || !sqlValue.trim()}
          size="S"
        >
          EXPLAIN
        </Button>

        <Button
          variant="secondary"
          onClick={() => onExplainAnalyze(sqlValue)}
          disabled={isLoading || !sqlValue.trim()}
          size="S"
        >
          EXPLAIN ANALYZE
        </Button>

        <Flex alignItems="center" gap={2} marginLeft="auto">
          <Typography variant="omega" textColor="neutral600">Limit:</Typography>
          <Box style={{ minWidth: 100 }}>
            <SingleSelect
              size="S"
              value={String(limit)}
              onChange={(val) => setLimit(Number(val))}
              aria-label="Row limit"
            >
              {ROW_LIMITS.map((n) => (
                <SingleSelectOption key={n} value={String(n)}>{n.toLocaleString()} rows</SingleSelectOption>
              ))}
            </SingleSelect>
          </Box>
        </Flex>
      </Flex>
    </Box>
  );
});
