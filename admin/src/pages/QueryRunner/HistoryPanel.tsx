import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Flex } from '@strapi/design-system';
import { useDbViewApi } from '../../hooks/useDbViewApi';

interface HistoryEntry {
  id: number;
  sql: string;
  connection: string;
  rowCount: number | null;
  durationMs: number | null;
  createdAt: string;
}

interface Props {
  onLoad: (sql: string, connection: string) => void;
}

export const HistoryPanel = ({ onLoad }: Props) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const api = useDbViewApi();

  const load = useCallback(() => {
    api.listHistory().then(({ data }) => setEntries(data.entries)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return iso;
    }
  };

  return (
    <Box>
      <Typography variant="sigma" textColor="neutral600" marginBottom={2}>Recent History</Typography>

      {entries.length === 0 ? (
        <Typography variant="omega" textColor="neutral500">No history yet.</Typography>
      ) : (
        entries.map((entry) => (
          <Box
            key={entry.id}
            padding={2}
            marginTop={1}
            background="neutral100"
            borderRadius="4px"
            style={{ cursor: 'pointer' }}
            onClick={() => onLoad(entry.sql, entry.connection)}
            onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => ((e.currentTarget as HTMLDivElement).style.background = '#f0f0ff')}
            onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => ((e.currentTarget as HTMLDivElement).style.background = '')}
          >
            <Typography
              variant="pi"
              style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
            >
              {entry.sql.slice(0, 70)}{entry.sql.length > 70 ? '…' : ''}
            </Typography>
            <Flex gap={2} marginTop={1}>
              <Typography variant="pi" textColor="neutral500">{formatTime(entry.createdAt)}</Typography>
              {entry.rowCount !== null && (
                <Typography variant="pi" textColor="neutral500">{entry.rowCount} rows</Typography>
              )}
              {entry.durationMs !== null && (
                <Typography variant="pi" textColor="neutral500">{entry.durationMs} ms</Typography>
              )}
            </Flex>
          </Box>
        ))
      )}
    </Box>
  );
};
