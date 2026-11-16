-- How the customer wants the pieces: picks them up (or sends an Uber) or gets
-- them shipped. The WhatsApp agent asks and stores it; the pay page starts
-- there and the sellers see it. NULL = not asked yet.
alter table public.cotizaciones
  add column if not exists forma_entrega text
  check (forma_entrega in ('recoger', 'envio'));
