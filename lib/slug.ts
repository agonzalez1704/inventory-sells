/**
 * The sku the catalog writes when none is given: lowercase, accents stripped,
 * everything else collapsed to hyphens.
 *
 * ONE definition, used by the import pipeline (which writes it) and the add
 * form (which previews it). Two copies would eventually disagree, and the form
 * looks the product up by this exact string to attach its photo — a preview
 * that differs from what was written is a photo on the wrong product or none.
 */
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
