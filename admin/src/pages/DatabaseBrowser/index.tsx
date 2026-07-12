import { useState, useEffect } from 'react';
import { Page, Layouts, useQueryParams } from '@strapi/strapi/admin';
import { Flex, Button, Typography } from '@strapi/design-system';
import { Command, GridFour } from '@strapi/icons';
import { useBrowsePermission } from '../../hooks/usePermissions';
import { PLUGIN_ID } from '../../pluginId';
import { TableSidebar } from './TableSidebar';
import { DataGrid } from './DataGrid';

export const DatabaseBrowser = () => {
  const { canBrowse, isLoading: isLoadingPerms } = useBrowsePermission();
  const [{ query }, setQuery] = useQueryParams<{ table?: string }>();
  const selectedTable = query.table;

  const handleSelectTable = (tableName: string) => {
    setQuery({ table: tableName }, 'push', true);
  };

  if (isLoadingPerms) return <Page.Loading />;
  if (!canBrowse) return <Page.NoPermissions />;

  return (
    <Layouts.Root>
      <Layouts.Header
        title="Database Browser"
        subtitle="Browse all database tables"
        primaryAction={
          selectedTable ? (
            <Flex gap={2}>
              <Button
                tag="a"
                href={`/admin/plugins/${PLUGIN_ID}/query?table=${encodeURIComponent(selectedTable)}`}
                startIcon={<Command />}
                variant="secondary"
                size="S"
              >
                Query
              </Button>
              <Button
                tag="a"
                href={`/admin/plugins/${PLUGIN_ID}/query?structure=${encodeURIComponent(selectedTable)}`}
                startIcon={<GridFour />}
                variant="secondary"
                size="S"
              >
                Structure
              </Button>
            </Flex>
          ) : null
        }
      />

      <Layouts.Content>
        <Flex gap={6} alignItems="flex-start">
          <TableSidebar selectedTable={selectedTable} onSelect={handleSelectTable} />

          <Flex flex={1} minWidth={0} direction="column">
            {selectedTable ? (
              <DataGrid tableName={selectedTable} />
            ) : (
              <Flex
                height="400px"
                alignItems="center"
                justifyContent="center"
                direction="column"
                gap={2}
              >
                <Typography variant="beta" textColor="neutral400">No table selected</Typography>
                <Typography variant="omega" textColor="neutral400">
                  Pick a table from the left sidebar to browse its data.
                </Typography>
              </Flex>
            )}
          </Flex>
        </Flex>
      </Layouts.Content>
    </Layouts.Root>
  );
};
