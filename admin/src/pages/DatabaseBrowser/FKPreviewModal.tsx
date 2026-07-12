import { useState, useEffect } from 'react';
import { Modal, Typography, Box, Loader, Flex } from '@strapi/design-system';
import { useDbViewApi } from '../../hooks/useDbViewApi';

interface Props {
  foreignTable: string;
  foreignColumn: string;
  value: unknown;
  onClose: () => void;
}

export const FKPreviewModal = ({ foreignTable, foreignColumn, value, onClose }: Props) => {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const api = useDbViewApi();

  useEffect(() => {
    api
      .relatedRows(foreignTable, foreignColumn, value)
      .then(({ data }) => {
        setRows(data.rows);
        setColumns(data.rows.length > 0 ? Object.keys(data.rows[0]) : []);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foreignTable, foreignColumn, value]);

  return (
    <Modal.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Modal.Content>
        <Modal.Header>
          <Typography variant="beta" tag="h2">
            Related: {foreignTable}
          </Typography>
        </Modal.Header>
        <Modal.Body>
          {isLoading ? (
            <Flex justifyContent="center" padding={4}>
              <Loader />
            </Flex>
          ) : rows.length === 0 ? (
            <Typography variant="omega" textColor="neutral500">No related rows found.</Typography>
          ) : (
            <Box style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col} style={{ textAlign: 'left', padding: '6px 8px', background: '#f6f6f9', borderBottom: '1px solid #dcdce4', fontFamily: 'monospace' }}>
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
                        const isRedacted = v === '[REDACTED]';
                        return (
                          <td key={col} style={{ padding: '6px 8px', borderBottom: '1px solid #eaeaef', fontFamily: 'monospace', color: isNull || isRedacted ? '#8e8ea9' : undefined }}>
                            {isNull ? 'NULL' : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Modal.Close>
            <button type="button" onClick={onClose}>Close</button>
          </Modal.Close>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};
