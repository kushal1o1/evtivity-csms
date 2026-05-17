-- Backfill audit:read / audit:write for existing admin users that predate
-- those permissions. The permissions were added to PERMISSIONS in
-- packages/lib/src/permissions.ts but no migration backfilled them onto
-- already-seeded admins, so every per-entity "History" tab returned 403.
--
-- See .claude/rules/api/permission-sync.md for the contract that prevents
-- this class of bug going forward: every PR that adds a permission MUST
-- ship a corresponding backfill migration AND db:migrate now invokes
-- packages/database/src/sync-admin-permissions.ts as a post-step so admin
-- users converge on ADMIN_DEFAULT_PERMISSIONS automatically.

INSERT INTO user_permissions (user_id, permission)
SELECT u.id, p.perm
FROM users u
JOIN roles r ON r.id = u.role_id
CROSS JOIN (VALUES ('audit:read'), ('audit:write')) AS p(perm)
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;
