-- 00090_update_societycomfort_business_name.sql
-- Update business name for SocietyComfort to include Private Limited

UPDATE public.suppliers
SET business_name = 'SocietyComfort RWA & Outdoor Community Seating Private Limited'
WHERE id = '0d500000-0000-4000-8000-000000000083';
