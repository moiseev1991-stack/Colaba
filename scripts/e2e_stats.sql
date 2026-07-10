\echo === Sources of DMs created in last 15 min ===
SELECT source, COUNT(*) AS n
FROM company_decision_makers
WHERE created_at > NOW() - INTERVAL '15 minutes'
GROUP BY source ORDER BY n DESC;

\echo === Role categories ===
SELECT role_category, COUNT(*) AS n
FROM company_decision_makers
WHERE created_at > NOW() - INTERVAL '15 minutes'
GROUP BY role_category ORDER BY n DESC;

\echo === Contact types ===
SELECT contact_type, COUNT(*) AS n
FROM company_decision_makers
WHERE created_at > NOW() - INTERVAL '15 minutes'
GROUP BY contact_type ORDER BY n DESC;

\echo === Marketing-DM selected — by source ===
SELECT source, role_category, COUNT(*) AS n
FROM company_decision_makers
WHERE is_marketing_dm = true
  AND created_at > NOW() - INTERVAL '15 minutes'
GROUP BY source, role_category ORDER BY n DESC;

\echo === Companies touched in last 15 min (distinct) ===
SELECT COUNT(DISTINCT company_id) AS companies
FROM company_decision_makers
WHERE created_at > NOW() - INTERVAL '15 minutes';

\echo === Companies with marketing_dm in last 15 min ===
SELECT COUNT(DISTINCT company_id) AS companies_with_marketing_dm
FROM company_decision_makers
WHERE is_marketing_dm = true
  AND created_at > NOW() - INTERVAL '15 minutes';

\echo === Sample: 8 marketing-DMs found ===
SELECT company_id, name, post, source, role_category, contact_type,
       LEFT(COALESCE(contact_value, ''), 40) AS contact_preview,
       confidence
FROM company_decision_makers
WHERE is_marketing_dm = true
  AND created_at > NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC LIMIT 8;

\echo === Sample: 8 VK-only entries (verify VK works) ===
SELECT company_id, name, post, role_category, contact_type,
       LEFT(COALESCE(contact_value, ''), 40) AS contact_preview,
       confidence
FROM company_decision_makers
WHERE source = 'vk'
  AND created_at > NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC LIMIT 8;

\echo === Sample: 8 hh-only entries ===
SELECT company_id, name, post, role_category, contact_type,
       LEFT(COALESCE(contact_value, ''), 40) AS contact_preview
FROM company_decision_makers
WHERE source = 'hh'
  AND created_at > NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC LIMIT 8;
