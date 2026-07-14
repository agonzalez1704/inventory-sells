// Next.js REDACTS thrown Server Action errors in production: the client only
// gets "an error occurred in the Server Components render" plus a digest. So an
// action that throws can never tell the user what actually went wrong.
//
// Returning the failure instead keeps the real message (return values aren't
// redacted), while `attempt` still logs the full error server-side so it shows
// up in the Vercel logs with context.

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function attempt<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const error =
      e instanceof Error && e.message ? e.message : "Ocurrió un error inesperado";
    // Tagged so it's greppable in the Vercel logs.
    console.error(`[action:${label}]`, e);
    return { ok: false, error };
  }
}

// Client helper: unwrap a result or throw the real message for a toast.
export function unwrap<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
