import { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'styled-components';
import { Box, Flex, Typography, Pagination, PreviousLink, NextLink, PageLink, Loader, Badge, IconButton, Button, Tooltip, Popover } from '@strapi/design-system';
import { CaretUp, CaretDown, Filter, Link } from '@strapi/icons';
import { useDbViewApi } from '../../hooks/useDbViewApi';
import { RowDetailModal } from './RowDetailModal';
import { FKPreviewModal } from './FKPreviewModal';
import { ColumnFilter } from './ColumnFilter';

interface ColumnInfo {
  name: string;
  normalizedType: 'text' | 'number' | 'date' | 'boolean' | 'json' | 'other';
  isSensitive: boolean;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
}

interface Sort {
  column: string;
  direction: 'asc' | 'desc';
}

interface FilterMap {
  [column: string]: { op: string; value: unknown };
}

interface FKPreview {
  foreignTable: string;
  foreignColumn: string;
  value: unknown;
}

interface Props {
  tableName: string;
}

const REDACTED_MASK = '[REDACTED]';
const PAGE_SIZES = [25, 50, 100];

export const DataGrid = ({ tableName }: Props) => {
  const api = useDbViewApi();
  const { colors } = useTheme();

  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [sort, setSort] = useState<Sort | undefined>();
  const [filters, setFilters] = useState<FilterMap>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null);
  const [fkPreview, setFkPreview] = useState<FKPreview | null>(null);
  const [durationMs, setDurationMs] = useState<number>(0);

  // Fetch structure when table changes
  useEffect(() => {
    setPage(1);
    setSort(undefined);
    setFilters({});
    setColumns([]);
    setRows([]);
    setError(null);

    api.getStructure(tableName).then(({ data }) => {
      const structure = data.structure as { columns: ColumnInfo[] };
      setColumns(structure.columns ?? []);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(pageSize),
      };
      if (sort) {
        params.sortColumn = sort.column;
        params.sortDirection = sort.direction;
      }
      if (Object.keys(filters).length > 0) {
        params.filters = JSON.stringify(filters);
      }

      const { data } = await api.browseTable(tableName, params);
      setRows(data.data.rows);
      setTotal(data.total);
      setPageCount(data.pageCount);
      setDurationMs(data.data.durationMs);
    } catch {
      setError('Failed to load table data.');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, page, pageSize, sort, filters]);

  useEffect(() => {
    if (tableName) fetchData();
  }, [fetchData, tableName]);

  const handleSort = (col: string) => {
    if (sort?.column === col) {
      setSort({ column: col, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ column: col, direction: 'asc' });
    }
    setPage(1);
  };

  const handleApplyFilter = (col: string, op: string, value: unknown) => {
    setFilters((f) => ({ ...f, [col]: { op, value } }));
    setOpenFilter(null);
    setPage(1);
  };

  const handleClearFilter = (col: string) => {
    setFilters((f) => {
      const next = { ...f };
      delete next[col];
      return next;
    });
    setOpenFilter(null);
    setPage(1);
  };

  const columnInfoMap = new Map(columns.map((c) => [c.name, c]));
  const displayColumns = rows.length > 0
    ? Object.keys(rows[0])
    : columns.map((c) => c.name);

  const exportCSV = () => {
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const header = cols.join(',');
    const body = rows.map((r) =>
      cols.map((c) => JSON.stringify(r[c] ?? '')).join(',')
    ).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tableName}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (rows.length === 0) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tableName}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box style={{ width: '100%', minWidth: 0 }}>
      {/* Header */}
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        <Flex direction="column" gap={1}>
          <Typography variant="beta" style={{ fontFamily: 'monospace' }}>{tableName}</Typography>
          <Typography variant="omega" textColor="neutral500">
            {total.toLocaleString()} row{total !== 1 ? 's' : ''} · {durationMs.toFixed(0)} ms
          </Typography>
        </Flex>
        <Flex gap={2}>
          {Object.keys(filters).length > 0 && (
            <Button size="S" variant="tertiary" onClick={() => { setFilters({}); setPage(1); }}>
              Clear filters ({Object.keys(filters).length})
            </Button>
          )}
          <Button size="S" variant="tertiary" onClick={exportCSV}>CSV</Button>
          <Button size="S" variant="tertiary" onClick={exportJSON}>JSON</Button>
        </Flex>
      </Flex>

      {error && (
        <Box background="danger100" padding={3} borderRadius="4px" marginBottom={4}>
          <Typography textColor="danger600">{error}</Typography>
        </Box>
      )}

      {isLoading ? (
        <Flex justifyContent="center" paddingTop={8}>
          <Loader />
        </Flex>
      ) : (
        <Box
          background="neutral0"
          borderRadius="4px"
          shadow="filterShadow"
          style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto' }}
        >
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
            <thead>
              <tr>
                {displayColumns.map((col) => {
                  const info = columnInfoMap.get(col);
                  const isFiltered = !!filters[col];
                  return (
                    <th
                      key={col}
                      style={{
                        textAlign: 'left',
                        padding: '8px',
                        background: colors.neutral100,
                        borderBottom: `2px solid ${colors.neutral200}`,
                        whiteSpace: 'nowrap',
                        position: 'relative',
                      }}
                    >
                      <Flex alignItems="center" justifyContent="space-between" gap={1} style={{ width: '100%' }}>
                        {info?.isSensitive ? (
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{col}</span>
                        ) : (
                          <Flex
                            alignItems="center"
                            gap={1}
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleSort(col)}
                            title="Click to sort"
                          >
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{col}</span>
                            {/* Always-visible sort affordance; the active direction is highlighted. */}
                            <Flex direction="column" style={{ lineHeight: 0 }}>
                              <span style={{ display: 'flex', marginBottom: -4, color: sort?.column === col && sort.direction === 'asc' ? colors.primary600 : colors.neutral500 }}>
                                <CaretUp width={11} height={11} />
                              </span>
                              <span style={{ display: 'flex', color: sort?.column === col && sort.direction === 'desc' ? colors.primary600 : colors.neutral500 }}>
                                <CaretDown width={11} height={11} />
                              </span>
                            </Flex>
                          </Flex>
                        )}
                        <Flex alignItems="center" gap={1}>
                          {info && !info.isSensitive && (
                            <Popover.Root
                              open={openFilter === col}
                              onOpenChange={(open) => setOpenFilter(open ? col : null)}
                            >
                              <Popover.Trigger>
                                <IconButton
                                  size="S"
                                  variant={isFiltered ? 'default' : 'ghost'}
                                  label={isFiltered ? `Edit filter on ${col}` : `Filter ${col}`}
                                ><Filter /></IconButton>
                              </Popover.Trigger>
                              <Popover.Content>
                                <ColumnFilter
                                  column={col}
                                  type={info.normalizedType as 'text'}
                                  current={filters[col]}
                                  onApply={handleApplyFilter}
                                  onClear={handleClearFilter}
                                />
                              </Popover.Content>
                            </Popover.Root>
                          )}
                          {info?.foreignKeyTable && (
                            <Tooltip description={`→ ${info.foreignKeyTable}`}>
                              <span style={{ fontSize: 11, color: colors.primary600, cursor: 'default' }}>FK</span>
                            </Tooltip>
                          )}
                        </Flex>
                      </Flex>
                    </th>
                  );
                })}
                <th style={{ background: colors.neutral100, borderBottom: `2px solid ${colors.neutral200}`, padding: '8px', width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={displayColumns.length + 1} style={{ textAlign: 'center', padding: '32px', color: colors.neutral500 }}>
                    No rows found.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDetailRow(row)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = colors.neutral100)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    {displayColumns.map((col) => {
                      const info = columnInfoMap.get(col);
                      const value = row[col];
                      const isNull = value === null || value === undefined;
                      const isRedacted = value === REDACTED_MASK;

                      return (
                        <td
                          key={col}
                          style={{
                            padding: '6px 8px',
                            borderBottom: `1px solid ${colors.neutral150}`,
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontFamily: 'monospace',
                            fontSize: 12,
                            color: isNull || isRedacted ? colors.neutral500 : undefined,
                            fontStyle: isNull ? 'italic' : undefined,
                          }}
                        >
                          {isNull ? 'NULL' : isRedacted ? '[REDACTED]' : String(value)}
                          {info?.foreignKeyTable && !isNull && !isRedacted && (
                            <IconButton
                              label={`View in ${info.foreignKeyTable}`}
                              size="S"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                setFkPreview({
                                  foreignTable: info.foreignKeyTable!,
                                  foreignColumn: info.foreignKeyColumn!,
                                  value,
                                });
                              }}
                              style={{ marginLeft: 4, verticalAlign: 'middle' }}
                            ><Link /></IconButton>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: '6px 4px', borderBottom: `1px solid ${colors.neutral150}` }} />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Box>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <Box marginTop={4}>
          <Pagination activePage={page} pageCount={pageCount} label="Table pagination">
            <PreviousLink onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</PreviousLink>
            {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => i + 1).map((n) => (
              <PageLink key={n} number={n} onClick={() => setPage(n)}>
                {n}
              </PageLink>
            ))}
            <NextLink onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</NextLink>
          </Pagination>
        </Box>
      )}

      {/* Modals */}
      {detailRow && (
        <RowDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      )}
      {fkPreview && (
        <FKPreviewModal
          foreignTable={fkPreview.foreignTable}
          foreignColumn={fkPreview.foreignColumn}
          value={fkPreview.value}
          onClose={() => setFkPreview(null)}
        />
      )}
    </Box>
  );
};
