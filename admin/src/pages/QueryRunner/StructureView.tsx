import { Box, Typography, Badge, Flex } from '@strapi/design-system';
import { useDbViewTheme } from '../../hooks/useDbViewTheme';

interface ColumnInfo {
  name: string;
  dataType: string;
  normalizedType: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isSensitive: boolean;
}

interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

interface Props {
  structure: {
    table: string;
    columns: ColumnInfo[];
    indexes: IndexInfo[];
  };
}

export const StructureView = ({ structure }: Props) => {
  const { colors } = useDbViewTheme();

  return (
    <Box marginTop={4}>
      <Typography variant="beta" style={{ fontFamily: 'monospace' }} marginBottom={4}>
        {structure.table}
      </Typography>

      {/* Columns */}
      <Box marginBottom={6}>
        <Typography variant="sigma" textColor="neutral600" marginBottom={2}>COLUMNS</Typography>
        <Box style={{ border: `1px solid ${colors.neutral200}`, borderRadius: 4, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: colors.neutral100 }}>
                {['Name', 'Type', 'Nullable', 'Default', 'Keys'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.neutral200}`, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {structure.columns.map((col) => (
                <tr key={col.name}>
                  <td style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.neutral150}`, fontFamily: 'monospace', fontWeight: col.isPrimaryKey ? 700 : undefined }}>
                    {col.name}
                    {col.isSensitive && <span style={{ marginLeft: 4, fontSize: 10, color: colors.danger600 }}>🔒</span>}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.neutral150}`, fontFamily: 'monospace', color: colors.neutral600 }}>
                    {col.dataType}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.neutral150}`, color: col.isNullable ? colors.neutral500 : colors.neutral800 }}>
                    {col.isNullable ? 'YES' : 'NO'}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.neutral150}`, fontFamily: 'monospace', color: colors.neutral600 }}>
                    {col.defaultValue ?? <span style={{ color: colors.neutral500, fontStyle: 'italic' }}>NULL</span>}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.neutral150}` }}>
                    <Flex gap={1} wrap="wrap">
                      {col.isPrimaryKey && <Badge backgroundColor="primary100" textColor="primary600">PK</Badge>}
                    </Flex>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Box>

      {/* Indexes */}
      {structure.indexes.length > 0 && (
        <Box>
          <Typography variant="sigma" textColor="neutral600" marginBottom={2}>INDEXES</Typography>
          <Box style={{ border: `1px solid ${colors.neutral200}`, borderRadius: 4, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: colors.neutral100 }}>
                  {['Name', 'Columns', 'Type'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.neutral200}`, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {structure.indexes.map((idx) => (
                  <tr key={idx.name}>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.neutral150}`, fontFamily: 'monospace' }}>{idx.name}</td>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.neutral150}`, fontFamily: 'monospace' }}>{idx.columns.join(', ')}</td>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${colors.neutral150}` }}>
                      <Flex gap={1}>
                        {idx.isPrimary && <Badge backgroundColor="primary100" textColor="primary600">PRIMARY</Badge>}
                        {idx.isUnique && !idx.isPrimary && <Badge backgroundColor="success100" textColor="success600">UNIQUE</Badge>}
                        {!idx.isPrimary && !idx.isUnique && <Badge backgroundColor="neutral100" textColor="neutral600">INDEX</Badge>}
                      </Flex>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </Box>
      )}
    </Box>
  );
};
