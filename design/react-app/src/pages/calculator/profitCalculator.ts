/* Pure calculation logic, no React — kept separate from the modal so
   the math can be reasoned about (and unit-tested) independent of any
   UI. Etsy's published fee structure (US): $0.20 flat listing fee,
   6.5% transaction fee on the order total (item + shipping), 3% + $0.25
   payment processing, 15% offsite-ads fee when a sale is attributed to
   an offsite ad. */

export interface ProfitInputs {
  sellingPrice: number;
  shippingPrice: number;
  productionCost: number;
  shippingCost: number;
  saleDiscountPct: number;
  numberOfSales: number;
  offsiteAdsEnabled: boolean;
  paidAdsEnabled: boolean;
  conversionRatePct: number;
}

export interface ProfitBreakeven {
  adSpend: number;
  roas: number;
  cpc: number;
}

export interface ProfitResult {
  discountedSellingPrice: number;
  revenue: number;
  productionCost: number;
  shippingCost: number;
  listingFee: number;
  transactionFee: number;
  processingFee: number;
  offsiteAdsFee: number;
  etsyFees: number;
  totalCost: number;
  profit: number;
  profitMargin: number;
  totalProfitForAllSales: number;
  breakeven: ProfitBreakeven | null;
}

const LISTING_FEE = 0.2;
const TRANSACTION_FEE_RATE = 0.065;
const PROCESSING_RATE = 0.03;
const PROCESSING_FLAT = 0.25;
const OFFSITE_ADS_RATE = 0.15;

export function calculateProfit(inputs: ProfitInputs): ProfitResult {
  const discountedSellingPrice = inputs.sellingPrice * (1 - inputs.saleDiscountPct / 100);
  const revenue = discountedSellingPrice + inputs.shippingPrice;

  const listingFee = LISTING_FEE;
  const transactionFee = revenue * TRANSACTION_FEE_RATE;
  const processingFee = revenue * PROCESSING_RATE + PROCESSING_FLAT;
  const offsiteAdsFee = inputs.offsiteAdsEnabled ? revenue * OFFSITE_ADS_RATE : 0;
  const etsyFees = listingFee + transactionFee + processingFee + offsiteAdsFee;

  const totalCost = inputs.productionCost + inputs.shippingCost + etsyFees;
  const profit = revenue - totalCost;
  const profitMargin = revenue > 0 ? profit / revenue : 0;
  const totalProfitForAllSales = profit * Math.max(0, inputs.numberOfSales);

  let breakeven: ProfitBreakeven | null = null;
  // Computed regardless of paidAdsEnabled — that toggle only controls
  // whether the panel is shown (Collapse), not whether this is known,
  // so the panel has real numbers to animate to the moment it opens.
  if (inputs.conversionRatePct > 0) {
    const clicksPerSale = 100 / inputs.conversionRatePct;
    const adSpend = Math.max(profit, 0);
    breakeven = {
      adSpend,
      roas: adSpend > 0 ? revenue / adSpend : Infinity,
      cpc: adSpend / clicksPerSale,
    };
  }

  return {
    discountedSellingPrice,
    revenue,
    productionCost: inputs.productionCost,
    shippingCost: inputs.shippingCost,
    listingFee,
    transactionFee,
    processingFee,
    offsiteAdsFee,
    etsyFees,
    totalCost,
    profit,
    profitMargin,
    totalProfitForAllSales,
    breakeven,
  };
}

export const defaultProfitInputs: ProfitInputs = {
  sellingPrice: 30,
  shippingPrice: 6,
  productionCost: 11.05,
  shippingCost: 4.75,
  saleDiscountPct: 40,
  numberOfSales: 1,
  offsiteAdsEnabled: false,
  paidAdsEnabled: true,
  conversionRatePct: 3,
};
