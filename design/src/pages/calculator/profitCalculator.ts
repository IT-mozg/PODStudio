/* Pure calculation, no React, so the math can be reasoned about and tested
   independent of any UI. Rates are Etsy's published fee structure, with
   payment processing set for Ukraine rather than the US. */

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

/** Etsy US, as published. Exported so the modal's fee breakdown quotes these
 *  rather than repeating them as literals that drift when Etsy changes one. */
export const ETSY_FEES = {
  /** Flat, per listing. */
  listing: 0.2,
  /** Of the order total, item + shipping. */
  transactionRate: 0.065,
  /** Українські продавці платять за обробку більше, ніж ставка US (3% + $0.25). */
  processingRate: 0.06,
  processingFlat: 0.3,
  /** Only when a sale is attributed to an offsite ad. */
  offsiteAdsRate: 0.15,
} as const;

const PERCENT = 100;

export function calculateProfit(inputs: ProfitInputs): ProfitResult {
  const discountedSellingPrice = inputs.sellingPrice * (1 - inputs.saleDiscountPct / PERCENT);
  const revenue = discountedSellingPrice + inputs.shippingPrice;

  const listingFee = ETSY_FEES.listing;
  const transactionFee = revenue * ETSY_FEES.transactionRate;
  const processingFee = revenue * ETSY_FEES.processingRate + ETSY_FEES.processingFlat;
  const offsiteAdsFee = inputs.offsiteAdsEnabled ? revenue * ETSY_FEES.offsiteAdsRate : 0;
  const etsyFees = listingFee + transactionFee + processingFee + offsiteAdsFee;

  const totalCost = inputs.productionCost + inputs.shippingCost + etsyFees;
  const profit = revenue - totalCost;
  const profitMargin = revenue > 0 ? profit / revenue : 0;
  const totalProfitForAllSales = profit * Math.max(0, inputs.numberOfSales);

  let breakeven: ProfitBreakeven | null = null;
  // Computed regardless of paidAdsEnabled: that toggle only shows the panel,
  // so it has real numbers to animate to the moment it opens.
  if (inputs.conversionRatePct > 0) {
    const clicksPerSale = PERCENT / inputs.conversionRatePct;
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
  sellingPrice: 0,
  shippingPrice: 0,
  productionCost: 0,
  shippingCost: 0,
  saleDiscountPct: 0,
  numberOfSales: 1,
  offsiteAdsEnabled: false,
  paidAdsEnabled: true,
  conversionRatePct: 0,
};
