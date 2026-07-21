import React, { useState, useEffect } from 'react';
import { useDndMonitor, useDroppable, DragOverlay, UniqueIdentifier } from '@dnd-kit/core';
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
  isActiveDragging: boolean;
  renderItem?: (item: KanbanItem) => React.ReactNode;
  onClick?: () => void;
}

function SortableCard({ item, isActiveDragging, renderItem, onClick }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const dragging = isDragging || isActiveDragging;

  const style: React.CSSProperties = {
    // Disable transformation offset entirely for the actively dragged card placeholder
    transform: dragging ? undefined : CSS.Transform.toString(transform),
    transition,
    opacity: dragging ? 0.35 : 1,
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
  activeId: UniqueIdentifier | null;
  renderItem?: (item: KanbanItem) => React.ReactNode;
  renderColumnHeader?: (column: KanbanColumn, columnItems: KanbanItem[]) => React.ReactNode;
  onItemClick?: (item: KanbanItem) => void;
}

function BoardColumn({
  column,
  items,
  activeId,
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
              isActiveDragging={activeId === item.id}
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
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

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
      setActiveId(active.id);
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
      setActiveId(null);
      setActiveItem(null);
      setOriginalItems(null);

      if (!over) return;

      const activeIdVal = active.id;
      const overId = over.id;

      const activeCard = activeItemsList.find((i) => i.id === activeIdVal);
      const overCard = activeItemsList.find((i) => i.id === overId);

      if (!activeCard) return;

      // Reorder items in the same column
      if (overCard && activeCard.columnId === overCard.columnId) {
        const activeIndex = activeItemsList.findIndex((i) => i.id === activeIdVal);
        const overIndex = activeItemsList.findIndex((i) => i.id === overId);
        if (activeIndex !== overIndex) {
          const reordered = arrayMove(activeItemsList, activeIndex, overIndex);
          handleItemsChange(reordered);
        }
      }
    },
    onDragCancel() {
      setActiveId(null);
      setActiveItem(null);
      if (originalItems) {
        handleItemsChange(originalItems);
        setOriginalItems(null);
      }
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
            activeId={activeId}
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
