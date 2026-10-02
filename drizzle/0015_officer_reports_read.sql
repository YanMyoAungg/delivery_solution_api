-- Custom SQL migration file, put your code below!
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
INNER JOIN "permissions" p ON p."name" = 'reports.read'
WHERE r."name" = 'OFFICER'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
