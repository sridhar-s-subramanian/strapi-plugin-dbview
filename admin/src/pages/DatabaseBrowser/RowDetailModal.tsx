import { Modal, Typography, Box, Flex, Badge } from '@strapi/design-system';

interface Props {
  row: Record<string, unknown> | null;
  onClose: () => void;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export const RowDetailModal = ({ row, onClose }: Props) => {
  if (!row) return null;

  return (
    <Modal.Root open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Modal.Content>
        <Modal.Header>
          <Typography variant="beta" tag="h2">Row Detail</Typography>
        </Modal.Header>
        <Modal.Body>
          <Box style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {Object.entries(row).map(([key, value]) => (
              <Box key={key} marginBottom={3}>
                <Flex alignItems="center" gap={2} marginBottom={1}>
                  <Typography variant="sigma" textColor="neutral600" style={{ fontFamily: 'monospace' }}>
                    {key}
                  </Typography>
                  {value === '[REDACTED]' && (
                    <Badge active backgroundColor="warning100" textColor="warning600">redacted</Badge>
                  )}
                  {(value === null || value === undefined) && (
                    <Badge backgroundColor="neutral100" textColor="neutral500">NULL</Badge>
                  )}
                </Flex>
                <Box
                  background="neutral100"
                  padding={2}
                  borderRadius="4px"
                  style={{ overflow: 'auto', maxHeight: 200 }}
                >
                  <Typography
                    variant="omega"
                    style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}
                  >
                    {formatValue(value)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
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
