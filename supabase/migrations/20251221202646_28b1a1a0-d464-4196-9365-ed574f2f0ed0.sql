-- Add columns for E2E encryption public keys
ALTER TABLE public.rooms 
ADD COLUMN public_key text,
ADD COLUMN peer_public_key text;