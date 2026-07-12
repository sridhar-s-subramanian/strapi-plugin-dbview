import { Box, Flex, Typography } from '@strapi/design-system';
import { RowDetailModal } from '../DatabaseBrowser/RowDetailModal';
import { useState } from 'react';

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
}

const REDACTED_MASK = '[REDACTED]';

export const ResultsPanel = ({ columns, rows, rowCount, durationMs, truncated }: Props) => {
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null);

  if (columns.length === 0) return null;

  const exportCSV = () => {
    const header = columns.join(',');
    const body = rows.map((r) => columns.map((c) => JSON.stringify(r[c] ?? '')).join(',')).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'query-result.csv'; a.click();
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'query-result.json'; a.click();
  };

  return (
    <Box marginTop={4}>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={2}>
        <Flex gap={3} alignItems="center">
          <Typography variant="omega" textColor="neutral600">
            {rowCount.toLocaleString()} row{rowCount !== 1 ? 's' : ''} · {durationMs.toFixed(0)} ms
          </Typography>
          {truncated && (
            <Typography variant="omega" textColor="warning600">
              ⚠ Results truncated at row limit
            </Typography>
          )}
        </Flex>
        <Flex gap={2}>
          <button type="button" onClick={exportCSV} style={{ fontSize: 12, color: '#4945ff', background: 'none', border: 'none', cursor: 'pointer' }}>CSV</button>
          <button type="button" onClick={exportJSON} style={{ fontSize: 12, color: '#4945ff', background: 'none', border: 'none', cursor: 'pointer' }}>JSON</button>
        </Flex>
      </Flex>

      <Box style={{ overflowX: 'auto', border: '1px solid #dcdce4', borderRadius: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    textAlign: 'left',
                    padding: '6px 10px',
                    background: '#f6f6f9',
                    borderBottom: '2px solid #dcdce4',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ textAlign: 'center', padding: '24px', color: '#8e8ea9' }}
                >
                  No results.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDetailRow(row)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f6f6f9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                >
                  {columns.map((col) => {
                    const value = row[col];
                    const isNull = value === null || value === undefined;
                    const isRedacted = value === REDACTED_MASK;
                    const display = isNull ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value);
                    return (
                      <td
                        key={col}
                        style={{
                          padding: '5px 10px',
                          borderBottom: '1px solid #eaeaef',
                          fontFamily: 'monospace',
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: isNull || isRedacted ? '#8e8ea9' : undefined,
                          fontStyle: isNull ? 'italic' : undefined,
                        }}
                        title={display}
                      >
                        {display.length > 80 ? `${display.slice(0, 80)}…` : display}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Box>

      {detailRow && (
        <RowDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </Box>
  );
};
