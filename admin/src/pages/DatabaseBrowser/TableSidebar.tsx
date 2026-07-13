import { useState, useEffect } from 'react';
import { Box, Searchbar, Typography, Flex, Loader } from '@strapi/design-system';
import { useDbViewApi } from '../../hooks/useDbViewApi';

interface Props {
  selectedTable: string | undefined;
  onSelect: (tableName: string) => void;
}

export const TableSidebar = ({ selectedTable, onSelect }: Props) => {
  const [tables, setTables] = useState<Array<{ name: string }>>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const api = useDbViewApi();

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
      style={{ width: 240, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 0 }}
    >
      <Searchbar
        name="tableSearch"
        placeholder="Search tables…"
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
        clearLabel="Clear search"
        size="S"
      >
        Search
      </Searchbar>

      <Box marginTop={2} style={{ maxHeight: '75vh', overflowY: 'auto', overflowX: 'hidden' }}>
        {isLoading ? (
          <Flex justifyContent="center" paddingTop={4}>
            <Loader small />
          </Flex>
        ) : filtered.length === 0 ? (
          <Box paddingTop={2}>
            <Typography variant="omega" textColor="neutral500">
              No tables found.
            </Typography>
          </Box>
        ) : (
          filtered.map((table) => {
            const isSelected = selectedTable === table.name;
            return (
              <Box
                key={table.name}
                paddingTop={2}
                paddingBottom={2}
                paddingLeft={3}
                paddingRight={3}
                marginTop={1}
                background={isSelected ? 'primary100' : undefined}
                borderRadius="4px"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(table.name)}
              >
                <Typography
                  variant="omega"
                  fontWeight={isSelected ? 'bold' : undefined}
                  textColor={isSelected ? 'primary600' : 'neutral700'}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 13,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={table.name}
                >
                  {table.name}
                </Typography>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
};
