-- The product editor broke for everyone ("permission denied for table
-- products") the moment updateProduct started sending enlace_proveedor:
-- authenticated's UPDATE grant on products is COLUMN-scoped, and ADD COLUMN
-- does not extend it. Same posture as the other editable fields — RLS still
-- decides who; this only adds the column to what the editor may touch.
GRANT UPDATE (enlace_proveedor) ON public.products TO authenticated;
