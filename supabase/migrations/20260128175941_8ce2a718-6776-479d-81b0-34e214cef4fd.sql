-- Create RLS policies for admin_notification_instances table
-- This table is for admin-only operations

-- Policy to allow all authenticated users to read instances (needed for the dropdown)
CREATE POLICY "Anyone can view notification instances"
ON public.admin_notification_instances
FOR SELECT
TO authenticated
USING (true);

-- Policy to allow all authenticated users to insert instances (admin panel manages this)
CREATE POLICY "Authenticated users can insert notification instances"
ON public.admin_notification_instances
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy to allow all authenticated users to update instances
CREATE POLICY "Authenticated users can update notification instances"
ON public.admin_notification_instances
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy to allow all authenticated users to delete instances
CREATE POLICY "Authenticated users can delete notification instances"
ON public.admin_notification_instances
FOR DELETE
TO authenticated
USING (true);