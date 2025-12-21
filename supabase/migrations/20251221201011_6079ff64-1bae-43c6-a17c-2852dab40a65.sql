-- Enable RLS on rooms table with permissive policies
-- This is public signaling data with short TTL (10 min), no auth needed
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Allow anyone to create rooms
CREATE POLICY "Anyone can create rooms" 
ON public.rooms 
FOR INSERT 
WITH CHECK (true);

-- Allow anyone to view rooms
CREATE POLICY "Anyone can view rooms" 
ON public.rooms 
FOR SELECT 
USING (true);

-- Allow anyone to update rooms (for adding answer)
CREATE POLICY "Anyone can update rooms" 
ON public.rooms 
FOR UPDATE 
USING (true);

-- Allow anyone to delete expired rooms
CREATE POLICY "Anyone can delete rooms" 
ON public.rooms 
FOR DELETE 
USING (true);