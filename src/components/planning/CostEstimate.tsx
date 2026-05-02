
import { DollarSign } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

interface CostEstimateProps {
  totalCost: number;
  fromCurrency?: string;
}

const CostEstimate = ({ totalCost, fromCurrency = 'USD' }: CostEstimateProps) => {
  const { formatPrice } = useCurrency();

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <DollarSign className="h-5 w-5 text-travel-blue mr-2" />
          <h3 className="font-medium">Estimated Total Cost</h3>
        </div>
        <div className="text-xl font-bold text-travel-blue">{formatPrice(totalCost, fromCurrency)}</div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        This is an estimate based on your selections. Actual prices may vary.
      </p>
    </div>
  );
};

export default CostEstimate;
