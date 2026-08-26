-- persons.first_name / persons.last_name became built-in fields, so enrichment can finally point
-- the provider's name parts at columns of their own. Seeded like the 0065 defaults: once, so a
-- mapping an admin later clears stays cleared. No install can have cleared these, since until now
-- there was no target to map them to.
INSERT INTO "enrichment_field_mappings" ("entity", "canonical_key", "target_kind", "target_key") VALUES
  ('person', 'person.firstName', 'builtin', 'firstName'),
  ('person', 'person.lastName', 'builtin', 'lastName')
ON CONFLICT ("entity", "canonical_key") DO NOTHING;
