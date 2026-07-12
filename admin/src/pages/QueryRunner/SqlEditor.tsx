import { useState, useRef } from 'react';
import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import { Box, Flex, Button, SingleSelect, SingleSelectOption, Typography } from '@strapi/design-system';
import { Play, Loader } from '@strapi/icons';

interface Props {
  initialSql?: string;
  onRun: (sql: string, limit: number) => void;
  onExplain: (sql: string) => void;
  onExplainAnalyze: (sql: string) => void;
  isLoading: boolean;
}

const ROW_LIMITS = [25, 50, 100, 500, 1000, 5000];

export const SqlEditor = ({ initialSql = '', onRun, onExplain, onExplainAnalyze, isLoading }: Props) => {
  const [sql, setSql] = useState(initialSql);
  const [limit, setLimit] = useState(100);
  const sqlRef = useRef(sql);

  const handleChange = (val: string | undefined) => {
    const v = val ?? '';
    setSql(v);
    sqlRef.current = v;
  };

  const handleMount: OnMount = (editor, monaco) => {
    // Ctrl/Cmd+Enter to run
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRun(sqlRef.current, limit)
    );
  };

  return (
    <Box>
      <Box borderRadius="4px" style={{ border: '1px solid #dcdce4', overflow: 'hidden' }}>
        <MonacoEditor
          height="240px"
          language="sql"
          value={sql}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            wordWrap: 'on',
            fontSize: 13,
            fontFamily: 'monospace',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
          }}
          theme="vs"
        />
      </Box>

      <Flex marginTop={3} gap={2} alignItems="center" wrap="wrap">
        <Button
          startIcon={isLoading ? <Loader /> : <Play />}
          onClick={() => onRun(sql, limit)}
          disabled={isLoading || !sql.trim()}
          size="S"
        >
          Run (⌘↵)
        </Button>

        <Button
          variant="secondary"
          onClick={() => onExplain(sql)}
          disabled={isLoading || !sql.trim()}
          size="S"
        >
          EXPLAIN
        </Button>

        <Button
          variant="secondary"
          onClick={() => onExplainAnalyze(sql)}
          disabled={isLoading || !sql.trim()}
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
};
