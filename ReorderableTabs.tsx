import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@mocha-ds/react';
import type {
  TabsProps,
  TabsListProps,
  TabsTriggerProps,
  TabsContentProps,
} from '@mocha-ds/react';
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
// Context
// ---------------------------------------------------------------------------

interface ReorderableTabsContextValue {
  items: string[];
  orientation: 'horizontal' | 'vertical';
  onOrderChange: (newOrder: string[]) => void;
}

const ReorderableTabsContext =
  createContext<ReorderableTabsContextValue | null>(null);

function useReorderableTabs() {
  const ctx = useContext(ReorderableTabsContext);
  if (!ctx) {
    throw new Error(
      'ReorderableTabs sub-components must be rendered within <ReorderableTabs>.'
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTabValues(children: React.ReactNode): string[] {
  const values: string[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if ((child.props as Record<string, unknown>).value) {
      values.push(String((child.props as Record<string, unknown>).value));
    }
    if (child.props.children) {
      values.push(...extractTabValues(child.props.children as React.ReactNode));
    }
  });
  return Array.from(new Set(values));
}

// ---------------------------------------------------------------------------
// ReorderableTabs Root
// ---------------------------------------------------------------------------

export interface ReorderableTabsProps extends TabsProps {
  onOrderChange?: (newOrder: string[]) => void;
}

const ReorderableTabsRoot = React.forwardRef<
  HTMLDivElement,
  ReorderableTabsProps
>(
  (
    {
      defaultValue,
      value: controlledValue,
      onValueChange,
      onOrderChange,
      variant = 'default',
      size = 'md',
      color = 'mauve',
      orientation = 'horizontal',
      mode = 'state',
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const [items, setItems] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const initialExtracted = useRef(false);

    useEffect(() => {
      if (!initialExtracted.current) {
        const extracted = extractTabValues(children);
        if (extracted.length > 0) {
          setItems(extracted);
          initialExtracted.current = true;
        }
      }
    }, [children]);

    useDndMonitor({
      onDragEnd(event) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setItems((prev) => {
          const oldIndex = prev.indexOf(String(active.id));
          const newIndex = prev.indexOf(String(over.id));
          if (oldIndex === -1 || newIndex === -1) return prev;
          const reordered = arrayMove(prev, oldIndex, newIndex);
          if (onOrderChange) {
            onOrderChange(reordered);
          }
          return reordered;
        });
      },
    });

    const handleOrderChange = useCallback(
      (newOrder: string[]) => {
        setItems(newOrder);
        if (onOrderChange) {
          onOrderChange(newOrder);
        }
      },
      [onOrderChange]
    );

    return (
      <ReorderableTabsContext.Provider
        value={{
          items,
          orientation,
          onOrderChange: handleOrderChange,
        }}
      >
        <Tabs
          ref={ref}
          defaultValue={defaultValue}
          value={controlledValue}
          onValueChange={onValueChange}
          variant={variant}
          size={size}
          color={color}
          orientation={orientation}
          mode={mode}
          className={className}
          {...props}
        >
          {children}
        </Tabs>
      </ReorderableTabsContext.Provider>
    );
  }
);
ReorderableTabsRoot.displayName = 'ReorderableTabs';

// ---------------------------------------------------------------------------
// ReorderableTabs.List
// ---------------------------------------------------------------------------

export interface ReorderableTabsListProps extends TabsListProps {}

const ReorderableTabsList = React.forwardRef<
  HTMLDivElement,
  ReorderableTabsListProps
>(({ className = '', children, ...props }, ref) => {
  const { items, orientation } = useReorderableTabs();

  const strategy =
    orientation === 'vertical'
      ? verticalListSortingStrategy
      : horizontalListSortingStrategy;

  const childMap = new Map<string, React.ReactNode>();
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.props.value) {
      childMap.set(String(child.props.value), child);
    }
  });

  const orderedChildren = items
    .map((value) => {
      const child = childMap.get(value);
      return child && React.isValidElement(child) ? React.cloneElement(child as React.ReactElement, { key: value }) : null;
    })
    .filter(Boolean);

  return (
    <TabsList ref={ref} className={className} {...props}>
      <SortableContext items={items} strategy={strategy}>
        {orderedChildren}
      </SortableContext>
    </TabsList>
  );
});
ReorderableTabsList.displayName = 'ReorderableTabs.List';

// ---------------------------------------------------------------------------
// ReorderableTabs.Trigger
// ---------------------------------------------------------------------------

export interface ReorderableTabsTriggerProps extends TabsTriggerProps {
  dragHandle?: boolean;
}

const ReorderableTabsTrigger = React.forwardRef<
  HTMLButtonElement,
  ReorderableTabsTriggerProps
>(({ value, dragHandle, className = '', children, ...props }, ref) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: value });

  const setCombinedRef = useCallback(
    (el: HTMLButtonElement | null) => {
      setNodeRef(el);
      if (typeof ref === 'function') {
        ref(el);
      } else if (ref && 'current' in ref) {
        (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
      }
    },
    [ref, setNodeRef]
  );

  // dnd-kit provides a transition for shifting items. 
  // If undefined (like when active), we MUST NOT fallback to `all` or `transform` transition,
  // otherwise it animates from the drag position to 0 upon drop, causing a flash.
  const safeTransition = transition || 'background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease';

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: safeTransition,
    opacity: isDragging ? 0.4 : undefined,
    cursor: isDragging ? 'grabbing' : 'grab',
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  const triggerClass = [
    'ctp-pro-sortable-trigger',
    isDragging ? 'ctp-pro-sortable-trigger--dragging' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <TabsTrigger
      ref={setCombinedRef}
      value={value}
      className={triggerClass}
      style={style}
      {...attributes}
      {...listeners}
      {...props}
    >
      {children}
    </TabsTrigger>
  );
});
ReorderableTabsTrigger.displayName = 'ReorderableTabs.Trigger';

// ---------------------------------------------------------------------------
// ReorderableTabs.Content
// ---------------------------------------------------------------------------

export interface ReorderableTabsContentProps extends TabsContentProps {}

const ReorderableTabsContent = React.forwardRef<
  HTMLDivElement,
  ReorderableTabsContentProps
>((props, ref) => {
  return <TabsContent ref={ref} {...props} />;
});
ReorderableTabsContent.displayName = 'ReorderableTabs.Content';

// ---------------------------------------------------------------------------
// Compound component attachment
// ---------------------------------------------------------------------------

export const ReorderableTabs = ReorderableTabsRoot as typeof ReorderableTabsRoot & {
  List: typeof ReorderableTabsList;
  Trigger: typeof ReorderableTabsTrigger;
  Content: typeof ReorderableTabsContent;
};

ReorderableTabs.List = ReorderableTabsList;
ReorderableTabs.Trigger = ReorderableTabsTrigger;
ReorderableTabs.Content = ReorderableTabsContent;
