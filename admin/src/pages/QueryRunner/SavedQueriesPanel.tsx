import { useState, useEffect, useCallback, memo } from 'react';
import { Box, Typography, Flex, IconButton, Tooltip, Modal, Button, TextInput, Field } from '@strapi/design-system';
import { Trash, Plus } from '@strapi/icons';
import { useDbViewApi } from '../../hooks/useDbViewApi';
import { useNotification } from '@strapi/strapi/admin';

interface SavedQuery {
  id: number;
  name: string;
  sql: string;
  connection: string;
}

interface Props {
  /** Read the current editor SQL lazily, so this panel doesn't re-render on every keystroke. */
  getCurrentSql: () => string;
  currentConnection: string;
  onLoad: (sql: string, connection: string) => void;
}

export const SavedQueriesPanel = memo(function SavedQueriesPanel({ getCurrentSql, currentConnection, onLoad }: Props) {
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const api = useDbViewApi();
  const { toggleNotification } = useNotification();

  const load = useCallback(() => {
    api.listSavedQueries().then(({ data }) => setQueries(data.queries)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const currentSql = getCurrentSql();
    if (!saveName.trim() || !currentSql.trim()) return;
    try {
      await api.createSavedQuery(saveName.trim(), currentSql, currentConnection);
      setSaveOpen(false);
      setSaveName('');
      load();
      toggleNotification({ type: 'success', message: 'Query saved.' });
    } catch {
      toggleNotification({ type: 'danger', message: 'Failed to save query.' });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteSavedQuery(id);
      setQueries((qs) => qs.filter((q) => q.id !== id));
    } catch {
      toggleNotification({ type: 'danger', message: 'Failed to delete query.' });
    }
  };

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={2}>
        <Typography variant="sigma" textColor="neutral600">Saved Queries</Typography>
        <Tooltip description="Save current query">
          <IconButton label="Save current query" size="S" onClick={() => setSaveOpen(true)}><Plus /></IconButton>
        </Tooltip>
      </Flex>

      {queries.length === 0 ? (
        <Typography variant="omega" textColor="neutral500">No saved queries.</Typography>
      ) : (
        <Box style={{ maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden' }}>
        {queries.map((q) => (
          <Box
            key={q.id}
            padding={2}
            marginTop={1}
            background="neutral100"
            borderRadius="4px"
          >
            <Flex justifyContent="space-between" alignItems="flex-start">
              <Box
                style={{ cursor: 'pointer', flexGrow: 1, minWidth: 0 }}
                onClick={() => onLoad(q.sql, q.connection)}
              >
                <Typography variant="omega" fontWeight="bold" ellipsis>{q.name}</Typography>
                <Typography
                  variant="pi"
                  textColor="neutral500"
                  style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                >
                  {q.sql.slice(0, 60)}{q.sql.length > 60 ? '…' : ''}
                </Typography>
              </Box>
              <IconButton
                label="Delete"
                size="S"
                onClick={() => handleDelete(q.id)}
              ><Trash /></IconButton>
            </Flex>
          </Box>
        ))}
        </Box>
      )}

      {saveOpen && (
        <Modal.Root open onOpenChange={(open) => { if (!open) setSaveOpen(false); }}>
          <Modal.Content>
            <Modal.Header>
              <Typography variant="beta" tag="h2">Save Query</Typography>
            </Modal.Header>
            <Modal.Body>
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <TextInput
                  placeholder="My query"
                  value={saveName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSaveName(e.target.value)}
                />
              </Field.Root>
            </Modal.Body>
            <Modal.Footer>
              <Flex gap={2} justifyContent="flex-end">
                <Button variant="tertiary" onClick={() => setSaveOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={!saveName.trim()}>Save</Button>
              </Flex>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      )}
    </Box>
  );
});
