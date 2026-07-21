import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { FormControlSize, FormControlColor } from '@mocha-ds/react';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDndMonitor } from '@dnd-kit/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReorderableColumn<T> {
  key: string;
  header: React.ReactNode;
  sortable?: boolean;
  editable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (row: T, value: any, rowIndex: number) => React.ReactNode;
}

export interface ReorderableTableProps<T> {
  data: T[];
  columns: ReorderableColumn<T>[];
  rowKey: (row: T) => string | number;

  sortField?: string;
  sortOrder?: 'asc' | 'desc' | '';
  onSort?: (field: string, order: 'asc' | 'desc' | '') => void;

  selectedRowIds?: (string | number)[];
  onSelectionChange?: (selectedIds: (string | number)[]) => void;

  onCellEdit?: (
    rowId: string | number,
    columnKey: string,
    newValue: any,
  ) => void;

  onRowOrderChange?: (newData: T[]) => void;
  onColumnOrderChange?: (newColumns: ReorderableColumn<T>[]) => void;

  columnWidths?: Record<string, number>;
  onColumnResize?: (columnKey: string, width: number) => void;
  minColumnWidth?: number;

  size?: FormControlSize;
  color?: FormControlColor;

  isLoading?: boolean;
  loadingRowsCount?: number;
  emptyState?: React.ReactNode;

  className?: string;
}

interface EditingCell {
  rowId: string | number;
  columnKey: string;
  value: string;
}

// ---------------------------------------------------------------------------
// ID prefix helpers
// ---------------------------------------------------------------------------

const COL_PREFIX = 'ctp-reorderable-col:';
const ROW_PREFIX = 'ctp-reorderable-row:';

function colId(key: string) {
  return `${COL_PREFIX}${key}`;
}
function rowId(key: string | number) {
  return `${ROW_PREFIX}${key}`;
}
function isColId(id: string) {
  return id.startsWith(COL_PREFIX);
}
function isRowId(id: string) {
  return id.startsWith(ROW_PREFIX);
}
function extractKey(id: string) {
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
}

// ---------------------------------------------------------------------------
// Column resize hook
// ---------------------------------------------------------------------------

function useColumnResize(
  onResize?: (key: string, w: number) => void,
  minWidth = 40,
) {
  const resizing = useRef<{
    columnKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, columnKey: string, currentWidth?: number) => {
      e.preventDefault();
      e.stopPropagation();

      const th = (e.target as HTMLElement).closest('th');
      if (!th) return;

      const startWidth = currentWidth || th.offsetWidth;
      resizing.current = { columnKey, startX: e.clientX, startWidth };

      const onMove = (ev: MouseEvent) => {
        if (!resizing.current) return;
        const diff = ev.clientX - resizing.current.startX;
        const newWidth = Math.max(
          minWidth,
          resizing.current.startWidth + diff,
        );
        onResize?.(resizing.current.columnKey, newWidth);
      };

      const onUp = () => {
        resizing.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize, minWidth],
  );

  return { handleMouseDown };
}

// ---------------------------------------------------------------------------
// SortableTh
// ---------------------------------------------------------------------------

interface SortableThProps<T> {
  col: ReorderableColumn<T>;
  sortField?: string;
  sortOrder?: 'asc' | 'desc' | '';
  columnWidth: number | undefined;
  showColDragHandle: boolean;
  onColumnResize: ((key: string, w: number) => void) | undefined;
  onResizeMouseDown: (
    e: React.MouseEvent,
    key: string,
    w?: number,
  ) => void;
  onHeaderClick: (col: ReorderableColumn<T>) => void;
}

function SortableThInner<T>({
  col,
  sortField,
  sortOrder,
  columnWidth,
  showColDragHandle,
  onColumnResize,
  onResizeMouseDown,
  onHeaderClick,
}: SortableThProps<T>) {
  const isSortedThis = sortField === col.key;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: colId(col.key) });

  const safeTransition =
    transition ||
    'background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease';

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: safeTransition,
    opacity: isDragging ? 0.4 : undefined,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 10 : undefined,
    width: columnWidth || undefined,
  };

  const thClasses = [
    'ctp-pro-sortable-trigger',
    'ctp-pro-table-col-trigger',
    isDragging ? 'ctp-pro-table-col-trigger--dragging' : '',
    col.sortable ? 'ctp-table-th--sortable' : '',
    isSortedThis ? 'ctp-table-th--active' : '',
    col.align
      ? `ctp-table-cell--align-${col.align}`
      : 'ctp-table-cell--align-left',
    `ctp-table-th--key-${col.key}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <th
      ref={setNodeRef}
      className={thClasses}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (isDragging) return;
        onHeaderClick(col);
      }}
    >
      <div className="ctp-table-th-content">
        {showColDragHandle && (
          <span className="ctp-pro-table-col-drag-handle" aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="5" r="1.5" />
              <circle cx="15" cy="5" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="19" r="1.5" />
              <circle cx="15" cy="19" r="1.5" />
            </svg>
          </span>
        )}
        <span className="ctp-table-th-label">{col.header}</span>
        {col.sortable && (
          <span
            className={`ctp-table-sort-icon ${isSortedThis ? 'ctp-table-sort-icon--active' : ''}`}
          >
            {isSortedThis && sortOrder === 'asc' && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            )}
            {isSortedThis && sortOrder === 'desc' && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
            {(!isSortedThis || !sortOrder) && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </span>
        )}
      </div>
      {onColumnResize && (
        <div
          className="ctp-pro-table-resize-handle"
          onMouseDown={(e) =>
            onResizeMouseDown(e, col.key, columnWidth)
          }
        />
      )}
    </th>
  );
}

// ---------------------------------------------------------------------------
// SortableTr
// ---------------------------------------------------------------------------

interface SortableTrProps<T> {
  row: T;
  rId: string | number;
  rowIndex: number;
  totalRows: number;
  columns: ReorderableColumn<T>[];
  showRowDragHandle: boolean;
  showCheckbox: boolean;
  isSelected: boolean;
  editingCell: EditingCell | null;
  columnWidths: Record<string, number>;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onSelectRow: (id: string | number, checked: boolean) => void;
  onCellDoubleClick: (
    id: string | number,
    col: ReorderableColumn<T>,
    value: any,
  ) => void;
  onEditingValueChange: (value: string) => void;
  onEditingSave: () => void;
  onEditingKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function SortableTr<T>({
  row,
  rId,
  rowIndex,
  totalRows,
  columns,
  showRowDragHandle,
  showCheckbox,
  isSelected,
  editingCell,
  columnWidths,
  editInputRef,
  onSelectRow,
  onCellDoubleClick,
  onEditingValueChange,
  onEditingSave,
  onEditingKeyDown,
}: SortableTrProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowId(rId) });

  const safeTransition =
    transition || 'background-color 0.2s ease';

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: safeTransition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  const trClasses = [
    'ctp-pro-sortable-trigger',
    'ctp-pro-table-row-trigger',
    isDragging ? 'ctp-pro-table-row-trigger--dragging' : '',
    isSelected ? 'ctp-table-tr--selected' : '',
    rowIndex === 0 ? 'ctp-table-tr--first' : '',
    rowIndex === totalRows - 1 ? 'ctp-table-tr--last' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <tr ref={setNodeRef} className={trClasses} style={style}>
      {showRowDragHandle && (
        <td
          className="ctp-pro-table-row-drag-handle-cell"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className="ctp-pro-table-row-drag-handle"
            aria-label="Arrastar para reordenar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="5" r="1.5" />
              <circle cx="15" cy="5" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="19" r="1.5" />
              <circle cx="15" cy="19" r="1.5" />
            </svg>
          </span>
        </td>
      )}
      {showCheckbox && (
        <td
          style={{ textAlign: 'center' }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="ctp-table-checkbox"
            checked={isSelected}
            onChange={(e) => onSelectRow(rId, e.target.checked)}
            aria-label={`Selecionar linha ${rId}`}
          />
        </td>
      )}
      {columns.map((col) => {
        const rawValue = (row as any)[col.key];
        const isEditingThisCell =
          editingCell &&
          editingCell.rowId === rId &&
          editingCell.columnKey === col.key;

        const cellAlignClass = col.align
          ? `ctp-table-cell--align-${col.align}`
          : 'ctp-table-cell--align-left';

        return (
          <td
            key={col.key}
            className={`${cellAlignClass} ctp-table-cell--key-${col.key}`}
            style={{ width: columnWidths[col.key] || undefined }}
            onDoubleClick={() => onCellDoubleClick(rId, col, rawValue)}
            title={
              col.editable ? 'Clique duas vezes para editar' : undefined
            }
          >
            {isEditingThisCell ? (
              <input
                ref={editInputRef as React.RefObject<HTMLInputElement>}
                type="text"
                className="ctp-table-inline-edit"
                value={editingCell.value}
                onChange={(e) => onEditingValueChange(e.target.value)}
                onBlur={onEditingSave}
                onKeyDown={onEditingKeyDown}
              />
            ) : col.render ? (
              col.render(row, rawValue, rowIndex)
            ) : (
              String(rawValue ?? '')
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// ReorderableTable
// ---------------------------------------------------------------------------

export function ReorderableTable<T>({
  data,
  columns,
  rowKey,
  sortField,
  sortOrder,
  onSort,
  selectedRowIds,
  onSelectionChange,
  onCellEdit,
  onRowOrderChange,
  onColumnOrderChange,
  columnWidths: controlledWidths,
  onColumnResize,
  minColumnWidth = 40,
  size = 'md',
  color = 'mauve',
  isLoading = false,
  loadingRowsCount = 5,
  emptyState = 'Nenhum registro encontrado.',
  className = '',
}: ReorderableTableProps<T>) {
  // -----------------------------------------------------------------------
  // Column order state
  // -----------------------------------------------------------------------
  const initialColKeysRef = useRef<string[] | null>(null);
  const [colOrder, setColOrder] = useState<string[]>(() =>
    columns.map((c) => c.key),
  );

  useEffect(() => {
    if (!initialColKeysRef.current) {
      initialColKeysRef.current = columns.map((c) => c.key);
      setColOrder(columns.map((c) => c.key));
    }
  }, [columns]);

  useEffect(() => {
    const incoming = columns.map((c) => c.key);
    if (
      incoming.length !== colOrder.length ||
      incoming.some((k, i) => k !== colOrder[i])
    ) {
      if (!dragActiveRef.current && initialColKeysRef.current) {
        setColOrder(incoming);
        initialColKeysRef.current = incoming;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  // -----------------------------------------------------------------------
  // Row order state
  // -----------------------------------------------------------------------
  const initialRowKeysRef = useRef<(string | number)[] | null>(null);
  const [rowOrder, setRowOrder] = useState<(string | number)[]>(() =>
    data.map((r) => rowKey(r)),
  );

  useEffect(() => {
    if (!initialRowKeysRef.current) {
      initialRowKeysRef.current = data.map((r) => rowKey(r));
      setRowOrder(data.map((r) => rowKey(r)));
    }
  }, [data, rowKey]);

  useEffect(() => {
    const incoming = data.map((r) => rowKey(r));
    if (
      incoming.length !== rowOrder.length ||
      incoming.some((k, i) => k !== rowOrder[i])
    ) {
      if (!dragActiveRef.current && initialRowKeysRef.current) {
        setRowOrder(incoming);
        initialRowKeysRef.current = incoming;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // -----------------------------------------------------------------------
  // Drag tracking
  // -----------------------------------------------------------------------
  const dragActiveRef = useRef(false);

  useDndMonitor({
    onDragStart() {
      dragActiveRef.current = true;
    },
    onDragEnd(event) {
      dragActiveRef.current = false;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const aId = String(active.id);
      const oId = String(over.id);

      if (isColId(aId) && isColId(oId)) {
        setColOrder((prev) => {
          const oldIdx = prev.indexOf(extractKey(aId));
          const newIdx = prev.indexOf(extractKey(oId));
          if (oldIdx === -1 || newIdx === -1) return prev;
          const reordered = arrayMove(prev, oldIdx, newIdx);
          const newCols = reordered
            .map((k) => columns.find((c) => c.key === k))
            .filter(Boolean) as ReorderableColumn<T>[];
          onColumnOrderChange?.(newCols);
          initialColKeysRef.current = reordered;
          return reordered;
        });
      } else if (isRowId(aId) && isRowId(oId)) {
        setRowOrder((prev) => {
          const oldIdx = prev.indexOf(extractKey(aId));
          const newIdx = prev.indexOf(extractKey(oId));
          if (oldIdx === -1 || newIdx === -1) return prev;
          const reordered = arrayMove(prev, oldIdx, newIdx);
          const idToRow = new Map(data.map((r) => [rowKey(r), r]));
          const newData = reordered
            .map((k) => idToRow.get(k))
            .filter(Boolean) as T[];
          onRowOrderChange?.(newData);
          initialRowKeysRef.current = reordered;
          return reordered;
        });
      }
    },
    onDragCancel() {
      dragActiveRef.current = false;
    },
  });
  // -----------------------------------------------------------------------
  // Column widths / resize
  // -----------------------------------------------------------------------
  const [internalWidths, setInternalWidths] = useState<
    Record<string, number>
  >({});

  const isWidthControlled = controlledWidths !== undefined;
  const columnWidths = isWidthControlled ? controlledWidths : internalWidths;


  const handleResize = useCallback(
    (key: string, w: number) => {
      if (isWidthControlled) {
        onColumnResize?.(key, w);
      } else {
        setInternalWidths((prev) => ({ ...prev, [key]: w }));
      }
    },
    [isWidthControlled, onColumnResize],
  );

  const { handleMouseDown: onResizeHandleMouseDown } = useColumnResize(
    handleResize,
    minColumnWidth,
  );

  // -----------------------------------------------------------------------
  // Editing state
  // -----------------------------------------------------------------------
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // -----------------------------------------------------------------------
  // Selection
  // -----------------------------------------------------------------------
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange) return;
    if (e.target.checked) {
      onSelectionChange(data.map((r) => rowKey(r)));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectRow = (rId: string | number, checked: boolean) => {
    if (!onSelectionChange || !selectedRowIds) return;
    if (checked) {
      onSelectionChange([...selectedRowIds, rId]);
    } else {
      onSelectionChange(selectedRowIds.filter((id) => id !== rId));
    }
  };

  const isRowSelected = (rId: string | number) =>
    selectedRowIds ? selectedRowIds.includes(rId) : false;

  const areAllRowsSelected = () => {
    if (data.length === 0) return false;
    return selectedRowIds
      ? data.every((r) => selectedRowIds.includes(rowKey(r)))
      : false;
  };

  const isSomeRowsSelected = () => {
    if (data.length === 0 || !selectedRowIds) return false;
    const selectedCount = data.filter((r) =>
      selectedRowIds.includes(rowKey(r)),
    ).length;
    return selectedCount > 0 && selectedCount < data.length;
  };

  // -----------------------------------------------------------------------
  // Sort
  // -----------------------------------------------------------------------
  const handleHeaderClick = useCallback(
    (col: ReorderableColumn<T>) => {
      if (!col.sortable || !onSort) return;
      let nextOrder: 'asc' | 'desc' | '' = 'asc';
      if (sortField === col.key) {
        if (sortOrder === 'asc') nextOrder = 'desc';
        else if (sortOrder === 'desc') nextOrder = '';
        else nextOrder = 'asc';
      }
      onSort(nextOrder === '' ? '' : col.key, nextOrder);
    },
    [sortField, sortOrder, onSort],
  );

  // -----------------------------------------------------------------------
  // Inline editing
  // -----------------------------------------------------------------------
  const handleCellDoubleClick = (
    rId: string | number,
    col: ReorderableColumn<T>,
    currentValue: any,
  ) => {
    if (!onCellEdit || !col.editable) return;
    setEditingCell({
      rowId: rId,
      columnKey: col.key,
      value: String(currentValue),
    });
  };

  const handleInlineEditSave = () => {
    if (!editingCell || !onCellEdit) return;
    onCellEdit(editingCell.rowId, editingCell.columnKey, editingCell.value);
    setEditingCell(null);
  };

  const handleInlineEditKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') handleInlineEditSave();
    else if (e.key === 'Escape') setEditingCell(null);
  };

  // -----------------------------------------------------------------------
  // Ordered columns
  // -----------------------------------------------------------------------
  const orderedColumns = useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.key, c]));
    const ordered = colOrder
      .map((k) => colMap.get(k))
      .filter(Boolean) as ReorderableColumn<T>[];
    return ordered.length === columns.length ? ordered : columns;
  }, [colOrder, columns]);

  const showCheckbox = !!onSelectionChange;
  const showRowDragHandle = !!onRowOrderChange;
  const showColDragHandle = !!onColumnOrderChange;
  const showResize = !!onColumnResize;

  const containerClasses = [
    'ctp-table-container',
    'ctp-pro-reorderable-table',
    `ctp-table--${size}`,
    `ctp-table--${color}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // -----------------------------------------------------------------------
  // Sortable items arrays
  // -----------------------------------------------------------------------
  const colItems = useMemo(
    () => orderedColumns.map((c) => colId(c.key)),
    [orderedColumns],
  );

  const rowItems = useMemo(
    () =>
      data
        .filter((r) => rowOrder.includes(rowKey(r)))
        .sort(
          (a, b) =>
            rowOrder.indexOf(rowKey(a)) - rowOrder.indexOf(rowKey(b)),
        )
        .map((r) => rowId(rowKey(r))),
    [data, rowOrder, rowKey],
  );

  const cellCount =
    orderedColumns.length + (showCheckbox ? 1 : 0) + (showRowDragHandle ? 1 : 0);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className={containerClasses}>
      <table className="ctp-table">
        <thead>
          <tr>
            {showRowDragHandle && (
              <th
                style={{ width: '40px', textAlign: 'center' }}
                aria-label="Drag handle"
              />
            )}
            {showCheckbox && (
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  className="ctp-table-checkbox"
                  checked={areAllRowsSelected()}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeRowsSelected();
                  }}
                  onChange={handleSelectAll}
                  aria-label="Selecionar todas as linhas"
                  disabled={isLoading}
                />
              </th>
            )}
            <SortableContext
              items={colItems}
              strategy={horizontalListSortingStrategy}
            >
              {orderedColumns.map((col) => (
                <SortableThInner<T>
                  key={col.key}
                  col={col}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  columnWidth={columnWidths[col.key]}
                  showColDragHandle={showColDragHandle}
                  onColumnResize={showResize ? onColumnResize : undefined}
                  onResizeMouseDown={onResizeHandleMouseDown}
                  onHeaderClick={handleHeaderClick}
                />
              ))}
            </SortableContext>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: loadingRowsCount }).map((_, rIdx) => {
                const trCls = [
                  'ctp-table-skeleton-row',
                  rIdx === 0 ? 'ctp-table-tr--first' : '',
                  rIdx === loadingRowsCount - 1
                    ? 'ctp-table-tr--last'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <React.Fragment key={`skel-${rIdx}`}>
                    {rIdx === 0 && (
                      <tr className="ctp-table-header-spacer">
                        <td colSpan={cellCount}>
                          <div className="ctp-table-header-spacer-inner" />
                        </td>
                      </tr>
                    )}
                    <tr className={trCls}>
                      {showRowDragHandle && <td />}
                      {showCheckbox && (
                        <td style={{ textAlign: 'center' }}>
                          <div
                            className="ctp-table-skeleton-bar"
                            style={{
                              width: '16px',
                              margin: '0 auto',
                            }}
                          />
                        </td>
                      )}
                      {orderedColumns.map((col) => (
                        <td
                          key={`skel-cell-${col.key}`}
                          className={
                            col.align
                              ? `ctp-table-cell--align-${col.align}`
                              : ''
                          }
                        >
                          <div
                            className="ctp-table-skeleton-bar"
                            style={{
                              width:
                                col.align === 'right'
                                  ? '70%'
                                  : col.align === 'center'
                                    ? '50%'
                                    : '85%',
                              marginLeft:
                                col.align === 'right'
                                  ? 'auto'
                                  : col.align === 'center'
                                    ? 'auto'
                                    : '0',
                              marginRight:
                                col.align === 'center' ? 'auto' : '0',
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })
            : data.length === 0
              ? [
                  <tr key="empty-row">
                    <td
                      colSpan={cellCount}
                      className="ctp-table-cell--align-center"
                      style={{
                        padding: '2.5rem 1.5rem',
                        color: 'var(--ctp-overlay1)',
                      }}
                    >
                      {emptyState}
                    </td>
                  </tr>,
                ]
              : [
                  <tr key="spacer" className="ctp-table-header-spacer">
                    <td colSpan={cellCount}>
                      <div className="ctp-table-header-spacer-inner" />
                    </td>
                  </tr>,
                  <SortableContext
                    key="sortable-rows"
                    items={rowItems}
                    strategy={verticalListSortingStrategy}
                  >
                    {data
                      .filter((r) => rowOrder.includes(rowKey(r)))
                      .sort(
                        (a, b) =>
                          rowOrder.indexOf(rowKey(a)) -
                          rowOrder.indexOf(rowKey(b)),
                      )
                      .map((row, idx) => (
                        <SortableTr
                          key={rowKey(row)}
                          row={row}
                          rId={rowKey(row)}
                          rowIndex={idx}
                          totalRows={data.length}
                          columns={orderedColumns}
                          showRowDragHandle={showRowDragHandle}
                          showCheckbox={showCheckbox}
                          isSelected={isRowSelected(rowKey(row))}
                          editingCell={editingCell}
                          columnWidths={columnWidths}
                          editInputRef={editInputRef}
                          onSelectRow={handleSelectRow}
                          onCellDoubleClick={handleCellDoubleClick}
                          onEditingValueChange={(val) =>
                            setEditingCell((prev) =>
                              prev ? { ...prev, value: val } : prev,
                            )
                          }
                          onEditingSave={handleInlineEditSave}
                          onEditingKeyDown={handleInlineEditKeyDown}
                        />
                      ))}
                  </SortableContext>,
                ]}
        </tbody>
      </table>
    </div>
  );
}
