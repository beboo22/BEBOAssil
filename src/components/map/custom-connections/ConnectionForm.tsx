
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import { StepConnection, CustomConnectionsProps } from "./types";
import { Icon, LatLngExpression } from "leaflet";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

const DisableMapInteractions = () => {
  const map = useMap();
  useEffect(() => {
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    if (map.tap) map.tap.disable();
  }, [map]);
  return null;
};

interface ConnectionFormProps extends CustomConnectionsProps {
  onClose: () => void;
  editingConnection: StepConnection | null;
}

interface ActivitySelectProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  activities: any[];
  mapActivitiesLength: number;
}

const ActivitySelect = ({ label, value, onChange, activities, mapActivitiesLength }: ActivitySelectProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const opts = [];
    for (let i = 0; i < mapActivitiesLength; i++) {
      const name = activities?.[i]?.title || `${t('mapConnection.point')} ${i + 1}`;
      opts.push({ index: i, name });
    }
    return opts;
  }, [mapActivitiesLength, activities, t]);

  const selectedName = options.find(o => o.index === value)?.name || `${t('mapConnection.point')} ${value + 1}`;

  return (
    <div className="space-y-2" onClick={e => e.stopPropagation()}>
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open}
            className="w-full justify-between h-10 text-sm font-normal">
            <span className="flex items-center gap-2 truncate">
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              {selectedName}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[10001]" align="start">
          <Command>
            <CommandInput placeholder={t('mapConnection.searchActivity', { defaultValue: 'Search activity...' })} />
            <CommandList>
              <CommandEmpty>{t('common.noResults', { defaultValue: 'No results found' })}</CommandEmpty>
              <CommandGroup>
                {options.map(opt => (
                  <CommandItem key={opt.index} value={opt.name}
                    onSelect={() => { onChange(opt.index); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", value === opt.index ? "opacity-100" : "opacity-0")} />
                    <span className="text-xs text-muted-foreground mr-2 shrink-0">{opt.index + 1}.</span>
                    {opt.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

const ConnectionForm = ({
  mapActivitiesLength,
  customConnections,
  setCustomConnections,
  visibleSteps,
  recalculateVisibleMarkers,
  onClose,
  editingConnection,
  activities
}: ConnectionFormProps) => {
  const { t } = useTranslation();
  const [fromIndex, setFromIndex] = useState<number>(0);
  const [toIndex, setToIndex] = useState<number>(0);
  const [name, setName] = useState<string>("");
  
  useEffect(() => {
    // @ts-ignore
    delete Icon.Default.prototype._getIconUrl;
    Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });
  }, []);
  
  useEffect(() => {
    if (editingConnection) {
      setFromIndex(editingConnection.fromIndex);
      setToIndex(editingConnection.toIndex);
      setName(editingConnection.name);
    } else {
      setFromIndex(0);
      setToIndex(0);
      setName("");
    }
  }, [editingConnection]);

  const handleSave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!name) {
      toast.error(t('mapConnection.enterName'));
      return;
    }

    if (fromIndex === toIndex) {
      toast.error(t('mapConnection.samePointError'));
      return;
    }

    try {
      let updatedConnections: StepConnection[];
      
      if (editingConnection) {
        updatedConnections = customConnections.map(conn => 
          conn.id === editingConnection.id 
            ? { ...conn, fromIndex, toIndex, name } 
            : conn
        );
        toast.success(t('mapConnection.updated'));
      } else {
        const newConnection: StepConnection = {
          id: `custom-connection-${Date.now()}`,
          fromIndex,
          toIndex,
          name
        };
        updatedConnections = [...customConnections, newConnection];
        toast.success(t('mapConnection.added'));
      }
      
      setCustomConnections(updatedConnections);
      recalculateVisibleMarkers(visibleSteps, updatedConnections);
      onClose();
    } catch (error) {
      console.error("Error saving connection:", error);
      toast.error(t('mapConnection.saveFailed'));
    }
  }, [name, fromIndex, toIndex, editingConnection, customConnections, setCustomConnections, recalculateVisibleMarkers, visibleSteps, onClose, t]);

  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const getPositions = useCallback(() => {
    if (!activities) return [];
    const positions = [];
    if (activities[fromIndex]?.coordinates) positions.push(activities[fromIndex].coordinates);
    if (activities[toIndex]?.coordinates) positions.push(activities[toIndex].coordinates);
    return positions;
  }, [activities, fromIndex, toIndex]);

  const positions = getPositions();
  const hasValidPositions = positions.length === 2;

  const getMapCenter = useCallback((): LatLngExpression => {
    if (!hasValidPositions) return [25.2048, 55.2708];
    const [pos1, pos2] = positions;
    return [(pos1[0] + pos2[0]) / 2, (pos1[1] + pos2[1]) / 2];
  }, [positions, hasValidPositions]);

  return (
    <div className="h-full flex flex-col" onClick={stopPropagation} onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}>
      <SheetHeader className="mb-4">
        <SheetTitle>
          {editingConnection ? t('mapConnection.editTitle') : t('mapConnection.addTitle')}
        </SheetTitle>
      </SheetHeader>
      
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="connection-name">{t('mapConnection.name')}</Label>
            <Input
              id="connection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('mapConnection.namePlaceholder')}
            />
          </div>
          
          <Separator />
          
          {activities && activities.length > 0 && (
            <div className="rounded-lg overflow-hidden h-[200px] border border-border"
              onClick={stopPropagation} onMouseDown={stopPropagation}
              onPointerDown={stopPropagation} onTouchStart={stopPropagation}>
              <MapContainer
                // @ts-ignore
                center={getMapCenter()} zoom={11}
                style={{ height: "100%", width: "100%" }}
                // @ts-ignore
                scrollWheelZoom={false} zoomControl={false} dragging={false}
                // @ts-ignore
                doubleClickZoom={false} touchZoom={false}>
                <DisableMapInteractions />
                <TileLayer
                  // @ts-ignore
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  // @ts-ignore
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {positions.map((position, index) => (
                  <Marker key={`point-${index}`}
                    // @ts-ignore
                    position={position}
                    eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); e.originalEvent.preventDefault(); } }} />
                ))}
                {hasValidPositions && (
                  <Polyline
                    // @ts-ignore
                    positions={positions}
                    pathOptions={{ color: "#3b82f6", weight: 3, dashArray: "5, 5" }}
                    eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); e.originalEvent.preventDefault(); } }} />
                )}
              </MapContainer>
            </div>
          )}
          
          <ActivitySelect
            label={t('mapConnection.fromPoint')}
            value={fromIndex}
            onChange={setFromIndex}
            activities={activities || []}
            mapActivitiesLength={mapActivitiesLength}
          />
          
          <ActivitySelect
            label={t('mapConnection.toPoint')}
            value={toIndex}
            onChange={setToIndex}
            activities={activities || []}
            mapActivitiesLength={mapActivitiesLength}
          />
        </div>
      </div>
      
      <SheetFooter className="mt-4">
        <Button variant="outline" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSave}>
          {editingConnection ? t('mapConnection.updateBtn') : t('mapConnection.addBtn')}
        </Button>
      </SheetFooter>
    </div>
  );
};

export default ConnectionForm;
