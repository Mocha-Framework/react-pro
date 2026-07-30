import React, { useState, useEffect } from 'react';
import { useDndMonitor, useDroppable, DragOverlay } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface KanbanColumn {
  id: string;
  title: string;
  color?: string; // Optional Catppuccin color theme name for header accent (e.g. 'mauve', 'green')
}

export interface KanbanItem {
  id: string;
  columnId: string;
  title: string;
  description?: string;
  tags?: string[];
  [key: string]: any;
}

export interface KanbanProps {
  columns: KanbanColumn[];
  items: KanbanItem[];
  onItemsChange?: (items: KanbanItem[]) => void;
  onItemClick?: (item: KanbanItem) => void;
  renderItem?: (item: KanbanItem) => React.ReactNode;
  renderColumnHeader?: (column: KanbanColumn, columnItems: KanbanItem[]) => React.ReactNode;
  className?: string;
  color?: string; // Default board theme color accent
}

// ---------------------------------------------------------------------------
// Sortable Card Wrapper
// ---------------------------------------------------------------------------
interface SortableCardProps {
  item: KanbanItem;
  renderItem?: (item: KanbanItem) => React.ReactNode;
  onClick?: () => void;
}

function SortableCard({ item, renderItem, onClick }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  // Use dnd-kit's local `isDragging` — it's the most reliable source of truth for
  // whether THIS card is being dragged (it's reset synchronously by dnd-kit's
  // internal event handlers on drop completion).
  const dragging = isDragging;

  const style: React.CSSProperties = {
    // Disable transformation offset entirely for the actively dragged card placeholder
    transform: dragging ? undefined : CSS.Transform.toString(transform),
    transition,
    // When dragging, set visibility to hidden but keep the element in the layout.
    // This eliminates the flicker that opacity-based fades cause during the brief
    // window between dnd-kit resetting `isDragging` and the parent re-rendering
    // the new item order. The DragOverlay ghost remains visible the whole time.
    visibility: dragging ? 'hidden' : 'visible',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`ctp-pro-kanban-card ${dragging ? 'ctp-pro-kanban-card--dragging' : ''}`}
      onClick={() => {
        // Prevent click trigger while dragging
        if (dragging) return;
        onClick?.();
      }}
    >
      {renderItem ? (
        renderItem(item)
      ) : (
        <>
          <div className="ctp-pro-kanban-card-title">{item.title}</div>
          {item.description && (
            <div className="ctp-pro-kanban-card-desc">{item.description}</div>
          )}
          {item.tags && item.tags.length > 0 && (
            <div className="ctp-pro-kanban-card-tags">
              {item.tags.map((tag) => (
                <span key={tag} className="ctp-pro-kanban-card-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban Column Component
// ---------------------------------------------------------------------------
interface KanbanColumnProps {
  column: KanbanColumn;
  items: KanbanItem[];
  renderItem?: (item: KanbanItem) => React.ReactNode;
  renderColumnHeader?: (column: KanbanColumn, columnItems: KanbanItem[]) => React.ReactNode;
  onItemClick?: (item: KanbanItem) => void;
}

function BoardColumn({
  column,
  items,
  renderItem,
  renderColumnHeader,
  onItemClick,
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  const itemIds = items.map((i) => i.id);

  return (
    <div className={`ctp-pro-kanban-column ctp-pro-kanban-column--${column.color || 'mauve'}`}>
      {renderColumnHeader ? (
        renderColumnHeader(column, items)
      ) : (
        <div className="ctp-pro-kanban-column-header">
          <div className="ctp-pro-kanban-column-title-container">
            <span className="ctp-pro-kanban-column-dot" />
            <h3 className="ctp-pro-kanban-column-title">{column.title}</h3>
          </div>
          <span className="ctp-pro-kanban-column-badge">{items.length}</span>
        </div>
      )}

      <div ref={setNodeRef} className="ctp-pro-kanban-cards-container">
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableCard
              key={item.id}
              item={item}
              renderItem={renderItem}
              onClick={() => onItemClick?.(item)}
            />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div className="ctp-pro-kanban-empty-column-placeholder">
            Solte itens aqui
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Kanban Component
// ---------------------------------------------------------------------------
export function Kanban({
  columns,
  items,
  onItemsChange,
  onItemClick,
  renderItem,
  renderColumnHeader,
  className = '',
  color = 'mauve',
}: KanbanProps) {
  const [internalItems, setInternalItems] = useState<KanbanItem[]>(items);
  const [originalItems, setOriginalItems] = useState<KanbanItem[] | null>(null);
  const [activeItem, setActiveItem] = useState<KanbanItem | null>(null);

  useEffect(() => {
    setInternalItems(items);
  }, [items]);

  const activeItemsList = onItemsChange ? items : internalItems;

  const handleItemsChange = (newItems: KanbanItem[]) => {
    if (onItemsChange) {
      onItemsChange(newItems);
    } else {
      setInternalItems(newItems);
    }
  };

  useDndMonitor({
    onDragStart(event) {
      const { active } = event;
      setOriginalItems(activeItemsList);
      const item = activeItemsList.find((i) => i.id === active.id);
      if (item) {
        setActiveItem(item);
      }
    },
    onDragOver(event) {
      const { active, over } = event;
      if (!over) return;

      const activeIdVal = active.id;
      const overId = over.id;

      if (activeIdVal === overId) return;

      const activeCard = activeItemsList.find((i) => i.id === activeIdVal);
      if (!activeCard) return;

      const isOverColumn = columns.some((col) => col.id === overId);
      let targetColumnId = activeCard.columnId;

      if (isOverColumn) {
        targetColumnId = String(overId);
      } else {
        const overCard = activeItemsList.find((i) => i.id === overId);
        if (overCard) {
          targetColumnId = overCard.columnId;
        }
      }

      // If active card has moved to a new column
      if (activeCard.columnId !== targetColumnId) {
        let updated = activeItemsList.map((item) => {
          if (item.id === activeIdVal) {
            return { ...item, columnId: targetColumnId };
          }
          return item;
        });

        // Insert at precise location if hovering over an existing card
        if (!isOverColumn) {
          const withoutActive = updated.filter((i) => i.id !== activeIdVal);
          const targetIndex = withoutActive.findIndex((i) => i.id === overId);
          if (targetIndex !== -1) {
            const result = [...withoutActive];
            result.splice(targetIndex, 0, { ...activeCard, columnId: targetColumnId });
            updated = result;
          }
        }

        handleItemsChange(updated);
      }
    },
    onDragEnd(event) {
      const { active, over } = event;

      if (!over) {
        // No drop target — clear state immediately
        setActiveItem(null);
        setOriginalItems(null);
        return;
      }

      const activeIdVal = active.id;
      const overId = over.id;

      const activeCard = activeItemsList.find((i) => i.id === activeIdVal);
      const overCard = activeItemsList.find((i) => i.id === overId);

      if (!activeCard) {
        setActiveItem(null);
        setOriginalItems(null);
        return;
      }

      // Reorder items in the same column FIRST
      if (overCard && activeCard.columnId === overCard.columnId) {
        const activeIndex = activeItemsList.findIndex((i) => i.id === activeIdVal);
        const overIndex = activeItemsList.findIndex((i) => i.id === overId);
        if (activeIndex !== overIndex) {
          const reordered = arrayMove(activeItemsList, activeIndex, overIndex);
          handleItemsChange(reordered);
        }
      }

      // Clear drag state. Card visual state is now driven entirely by dnd-kit's
      // `useSortable` `isDragging` flag (set inside each SortableCard), which is
      // reset synchronously by dnd-kit's internal event handlers on drop completion.
      setActiveItem(null);
      setOriginalItems(null);
    },
    onDragCancel() {
      if (originalItems) {
        handleItemsChange(originalItems);
      }
      setActiveItem(null);
      setOriginalItems(null);
    },
  });

  return (
    <div className={`ctp-pro-kanban-board ctp-pro-kanban-board--${color} ${className}`}>
      {columns.map((column) => {
        const columnItems = activeItemsList.filter((item) => item.columnId === column.id);
        return (
          <BoardColumn
            key={column.id}
            column={column}
            items={columnItems}
            renderItem={renderItem}
            renderColumnHeader={renderColumnHeader}
            onItemClick={onItemClick}
          />
        );
      })}

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="ctp-pro-kanban-card ctp-pro-kanban-card--dragging-overlay">
            {renderItem ? (
              renderItem(activeItem)
            ) : (
              <>
                <div className="ctp-pro-kanban-card-title">{activeItem.title}</div>
                {activeItem.description && (
                  <div className="ctp-pro-kanban-card-desc">{activeItem.description}</div>
                )}
                {activeItem.tags && activeItem.tags.length > 0 && (
                  <div className="ctp-pro-kanban-card-tags">
                    {activeItem.tags.map((tag) => (
                      <span key={tag} className="ctp-pro-kanban-card-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </div>
  );
}
