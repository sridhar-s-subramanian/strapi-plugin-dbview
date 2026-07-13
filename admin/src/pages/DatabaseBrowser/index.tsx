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
          <Flex gap={2}>
            <Button
              tag="a"
              href={
                selectedTable
                  ? `/admin/plugins/${PLUGIN_ID}/query?table=${encodeURIComponent(selectedTable)}`
                  : `/admin/plugins/${PLUGIN_ID}/query`
              }
              startIcon={<Command />}
              variant="secondary"
              size="S"
            >
              Query
            </Button>
            {selectedTable ? (
              <Button
                tag="a"
                href={`/admin/plugins/${PLUGIN_ID}/query?structure=${encodeURIComponent(selectedTable)}`}
                startIcon={<GridFour />}
                variant="secondary"
                size="S"
              >
                Structure
              </Button>
            ) : (
              <Button startIcon={<GridFour />} variant="secondary" size="S" disabled>
                Structure
              </Button>
            )}
          </Flex>
        }
      />

      <Layouts.Content>
        <Flex gap={6} alignItems="flex-start">
          <TableSidebar selectedTable={selectedTable} onSelect={handleSelectTable} />

          <Flex direction="column" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
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
