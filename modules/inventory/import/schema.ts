import { z } from "zod";

// Anthropic (via OpenRouter) structured output rejects integer schemas that
// carry minimum/maximum — and zod's .int()/.nonnegative() emit exactly those.
// So the AI-facing schema is intentionally unconstrained; we sanitize in code
// (trim sku, round quantity, clamp negatives) before committing.
const RowSchema = z.object({
  sku: z.string(),
  name: z.string().optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  category: z.string().optional(),
  // Type-specific specs as key/value pairs (array form keeps the schema
  // Anthropic-safe; an open record would need additionalProperties).
  attributes: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional(),
  cost: z.number().optional(), // MXN pesos
  price: z.number().optional(), // MXN pesos
  quantity: z.number().optional(),
});

export const AIExtractionSchema = z.object({ rows: z.array(RowSchema) });

export type ExtractedRow = z.infer<typeof RowSchema>;

export type ImportSource = "image" | "excel" | "csv" | "pdf";
