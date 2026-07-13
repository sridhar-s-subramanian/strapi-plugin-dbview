import { Box, Typography } from '@strapi/design-system';
import { useDbViewTheme } from '../../hooks/useDbViewTheme';

interface Props {
  type: 'explain' | 'explain-analyze';
  columns: string[];
  rows: Record<string, unknown>[];
  durationMs: number;
}

export const ExplainPlan = ({ type, columns, rows, durationMs }: Props) => {
  const isSingleCol = columns.length === 1;
  const singleKey = columns[0];
  const { colors } = useDbViewTheme();

  return (
    <Box marginTop={4}>
      <Typography variant="omega" textColor="neutral600" marginBottom={2}>
        {type === 'explain-analyze' ? 'EXPLAIN ANALYZE' : 'EXPLAIN'} · {durationMs.toFixed(0)} ms
      </Typography>

      <Box
        background="neutral100"
        borderRadius="4px"
        padding={4}
        style={{ border: `1px solid ${colors.neutral200}`, maxWidth: '100%', overflowX: 'auto' }}
      >
        {isSingleCol ? (
          // PostgreSQL / MySQL text plan — single column, preformatted
          <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre', lineHeight: 1.6 }}>
            {rows.map((r) => String(r[singleKey] ?? '')).join('\n')}
          </pre>
        ) : (
          // MySQL tabular EXPLAIN — multi-column grid
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: `2px solid ${colors.neutral200}`, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((col) => {
                    const v = row[col];
                    const isNull = v === null || v === undefined;
                    return (
                      <td key={col} style={{ padding: '4px 8px', borderBottom: `1px solid ${colors.neutral150}`, fontFamily: 'monospace', color: isNull ? colors.neutral500 : undefined }}>
                        {isNull ? 'NULL' : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
    </Box>
  );
};
