/**
 * Pull a human-readable message out of a thrown request error, whatever its
 * shape. Strapi's fetch client surfaces the server body at `response.data`,
 * where our rejections put a plain string in `error` and the framework's
 * badRequest/validation errors put an object with a `message`.
 */
export function getRequestErrorMessage(err: unknown): string {
  const body = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  if (typeof body === 'string' && body) return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'An error occurred while running the query.';
}
