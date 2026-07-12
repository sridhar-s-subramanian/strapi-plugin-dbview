import { Box, Typography, Badge, Flex } from '@strapi/design-system';

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
  return (
    <Box marginTop={4}>
      <Typography variant="beta" style={{ fontFamily: 'monospace' }} marginBottom={4}>
        {structure.table}
      </Typography>

      {/* Columns */}
      <Box marginBottom={6}>
        <Typography variant="sigma" textColor="neutral600" marginBottom={2}>COLUMNS</Typography>
        <Box style={{ border: '1px solid #dcdce4', borderRadius: 4, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f6f6f9' }}>
                {['Name', 'Type', 'Nullable', 'Default', 'Keys'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #dcdce4', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {structure.columns.map((col) => (
                <tr key={col.name}>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eaeaef', fontFamily: 'monospace', fontWeight: col.isPrimaryKey ? 700 : undefined }}>
                    {col.name}
                    {col.isSensitive && <span style={{ marginLeft: 4, fontSize: 10, color: '#d02b20' }}>🔒</span>}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eaeaef', fontFamily: 'monospace', color: '#666' }}>
                    {col.dataType}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eaeaef', color: col.isNullable ? '#8e8ea9' : '#32324d' }}>
                    {col.isNullable ? 'YES' : 'NO'}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eaeaef', fontFamily: 'monospace', color: '#666' }}>
                    {col.defaultValue ?? <span style={{ color: '#8e8ea9', fontStyle: 'italic' }}>NULL</span>}
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eaeaef' }}>
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
          <Box style={{ border: '1px solid #dcdce4', borderRadius: 4, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f6f6f9' }}>
                  {['Name', 'Columns', 'Type'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #dcdce4', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {structure.indexes.map((idx) => (
                  <tr key={idx.name}>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eaeaef', fontFamily: 'monospace' }}>{idx.name}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eaeaef', fontFamily: 'monospace' }}>{idx.columns.join(', ')}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eaeaef' }}>
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
