import { useTranslation } from 'react-i18next';
import { DollarSign, Plane, Hotel, UtensilsCrossed, MapPin, Car, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useCurrency } from '@/hooks/useCurrency';

export interface BudgetItem {
  category: string;
  icon: any;
  amount: number;
  color: string;
}

interface BudgetBreakdownProps {
  items: BudgetItem[];
  totalBudget: number;
}

const BudgetBreakdown = ({ items, totalBudget }: BudgetBreakdownProps) => {
  const { t } = useTranslation();
  const { currency, formatPrice } = useCurrency();
  const totalSpent = items.reduce((sum, item) => sum + item.amount, 0);
  const remaining = totalBudget - totalSpent;
  const overBudget = remaining < 0;
  const usagePercent = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  if (items.every(i => i.amount === 0) && totalBudget === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">
            {t('budget.breakdown', { defaultValue: 'Budget Breakdown' })}
          </h3>
        </div>
        <span className={`text-lg font-bold ${overBudget ? 'text-destructive' : 'text-primary'}`}>
          {formatPrice(totalSpent, currency)}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        {t('common.approxPricesNote', { defaultValue: 'Prices are approximate and may vary by availability' })}
      </p>

      {totalBudget > 0 && (
        <div className="space-y-1">
          <Progress value={usagePercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('budget.spent', { defaultValue: 'Spent' })}: {formatPrice(totalSpent, currency)}</span>
            <span className={overBudget ? 'text-destructive font-medium' : ''}>
              {overBudget
                ? `${t('budget.over', { defaultValue: 'Over budget by' })} ${formatPrice(Math.abs(remaining), currency)}`
                : `${t('budget.remaining', { defaultValue: 'Remaining' })}: ${formatPrice(remaining, currency)}`}
            </span>
          </div>
          {overBudget && (
            <div className="flex items-center gap-1.5 text-xs text-destructive mt-1">
              <AlertTriangle size={12} />
              {t('budget.overWarning', { defaultValue: 'Consider adjusting your selections to stay within budget' })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {items.filter(i => i.amount > 0).map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.category} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <div className={`p-1.5 rounded-md ${item.color}`}>
                <Icon size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{item.category}</p>
                <p className="text-sm font-semibold">{formatPrice(item.amount, currency)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BudgetBreakdown;

export function buildBudgetItems(costs: {
  flights?: number;
  hotels?: number;
  meals?: number;
  activities?: number;
  carRental?: number;
}): BudgetItem[] {
  return [
    { category: 'Flights', icon: Plane, amount: costs.flights || 0, color: 'bg-blue-500' },
    { category: 'Hotels', icon: Hotel, amount: costs.hotels || 0, color: 'bg-purple-500' },
    { category: 'Meals', icon: UtensilsCrossed, amount: costs.meals || 0, color: 'bg-orange-500' },
    { category: 'Activities', icon: MapPin, amount: costs.activities || 0, color: 'bg-emerald-500' },
    { category: 'Car Rental', icon: Car, amount: costs.carRental || 0, color: 'bg-rose-500' },
  ];
}
