-- Create table for WebRTC signaling with 6-digit PINs
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pin TEXT NOT NULL UNIQUE,
  offer TEXT NOT NULL,
  answer TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Enable realtime for rooms table
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;

-- Create index on pin for fast lookups
CREATE INDEX idx_rooms_pin ON public.rooms(pin);

-- RLS is disabled since this is public signaling data with short TTL
-- No sensitive data is stored, just WebRTC connection offers/answers