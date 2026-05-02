import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Car, Fuel, Calculator, MapPin } from "lucide-react";

interface PersonalCarOptionsProps {
  distance?: number; // km
  destination?: string;
}

export const PersonalCarOptions = ({ distance = 500, destination }: PersonalCarOptionsProps) => {
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<any>(null);
  const [fuelPrice, setFuelPrice] = useState(2.18); // default SAR
  const [manualConsumption, setManualConsumption] = useState(10);
  const [manualTankCapacity, setManualTankCapacity] = useState(60);

  useEffect(() => {
    if (user) loadVehicle();
  }, [user]);

  const loadVehicle = async () => {
    const { data } = await supabase.from("user_vehicles").select("*").eq("user_id", user!.id).eq("is_primary", true).maybeSingle();
    if (data) {
      setVehicle(data);
      if (data.fuel_consumption) setManualConsumption(data.fuel_consumption);
      if (data.fuel_capacity) setManualTankCapacity(data.fuel_capacity);
    }
  };

  const consumption = vehicle?.fuel_consumption || manualConsumption;
  const tankCapacity = vehicle?.fuel_capacity || manualTankCapacity;

  const fuelNeeded = (distance / 100) * consumption;
  const estimatedCost = fuelNeeded * fuelPrice;
  const fuelStops = Math.max(0, Math.ceil(fuelNeeded / tankCapacity) - 1);
  const rangePerTank = (tankCapacity / consumption) * 100;

  return (
    <Card className="p-5 bg-card border-border space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Car className="w-5 h-5 text-primary" />
        <h3 className="font-bold text-foreground">السفر بالسيارة الشخصية</h3>
        {vehicle && <Badge className="bg-primary/10 text-primary text-xs">{vehicle.make} {vehicle.model}</Badge>}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">سعر البنزين (ريال/لتر)</Label>
          <Input type="number" step="0.01" value={fuelPrice} onChange={e => setFuelPrice(parseFloat(e.target.value) || 0)} className="mt-1 h-9" />
        </div>
        {!vehicle && (
          <>
            <div>
              <Label className="text-xs">الاستهلاك (لتر/100كم)</Label>
              <Input type="number" value={manualConsumption} onChange={e => setManualConsumption(parseFloat(e.target.value) || 1)} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">سعة الخزان (لتر)</Label>
              <Input type="number" value={manualTankCapacity} onChange={e => setManualTankCapacity(parseFloat(e.target.value) || 1)} className="mt-1 h-9" />
            </div>
          </>
        )}
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: MapPin, label: "المسافة", value: `${distance} كم` },
          { icon: Fuel, label: "الوقود المطلوب", value: `${fuelNeeded.toFixed(1)} لتر` },
          { icon: Calculator, label: "التكلفة التقديرية", value: `${estimatedCost.toFixed(0)} ريال` },
          { icon: Fuel, label: "محطات التعبئة", value: `${fuelStops} ${fuelStops === 1 ? 'مرة' : 'مرات'}` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-muted/50 rounded-lg p-3 text-center">
            <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-bold text-foreground text-sm">{value}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        المدى لكل خزان: {rangePerTank.toFixed(0)} كم • {vehicle ? "البيانات من سيارتك المسجلة" : "أدخل بيانات سيارتك في الملف الشخصي للدقة"}
      </p>
    </Card>
  );
};
