import { useState, useEffect } from 'react';
import { Box, Searchbar, Typography, Flex, Loader, IconButton, Tooltip } from '@strapi/design-system';
import { GridFour, ExternalLink } from '@strapi/icons';
import { useNavigate } from 'react-router-dom';
import { useDbViewApi } from '../../hooks/useDbViewApi';
import { PLUGIN_ID } from '../../pluginId';

interface Props {
  onInsertTable: (tableName: string) => void;
  onShowStructure: (tableName: string) => void;
}

export const QueryRunnerSidebar = ({ onInsertTable, onShowStructure }: Props) => {
  const [tables, setTables] = useState<Array<{ name: string }>>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const api = useDbViewApi();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .listTables()
      .then(({ data }) => setTables(data.tables))
      .catch(() => {})
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box
      background="neutral0"
      borderRadius="4px"
      shadow="filterShadow"
      padding={4}
      style={{ width: 220, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 0 }}
    >
      <Typography variant="sigma" textColor="neutral600" marginBottom={3}>Tables</Typography>

      <Searchbar
        name="tableSearch"
        placeholder="Search…"
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
        clearLabel="Clear search"
        size="S"
      >
        Search
      </Searchbar>

      <Box marginTop={2} style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        {isLoading ? (
          <Flex justifyContent="center" paddingTop={4}><Loader small /></Flex>
        ) : filtered.length === 0 ? (
          <Typography variant="omega" textColor="neutral500">No tables.</Typography>
        ) : (
          filtered.map((table) => (
            <Box
              key={table.name}
              padding={1}
              marginTop={1}
              style={{ cursor: 'pointer' }}
            >
              <Flex alignItems="center" justifyContent="space-between" gap={1}>
                <Typography
                  variant="omega"
                  textColor="primary600"
                  style={{ fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', flexGrow: 1 }}
                  onClick={() => onInsertTable(table.name)}
                  title="Click to insert table name"
                >
                  {table.name}
                </Typography>
                <Flex gap={0}>
                  <Tooltip description="Show structure">
                    <IconButton
                      label="Structure"
                      size="S"
                      onClick={() => onShowStructure(table.name)}
                    ><GridFour /></IconButton>
                  </Tooltip>
                  <Tooltip description="Browse in DB Browser">
                    <IconButton
                      label="Browse"
                      size="S"
                      onClick={() => navigate(`/plugins/${PLUGIN_ID}?table=${encodeURIComponent(table.name)}`)}
                    ><ExternalLink /></IconButton>
                  </Tooltip>
                </Flex>
              </Flex>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};
