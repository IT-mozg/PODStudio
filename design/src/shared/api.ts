/* Shared fetch helper for the Flask API. Every repository that talks to the
   backend goes through this, so "what does a failed call look like?" is
   decided in exactly one place — and, importantly, a failure carries a
   message a human can act on instead of a raw TypeError. */

/** A failed API call. `status` is Flask's HTTP status, or 0 when the request
 *  never reached the server at all. */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  /** True when the message came from a controller's own `{"error": ...}`
   *  body, i.e. the API answered and explained itself. False for anything
   *  the app inferred (an HTML 404 from a route that doesn't exist, a dead
   *  connection) - the distinction matters because a 404 alone doesn't say
   *  whether the *record* is missing or the *route* is. */
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
    // fetch only rejects when the request didn't complete: server down,
    // connection dropped, request blocked.
    throw new ApiError(
      `Немає зв'язку з сервером (${path}). Перевір, що Flask запущений: python3 app.py`,
      0,
      path,
    );
  }

  // Read as text first: an error response is not always JSON. Flask's own 404
  // and 500 pages are HTML, and calling res.json() on those throws a
  // "Unexpected token '<'" SyntaxError that says nothing about what broke.
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
    // A controller's own {"error": ...} is always the most specific thing we
    // have (a missing Etsy key, a rate limit, "магазин не знайдено", ...).
    if (apiMessage) throw new ApiError(apiMessage, res.status, path, true);
    if (res.status === 404) {
      throw new ApiError(
        `Сервер не знає роут ${path} (404). Найчастіша причина — Flask працює зі старого коду: ` +
          `перезапусти python3 app.py`,
        404,
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

/** Turns whatever landed in a `catch` into a message fit for the UI. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
