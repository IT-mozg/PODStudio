/* The only place that talks HTTP to the Flask API, so a failed call looks the
   same everywhere and always carries a message a human can act on. */

export const HTTP_NOT_FOUND = 404;

/** `status` is Flask's HTTP status, or 0 when the request never reached the
 *  server. */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  /** True when the message came from a controller's own `{"error": ...}` — a
   *  404 alone doesn't say whether the *record* or the *route* is missing. */
  readonly apiReported: boolean;

  constructor(message: string, status: number, path: string, apiReported = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.apiReported = apiReported;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    // fetch rejects only when the request didn't complete at all.
    throw new ApiError(
      `Немає зв'язку з сервером (${path}). Перевір, що Flask запущений: python3 app.py`,
      0,
      path,
    );
  }

  // Text first: Flask's 404 and 500 pages are HTML, and res.json() on those
  // throws a "Unexpected token '<'" that says nothing about what broke.
  const raw = await res.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }
  const apiMessage =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : null;

  if (!res.ok) {
    if (apiMessage) throw new ApiError(apiMessage, res.status, path, true);
    if (res.status === HTTP_NOT_FOUND) {
      throw new ApiError(
        `Сервер не знає роут ${path} (404). Найчастіша причина — Flask працює зі старого коду: ` +
          `перезапусти python3 app.py`,
        HTTP_NOT_FOUND,
        path,
      );
    }
    throw new ApiError(`${path} → HTTP ${res.status}`, res.status, path);
  }

  if (body === null) {
    throw new ApiError(
      `${path} відповів не JSON-ом (HTTP ${res.status}). Схоже, запит потрапив не в API, ` +
        `а на HTML-сторінку.`,
      res.status,
      path,
    );
  }
  return body as T;
}

export function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
