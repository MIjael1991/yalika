DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "spaces"
    WHERE "type" = 'personal'
      AND "status" = 'active'
    GROUP BY "ownerUserId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Hay usuarios con más de un espacio personal activo. Revísalos antes de aplicar esta migración.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "spaces_one_active_personal_per_owner"
ON "spaces" ("ownerUserId")
WHERE "type" = 'personal' AND "status" = 'active';
