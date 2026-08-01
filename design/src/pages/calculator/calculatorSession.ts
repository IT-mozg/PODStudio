/* Пам'ять калькулятора на час життя вкладки.
 *
 * `Modal` рендерить `null`, поки закрите, тож стан модалки розмонтовується
 * разом із нею — без цього модуля кожне відкриття починалося б із дефолтів.
 *
 * Навмисно звичайна змінна модуля, а не `sessionStorage`: вимога — пам'ятати
 * введене між відкриттями модалки, але забувати при перезавантаженні вкладки.
 * `sessionStorage` переживає reload, тому для цієї вимоги він завеликий;
 * змінна модуля живе рівно стільки, скільки живе JS-контекст сторінки, і
 * ніколи не ділиться між вкладками.
 */
import { defaultProfitInputs, type ProfitInputs } from "./profitCalculator";

let sessionInputs: ProfitInputs = defaultProfitInputs;

export function readSessionInputs(): ProfitInputs {
  return sessionInputs;
}

export function writeSessionInputs(inputs: ProfitInputs): void {
  sessionInputs = inputs;
}
