import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Car, Plus, Trash2, Star, Fuel, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year?: number;
  color?: string;
  fuel_type?: string;
  fuel_capacity?: number;
  fuel_consumption?: number;
  license_plate?: string;
  is_primary?: boolean;
}

interface VehicleSectionProps {
  vehicles: Vehicle[];
  isOwnProfile: boolean;
  userId: string;
  onUpdate: () => void;
}

export const VehicleSection = ({ vehicles, isOwnProfile, userId, onUpdate }: VehicleSectionProps) => {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    make: "", model: "", year: "", color: "", fuel_type: "gasoline",
    fuel_capacity: "", fuel_consumption: "", license_plate: "",
  });

  const handleSave = async () => {
    if (!form.make || !form.model) {
      toast({ title: "بيانات مطلوبة", description: "أدخل نوع وموديل السيارة", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("user_vehicles").insert({
      user_id: userId, make: form.make, model: form.model,
      year: form.year ? parseInt(form.year) : null, color: form.color || null,
      fuel_type: form.fuel_type, fuel_capacity: form.fuel_capacity ? parseFloat(form.fuel_capacity) : null,
      fuel_consumption: form.fuel_consumption ? parseFloat(form.fuel_consumption) : null,
      license_plate: form.license_plate || null, is_primary: vehicles.length === 0,
    });
    setSaving(false);
    if (error) { toast({ title: "خطأ", variant: "destructive" }); return; }
    toast({ title: "تمت الإضافة ✅" });
    setShowForm(false);
    setForm({ make: "", model: "", year: "", color: "", fuel_type: "gasoline", fuel_capacity: "", fuel_consumption: "", license_plate: "" });
    onUpdate();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("user_vehicles").delete().eq("id", id);
    toast({ title: "تم الحذف" });
    onUpdate();
  };

  const handleSetPrimary = async (id: string) => {
    await supabase.from("user_vehicles").update({ is_primary: true }).eq("id", id);
    onUpdate();
  };

  return (
    <div className="space-y-4">
      {vehicles.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <Car className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">{isOwnProfile ? "لم تضف أي سيارة بعد" : "لا توجد سيارات مسجلة"}</p>
        </Card>
      ) : vehicles.map(v => (
        <Card key={v.id} className="p-4 bg-card border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Car className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{v.make} {v.model}</span>
                  {v.is_primary && <Badge className="bg-primary/10 text-primary text-xs">أساسية</Badge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  {v.year && <span>{v.year}</span>}
                  {v.color && <span>{v.color}</span>}
                  {v.fuel_type && <span className="flex items-center gap-1"><Fuel className="w-3 h-3" />{v.fuel_type === 'gasoline' ? 'بنزين' : v.fuel_type === 'diesel' ? 'ديزل' : v.fuel_type}</span>}
                </div>
                {(v.fuel_capacity || v.fuel_consumption) && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    {v.fuel_capacity && <span>الخزان: {v.fuel_capacity} لتر</span>}
                    {v.fuel_consumption && <span>الاستهلاك: {v.fuel_consumption} لتر/100كم</span>}
                  </div>
                )}
              </div>
            </div>
            {isOwnProfile && (
              <div className="flex items-center gap-1">
                {!v.is_primary && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSetPrimary(v.id)}><Star className="w-4 h-4 text-warning" /></Button>}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(v.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            )}
          </div>
        </Card>
      ))}

      {isOwnProfile && (
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full gap-2 border-dashed border-border"><Plus className="w-4 h-4" />إضافة سيارة</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>إضافة سيارة جديدة</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الشركة المصنعة *</Label><Input value={form.make} onChange={e => setForm(p => ({ ...p, make: e.target.value }))} placeholder="Toyota" className="mt-1" /></div>
                <div><Label>الموديل *</Label><Input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} placeholder="Camry" className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>سنة الصنع</Label><Input type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} placeholder="2024" className="mt-1" /></div>
                <div><Label>اللون</Label><Input value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} placeholder="أبيض" className="mt-1" /></div>
              </div>
              <div><Label>نوع الوقود</Label>
                <Select value={form.fuel_type} onValueChange={v => setForm(p => ({ ...p, fuel_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gasoline">بنزين</SelectItem>
                    <SelectItem value="diesel">ديزل</SelectItem>
                    <SelectItem value="electric">كهرباء</SelectItem>
                    <SelectItem value="hybrid">هايبرد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>سعة الخزان (لتر)</Label><Input type="number" value={form.fuel_capacity} onChange={e => setForm(p => ({ ...p, fuel_capacity: e.target.value }))} placeholder="60" className="mt-1" /></div>
                <div><Label>الاستهلاك (لتر/100كم)</Label><Input type="number" value={form.fuel_consumption} onChange={e => setForm(p => ({ ...p, fuel_consumption: e.target.value }))} placeholder="8" className="mt-1" /></div>
              </div>
              <div><Label>رقم اللوحة</Label><Input value={form.license_plate} onChange={e => setForm(p => ({ ...p, license_plate: e.target.value }))} placeholder="ABC 1234" className="mt-1" /></div>
              <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}حفظ السيارة
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
