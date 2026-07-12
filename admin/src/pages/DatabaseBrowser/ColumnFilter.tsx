import { useState } from 'react';
import { Box, Flex, SingleSelect, SingleSelectOption, TextInput, Button } from '@strapi/design-system';

type FilterType = 'text' | 'number' | 'date' | 'boolean' | 'other';

interface FilterState {
  op: string;
  value: string;
}

interface Props {
  column: string;
  type: FilterType;
  onApply: (column: string, op: string, value: unknown) => void;
  onClear: (column: string) => void;
}

const TEXT_OPS = [
  { value: 'contains', label: 'Contains' },
  { value: 'eq', label: 'Equals' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'is_null', label: 'Is null' },
  { value: 'is_not_null', label: 'Is not null' },
];

const NUMBER_OPS = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'is_null', label: 'Is null' },
  { value: 'is_not_null', label: 'Is not null' },
];

const DATE_OPS = NUMBER_OPS;

const BOOL_OPS = [
  { value: 'eq', label: 'Is true' },
  { value: 'neq', label: 'Is false' },
  { value: 'is_null', label: 'Is null' },
];

function getOps(type: FilterType) {
  if (type === 'number') return NUMBER_OPS;
  if (type === 'date') return DATE_OPS;
  if (type === 'boolean') return BOOL_OPS;
  return TEXT_OPS;
}

const NO_VALUE_OPS = new Set(['is_null', 'is_not_null']);

export const ColumnFilter = ({ column, type, onApply, onClear }: Props) => {
  const ops = getOps(type);
  const [state, setState] = useState<FilterState>({ op: ops[0].value, value: '' });

  const needsValue = !NO_VALUE_OPS.has(state.op);
  const boolValue = type === 'boolean' ? state.op === 'eq' : undefined;

  const handleApply = () => {
    let v: unknown = state.value;
    if (type === 'number') v = Number(state.value);
    if (type === 'boolean') v = boolValue;
    if (NO_VALUE_OPS.has(state.op)) v = null;
    onApply(column, state.op, v);
  };

  return (
    <Box padding={2} background="neutral0" shadow="filterShadow" borderRadius="4px" style={{ minWidth: 200 }}>
      <Flex direction="column" gap={2}>
        <SingleSelect
          size="S"
          value={state.op}
          onChange={(val) => setState((s) => ({ ...s, op: String(val) }))}
          aria-label="Filter operator"
        >
          {ops.map((o) => (
            <SingleSelectOption key={o.value} value={o.value}>{o.label}</SingleSelectOption>
          ))}
        </SingleSelect>

        {needsValue && type !== 'boolean' && (
          <TextInput
            size="S"
            placeholder="Value"
            value={state.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setState((s) => ({ ...s, value: e.target.value }))}
            aria-label="Filter value"
          />
        )}

        <Flex gap={2}>
          <Button size="S" onClick={handleApply} variant="default">Apply</Button>
          <Button size="S" onClick={() => { setState({ op: ops[0].value, value: '' }); onClear(column); }} variant="tertiary">
            Clear
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};
