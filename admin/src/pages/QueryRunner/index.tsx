import { useState, useEffect, useRef } from 'react';
import { Page, Layouts, useQueryParams } from '@strapi/strapi/admin';
import { Box, Flex, Typography } from '@strapi/design-system';
import { useBrowsePermission, useQueryPermission } from '../../hooks/usePermissions';
import { useDbViewApi } from '../../hooks/useDbViewApi';
import { SqlEditor, type SqlEditorHandle } from './SqlEditor';
import { QueryRunnerSidebar } from './TableSidebar';
import { ResultsPanel } from './ResultsPanel';
import { ExplainPlan } from './ExplainPlan';
import { StructureView } from './StructureView';
import { SavedQueriesPanel } from './SavedQueriesPanel';

type ResultState =
  | null
  | { kind: 'data'; columns: string[]; rows: Record<string, unknown>[]; rowCount: number; durationMs: number; truncated: boolean }
  | { kind: 'explain'; type: 'explain' | 'explain-analyze'; columns: string[]; rows: Record<string, unknown>[]; durationMs: number }
  | { kind: 'structure'; table: string; columns: unknown[]; indexes: unknown[] }
  | { kind: 'error'; message: string };

/** Pull a human-readable message out of a thrown request error, whatever its shape. */
function getRequestErrorMessage(err: unknown): string {
  const body = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  if (typeof body === 'string' && body) return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'An error occurred while running the query.';
}

export const QueryRunner = () => {
  const { canBrowse, isLoading: isLoadingBrowse } = useBrowsePermission();
  const { canQuery, isLoading: isLoadingQuery } = useQueryPermission();
  const [{ query: qp }] = useQueryParams<{ table?: string; structure?: string }>();

  const [sql, setSqlState] = useState<string>(() => {
    if (qp.table) return `SELECT * FROM ${qp.table}`;
    return '';
  });
  const sqlRef = useRef(sql);
  const editorRef = useRef<SqlEditorHandle>(null);

  const [connection] = useState('default');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ResultState>(null);

  const api = useDbViewApi();

  // Handle ?structure= URL param from the Database Browser
  useEffect(() => {
    if (qp.structure) {
      handleShowStructure(qp.structure);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qp.structure]);

  const handleSqlChange = (newSql: string) => {
    setSqlState(newSql);
    sqlRef.current = newSql;
  };

  const handleRun = async (runSql: string, limit: number) => {
    if (!runSql.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const { data } = await api.executeQuery(runSql, limit, connection);
      if (data.error) {
        setResult({ kind: 'error', message: data.error });
      } else if (data.data) {
        setResult({ kind: 'data', ...data.data });
      }
    } catch (err: unknown) {
      setResult({ kind: 'error', message: getRequestErrorMessage(err) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExplain = async (runSql: string) => {
    if (!runSql.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const { data } = await api.explainQuery(runSql, 'explain', connection);
      if (data.error) {
        setResult({ kind: 'error', message: data.error });
      } else {
        setResult({
          kind: 'explain',
          type: 'explain',
          columns: data.columns ?? [],
          rows: (data.rows ?? []) as Record<string, unknown>[],
          durationMs: data.durationMs ?? 0,
        });
      }
    } catch (err: unknown) {
      setResult({ kind: 'error', message: getRequestErrorMessage(err) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExplainAnalyze = async (runSql: string) => {
    if (!runSql.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const { data } = await api.explainQuery(runSql, 'explain-analyze', connection);
      if (data.error) {
        setResult({ kind: 'error', message: data.error });
      } else {
        setResult({
          kind: 'explain',
          type: 'explain-analyze',
          columns: data.columns ?? [],
          rows: (data.rows ?? []) as Record<string, unknown>[],
          durationMs: data.durationMs ?? 0,
        });
      }
    } catch (err: unknown) {
      setResult({ kind: 'error', message: getRequestErrorMessage(err) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowStructure = async (tableName: string) => {
    setIsLoading(true);
    setResult(null);
    try {
      const { data } = await api.getStructure(tableName);
      const structure = data.structure as { table: string; columns: unknown[]; indexes: unknown[] };
      setResult({ kind: 'structure', ...structure });
    } catch {
      setResult({ kind: 'error', message: 'Could not load table structure.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsertTable = (tableName: string) => {
    // Empty editor → seed a full SELECT; otherwise insert the name at the caret.
    if (!sqlRef.current.trim()) {
      handleSqlChange(`SELECT * FROM ${tableName}`);
      return;
    }
    editorRef.current?.insertAtCursor(tableName);
  };

  const handleLoadQuery = (loadedSql: string, _conn: string) => {
    handleSqlChange(loadedSql);
  };

  if (isLoadingBrowse || isLoadingQuery) return <Page.Loading />;
  if (!canBrowse && !canQuery) return <Page.NoPermissions />;

  return (
    <Layouts.Root>
      <Layouts.Header title="Query Runner" subtitle="Execute read-only SELECT queries" />

      <Layouts.Content>
        <Flex gap={6} alignItems="flex-start">
          {/* Left sidebar: table list */}
          <QueryRunnerSidebar
            onInsertTable={handleInsertTable}
            onShowStructure={handleShowStructure}
          />

          {/* Main editor + results */}
          <Box style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <SqlEditor
              ref={editorRef}
              sql={sql}
              onChange={handleSqlChange}
              onRun={handleRun}
              onExplain={handleExplain}
              onExplainAnalyze={handleExplainAnalyze}
              isLoading={isLoading}
            />

            {/* Results area */}
            {result?.kind === 'error' && (
              <Box
                background="danger100"
                padding={4}
                borderRadius="4px"
                marginTop={4}
                borderColor="danger600"
                borderStyle="solid"
                borderWidth="1px"
              >
                <Typography variant="omega" textColor="danger600" style={{ fontFamily: 'monospace' }}>
                  {result.message}
                </Typography>
              </Box>
            )}

            {result?.kind === 'data' && (
              <ResultsPanel
                columns={result.columns}
                rows={result.rows}
                rowCount={result.rowCount}
                durationMs={result.durationMs}
                truncated={result.truncated}
              />
            )}

            {result?.kind === 'explain' && (
              <ExplainPlan
                type={result.type}
                columns={result.columns}
                rows={result.rows}
                durationMs={result.durationMs}
              />
            )}

            {result?.kind === 'structure' && (
              <StructureView
                structure={{
                  table: result.table,
                  columns: result.columns as Parameters<typeof StructureView>[0]['structure']['columns'],
                  indexes: result.indexes as Parameters<typeof StructureView>[0]['structure']['indexes'],
                }}
              />
            )}
          </Box>

          {/* Right panel: saved queries */}
          <Box style={{ width: 240, flexShrink: 0 }}>
            <SavedQueriesPanel
              currentSql={sql}
              currentConnection={connection}
              onLoad={handleLoadQuery}
            />
          </Box>
        </Flex>
      </Layouts.Content>
    </Layouts.Root>
  );
};
