import { useMemo, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { Toggle } from "../../shared/components/Toggle";
import { AnimatedNumber } from "../../shared/components/AnimatedNumber";
import { Collapse } from "../../shared/components/Collapse";
import { ChevronDownIcon, LightningIcon } from "../../shared/icons";
import { calculateProfit, defaultProfitInputs, ETSY_FEES, type ProfitInputs } from "./profitCalculator";
import styles from "./ProfitCalculatorModal.module.css";

interface ProfitCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function money(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function percent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function roasMultiplier(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)}x` : "—";
}

const PERCENT = 100;

/** The fee rates as shown to the user. Derived from ETSY_FEES so the copy and
 *  the arithmetic can't disagree. */
const FEE_LABELS = {
  listing: `$${ETSY_FEES.listing.toFixed(2)}`,
  transaction: `${ETSY_FEES.transactionRate * PERCENT}%`,
  processing: `${ETSY_FEES.processingRate * PERCENT}% + $${ETSY_FEES.processingFlat.toFixed(2)}`,
} as const;

/** Shorthand — every money figure in this modal tweens on change. */
function Money({ value }: { value: number }) {
  return <AnimatedNumber value={value} format={money} />;
}

interface MoneyFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}

function NumberField({ label, value, onChange, prefix, suffix, step = 0.01 }: MoneyFieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.inputWrap}>
        {prefix && <span>{prefix}</span>}
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </label>
  );
}

const BAR_COLORS = {
  production: "var(--accent)",
  shipping: "var(--ink-cyan)",
  fees: "var(--ink-warm)",
  profit: "#4ade80",
};

/** Прибуток рахується наживо з кожним натисканням клавіші — жодної кнопки
 *  «розрахувати». */
export function ProfitCalculatorModal({ isOpen, onClose }: ProfitCalculatorModalProps) {
  const [inputs, setInputs] = useState<ProfitInputs>(defaultProfitInputs);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const result = useMemo(() => calculateProfit(inputs), [inputs]);

  function set<K extends keyof ProfitInputs>(key: K, value: ProfitInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  const barTotal = result.totalCost + Math.max(result.profit, 0);
  const pct = (v: number) => (barTotal > 0 ? (v / barTotal) * 100 : 0);
  const isProfitable = result.profit >= 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Калькулятор прибутку">
      <div className={styles.layout}>
        {/* ---- inputs ---- */}
        <div>
          <div className={styles.fieldGrid}>
            <NumberField label="Ціна товару (до знижки)" value={inputs.sellingPrice} onChange={(v) => set("sellingPrice", v)} prefix="$" />
            <NumberField label="Доставка (платить покупець)" value={inputs.shippingPrice} onChange={(v) => set("shippingPrice", v)} prefix="$" />
            <NumberField label="Собівартість виробництва" value={inputs.productionCost} onChange={(v) => set("productionCost", v)} prefix="$" />
            <NumberField label="Ваші витрати на доставку" value={inputs.shippingCost} onChange={(v) => set("shippingCost", v)} prefix="$" />
            <NumberField label="Знижка на розпродажі" value={inputs.saleDiscountPct} onChange={(v) => set("saleDiscountPct", v)} suffix="%" step={1} />
            <NumberField label="Кількість продажів" value={inputs.numberOfSales} onChange={(v) => set("numberOfSales", Math.round(v))} step={1} />
          </div>

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Офсайт-реклама Etsy</div>
              <div className={styles.toggleHint}>+15% від суми замовлення</div>
            </div>
            <Toggle checked={inputs.offsiteAdsEnabled} onChange={(v) => set("offsiteAdsEnabled", v)} label="Офсайт-реклама Etsy" />
          </div>

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Точка беззбитковості реклами</div>
              <div className={styles.toggleHint}>ROAS і CPC для платної реклами</div>
            </div>
            <Toggle checked={inputs.paidAdsEnabled} onChange={(v) => set("paidAdsEnabled", v)} label="Розрахувати платну рекламу" />
          </div>

          <Collapse isOpen={inputs.paidAdsEnabled}>
            <div className={styles.subField}>
              <NumberField label="Конверсія" value={inputs.conversionRatePct} onChange={(v) => set("conversionRatePct", v)} suffix="%" step={0.1} />
            </div>
          </Collapse>
        </div>

        {/* ---- results ---- */}
        <div>
          <div className={styles.costBar}>
            <div className={styles.barSegment} style={{ width: `${pct(result.productionCost)}%`, background: BAR_COLORS.production }} />
            <div className={styles.barSegment} style={{ width: `${pct(result.shippingCost)}%`, background: BAR_COLORS.shipping }} />
            <div className={styles.barSegment} style={{ width: `${pct(result.etsyFees)}%`, background: BAR_COLORS.fees }} />
            <div className={styles.barSegment} style={{ width: `${pct(Math.max(result.profit, 0))}%`, background: BAR_COLORS.profit }} />
          </div>

          <div className={styles.legend}>
            <div className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: BAR_COLORS.production }} />
              <span className={styles.legendLabel}>Виробництво</span>
              <span className={styles.legendValue}><Money value={result.productionCost} /></span>
            </div>
            <div className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: BAR_COLORS.shipping }} />
              <span className={styles.legendLabel}>Доставка</span>
              <span className={styles.legendValue}><Money value={result.shippingCost} /></span>
            </div>
            <div className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: BAR_COLORS.fees }} />
              <span className={styles.legendLabel}>Комісії Etsy</span>
              <span className={styles.legendValue}><Money value={result.etsyFees} /></span>
            </div>
            <div className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: BAR_COLORS.profit }} />
              <span className={styles.legendLabel}>Прибуток</span>
              <span className={styles.legendValue}><Money value={result.profit} /></span>
            </div>
          </div>

          {!isProfitable && (
            <div className={styles.deficitNote}>
              Збиток <Money value={result.profit} /> — витрати перевищують дохід
            </div>
          )}

          <div className={styles.heroRow}>
            <div className={`${styles.heroCard} ${styles[isProfitable ? "profitPositive" : "profitNegative"]}`}>
              <div className={styles.heroLabel}>Прибуток за продаж</div>
              <div className={`${styles.heroValue} ${styles[isProfitable ? "positive" : "negative"]}`}>
                <Money value={result.profit} />
              </div>
              <div className={styles.heroSub}>
                маржа <AnimatedNumber value={result.profitMargin * 100} format={percent} />
              </div>
            </div>
            <div className={styles.heroCard}>
              <div className={styles.heroLabel}>Дохід</div>
              <div className={styles.heroValue}>
                <Money value={result.revenue} />
              </div>
              <div className={styles.heroSub}>за {inputs.numberOfSales} прод.</div>
            </div>
            <div className={styles.heroCard}>
              <div className={styles.heroLabel}>Разом прибуток</div>
              <div className={`${styles.heroValue} ${styles[isProfitable ? "positive" : "negative"]}`}>
                <Money value={result.totalProfitForAllSales} />
              </div>
              <div className={styles.heroSub}>
                {inputs.numberOfSales} × <Money value={result.profit} />
              </div>
            </div>
          </div>

          <div className={styles.detailsCard}>
            <div className={styles.detailsHead} onClick={() => setDetailsOpen((v) => !v)}>
              <span className={styles.detailsHeadLabel}>Загальні витрати</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={styles.detailsHeadValue}><Money value={result.totalCost} /></span>
                <span style={{ transform: detailsOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease", color: "var(--text-2)" }}>
                  <ChevronDownIcon size={15} />
                </span>
              </div>
            </div>
            <Collapse isOpen={detailsOpen}>
              <div className={styles.detailsList}>
                <div className={styles.detailsRow}>
                  <span className={styles.detailsRowLabel}>Собівартість + доставка</span>
                  <span className={styles.detailsRowValue}><Money value={result.productionCost + result.shippingCost} /></span>
                </div>
                <div className={styles.detailsRow}>
                  <span className={styles.detailsRowLabel}>
                    Плата за лістинг <span className={styles.detailsRowMeta}>{FEE_LABELS.listing}</span>
                  </span>
                  <span className={styles.detailsRowValue}><Money value={result.listingFee} /></span>
                </div>
                <div className={styles.detailsRow}>
                  <span className={styles.detailsRowLabel}>
                    Транзакційна комісія <span className={styles.detailsRowMeta}>{FEE_LABELS.transaction}</span>
                  </span>
                  <span className={styles.detailsRowValue}><Money value={result.transactionFee} /></span>
                </div>
                <div className={styles.detailsRow}>
                  <span className={styles.detailsRowLabel}>
                    Обробка платежу <span className={styles.detailsRowMeta}>{FEE_LABELS.processing}</span>
                  </span>
                  <span className={styles.detailsRowValue}><Money value={result.processingFee} /></span>
                </div>
                <Collapse isOpen={inputs.offsiteAdsEnabled}>
                  <div className={styles.detailsRow}>
                    <span className={styles.detailsRowLabel}>
                      Офсайт-реклама <span className={styles.detailsRowMeta}>15%</span>
                    </span>
                    <span className={styles.detailsRowValue}><Money value={result.offsiteAdsFee} /></span>
                  </div>
                </Collapse>
              </div>
            </Collapse>
          </div>

          <Collapse isOpen={inputs.paidAdsEnabled}>
            <div className={styles.adsCard}>
              <div className={styles.adsHead}>
                <LightningIcon size={14} />
                Точка беззбитковості реклами
              </div>
              <div className={styles.adsGrid}>
                <div>
                  <div className={styles.adsStat}>Breakeven ROAS</div>
                  <div className={styles.adsValue}>
                    <AnimatedNumber
                      value={!result.breakeven || result.breakeven.roas === Infinity ? 0 : result.breakeven.roas}
                      format={roasMultiplier}
                    />
                  </div>
                </div>
                <div>
                  <div className={styles.adsStat}>Breakeven CPC</div>
                  <div className={styles.adsValue}>
                    <Money value={result.breakeven?.cpc ?? 0} />
                  </div>
                </div>
              </div>
            </div>
          </Collapse>

          <p className={styles.footNote}>
            Комісії розраховано за стандартними ставками Etsy US (лістинг {FEE_LABELS.listing},
            транзакція {FEE_LABELS.transaction}, обробка {FEE_LABELS.processing}). Орієнтовно, не є
            податковою консультацією.
          </p>
        </div>
      </div>
    </Modal>
  );
}
