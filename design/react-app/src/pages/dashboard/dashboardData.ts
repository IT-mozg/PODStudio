/* Mock data for the Дашборд page, typed and kept separate from the
   components that render it (Dependency Inversion: components accept
   this shape as props — swapping this for a real API response later
   means changing this file only, not the components). */

import { CheckShieldIcon, ClockIcon, DesignsIcon, QueueIcon } from "../../shared/icons";
import type { ShopStatusEntry } from "../../shared/components/ShopStatusList";
import type { StatDatum } from "../../shared/components/StatGrid";

export const stats: StatDatum[] = [
  { id: "generated", icon: DesignsIcon, delta: { text: "+12 сьогодні", tone: "up" }, value: "47", label: "Дизайнів згенеровано (тиждень)" },
  { id: "pending", icon: CheckShieldIcon, delta: { text: "потребують уваги", tone: "warn" }, value: "9", label: "Чекають на схвалення" },
  { id: "queue", icon: QueueIcon, delta: { text: "готово до публікації", tone: "up" }, value: "3", label: "У черзі публікації" },
  { id: "budget", icon: ClockIcon, delta: { text: "$0.84 / ген.", tone: "neutral" }, value: "$18.40", label: "Витрачено на генерацію (міс.)" },
];

export interface QueueItemData {
  id: string;
  tag: string;
  kind: "image" | "monitor" | "alert";
  name: string;
  meta: string;
  gradient: [string, string];
}

export const queueItems: QueueItemData[] = [
  { id: "q1", tag: "На схвалення", kind: "image", name: "Retro sunset cat", meta: "illustration · 2 год тому", gradient: ["#3a2f5c", "#221c33"] },
  { id: "q2", tag: "На схвалення", kind: "image", name: "Vintage surf van", meta: "sketch_black · 3 год тому", gradient: ["#2f4a5c", "#1c2833"] },
  { id: "q3", tag: "Мокап готовий", kind: "monitor", name: "Dog mom era", meta: "на футболці · 5 год тому", gradient: ["#5c3a2f", "#33221c"] },
  { id: "q4", tag: "Помилка", kind: "alert", name: "Coffee lover mug", meta: "не вдалось видалити фон", gradient: ["#3a5c33", "#1e2e1c"] },
];

export interface TrendItemData {
  id: string;
  rank: number;
  name: string;
  meta: string;
  growth: string;
  color: [string, string];
}

export const trends: TrendItemData[] = [
  { id: "t1", rank: 1, name: "Funny cat vintage tee", meta: "т-шоп · 1 240 продажів/міс", growth: "+34%", color: ["#ff9a5a", "#e0653f"] },
  { id: "t2", rank: 2, name: "Retro surf van sunset", meta: "дизайн · 860 продажів/міс", growth: "+21%", color: ["#7c6cff", "#5b4bdb"] },
  { id: "t3", rank: 3, name: "Dog mom era typography", meta: "дизайн · 610 продажів/міс", growth: "+18%", color: ["#4ade80", "#22916a"] },
  { id: "t4", rank: 4, name: "Minimalist mountain line art", meta: "дизайн · 490 продажів/міс", growth: "+11%", color: ["#f472b6", "#c2418e"] },
];

export interface KeywordData {
  id: string;
  text: string;
  growth: string;
}

export const keywords: KeywordData[] = [
  { id: "k1", text: "funny cat shirt", growth: "+42%" },
  { id: "k2", text: "dog mom gift", growth: "+27%" },
  { id: "k3", text: "retro surf", growth: "+19%" },
  { id: "k4", text: "minimalist line art", growth: "+15%" },
  { id: "k5", text: "vintage sunset", growth: "+13%" },
  { id: "k6", text: "coffee lover mug", growth: "+9%" },
  { id: "k7", text: "plant mom", growth: "+8%" },
];

export const myShops: ShopStatusEntry[] = [
  { id: "s1", initials: "CT", name: "CatTeesShop", meta: "128 лістингів · 34 продажі/тиж", status: "ok" },
  { id: "s2", initials: "DM", name: "DogMomCo", meta: "76 лістингів · 19 продажів/тиж", status: "ok" },
  { id: "s3", initials: "RS", name: "RetroSurfStore", meta: "2 лістинги втратили позицію", status: "alert" },
  { id: "s4", initials: "MW", name: "MinimalWallArt", meta: "54 лістинги · 11 продажів/тиж", status: "ok" },
];
