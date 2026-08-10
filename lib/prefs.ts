import "server-only";

/**
 * Save a one-row-per-user preferences row.
 *
 * The obvious shape — delete, then insert — is what broke: those tables have
 * RLS on with SELECT/INSERT/UPDATE policies and no DELETE policy, so the delete
 * matched zero rows without complaining and the insert then collided with the
 * row that was still there. It worked the first time a user saved and failed
 * every time after, which is why it shipped.
 *
 * Adding a DELETE policy would have fixed the symptom by widening what a user
 * may do to their own data for no reason. Nothing here ever needed to delete.
 */
export async function guardarPrefs(
  // The InsForge client's table types are generated per table, so this takes
  // the builder rather than the client and stays out of their way.
  db: {
    from: (t: string) => {
      select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } };
      update: (v: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<{ error?: { message?: string } | null }> };
      insert: (rows: Record<string, unknown>[]) => Promise<{ error?: { message?: string } | null }>;
    };
  },
  tabla: string,
  userId: string,
  valores: Record<string, unknown>,
): Promise<void> {
  const { data } = await db.from(tabla).select("user_id").eq("user_id", userId).maybeSingle();

  if (data) {
    const { error } = await db
      .from(tabla)
      .update({ ...valores, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw new Error(error.message ?? "No se pudo guardar");
    return;
  }

  const { error } = await db.from(tabla).insert([{ user_id: userId, ...valores }]);
  if (!error) return;

  // Two tabs saving at once: the row appeared between the select and the
  // insert. The update is the correct outcome either way.
  const { error: err2 } = await db
    .from(tabla)
    .update({ ...valores, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (err2) throw new Error(err2.message ?? "No se pudo guardar");
}
