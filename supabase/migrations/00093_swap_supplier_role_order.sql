-- Swap the supplier role dropdown order: Technical Lead / Project Manager
-- now lists above Sales Manager (role_catalog orders by sort_order).
UPDATE user_roles SET sort_order = 40 WHERE code = 'SUPPLIER_SALES_MANAGER';
UPDATE user_roles SET sort_order = 30 WHERE code = 'SUPPLIER_TECHNICAL_LEAD';
