import React, { createContext, useContext, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  DragEndEvent,
  DragStartEvent,
  DragOverlayProps,
  DndContextProps,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { isProFeatureAllowed, LicenseStatus, validateLicenseKey } from './licensing';

interface DragDropContextValue {
  apiKey: string | null;
  licenseStatus: LicenseStatus;
  activeId: string | null;
}

const DragDropContext = createContext<DragDropContextValue>({
  apiKey: null,
  licenseStatus: 'development',
  activeId: null,
});

export const useDragDrop = () => useContext(DragDropContext);

export interface DragDropProviderProps {
  apiKey?: string;
  children: React.ReactNode;
  sensors?: DndContextProps['sensors'];
  collisionDetection?: DndContextProps['collisionDetection'];
  modifiers?: DndContextProps['modifiers'];
  onDragStart?: (event: DragStartEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: (event: DragStartEvent) => void;
  DragOverlayContent?: React.ReactNode;
  dragOverlayProps?: Partial<DragOverlayProps>;
}

export const DragDropProvider: React.FC<DragDropProviderProps> = ({
  apiKey,
  children,
  sensors: customSensors,
  collisionDetection = closestCenter,
  modifiers,
  onDragStart,
  onDragEnd,
  onDragCancel,
  DragOverlayContent,
  dragOverlayProps,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const licenseStatus = validateLicenseKey(apiKey || '');
  const allowed = isProFeatureAllowed(apiKey || null);

  const defaultSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const sensors = customSensors || defaultSensors;

  if (!allowed) {
    return (
      <div className="ctp-pro-blocked">
        <p>Catppuccin Pro features require a valid license key.</p>
      </div>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    onDragStart?.(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    onDragEnd?.(event);
  };

  const handleDragCancel = (event: DragStartEvent) => {
    setActiveId(null);
    onDragCancel?.(event);
  };

  return (
    <DragDropContext.Provider value={{ apiKey: apiKey || null, licenseStatus, activeId }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        modifiers={modifiers}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay {...dragOverlayProps}>
          {DragOverlayContent}
        </DragOverlay>
      </DndContext>
    </DragDropContext.Provider>
  );
};

DragDropProvider.displayName = 'DragDropProvider';
