\pset format aligned
\pset border 2
\pset linestyle unicode

\echo === Sources of DMs created in last 10 min ===
SELECT source, COUNT(*) AS n
FROM company_decision_makers
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY source ORDER BY n DESC;

\echo === Role categories (last 10 min) ===
SELECT role_category, COUNT(*) AS n
FROM company_decision_makers
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY role_category ORDER BY n DESC;

\echo === Contact types (last 10 min) ===
SELECT contact_type, COUNT(*) AS n
FROM company_decision_makers
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY contact_type ORDER BY n DESC;

\echo === Marketing-DM selected — by source (last 10 min) ===
SELECT source, role_category, COUNT(*) AS n
FROM company_decision_makers
WHERE is_marketing_dm = true
  AND created_at > NOW() - INTERVAL '10 minutes'
GROUP BY source, role_category ORDER BY n DESC;

\echo === Всего companies with marketing_dm (last 10 min) ===
SELECT COUNT(DISTINCT company_id) FROM company_decision_makers
WHERE is_marketing_dm = true AND created_at > NOW() - INTERVAL '10 minutes';

\echo === Sample: 8 marketing-DMs found (new run) ===
SELECT company_id, SUBSTRING(name, 1, 30) AS name, SUBSTRING(post, 1, 20) AS post,
       source, role_category, contact_type,
       SUBSTRING(COALESCE(contact_value, '-'), 1, 30) AS contact
FROM company_decision_makers
WHERE is_marketing_dm = true
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC LIMIT 8;

\echo === Sample: 5 VK-entries (verify VK works after fix) ===
SELECT company_id, SUBSTRING(name, 1, 30) AS name, SUBSTRING(post, 1, 30) AS post,
       role_category, contact_type,
       SUBSTRING(COALESCE(contact_value, '-'), 1, 40) AS contact
FROM company_decision_makers
WHERE source = 'vk'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC LIMIT 5;

\echo === Sample: 5 hh-entries (verify hh works after fix) ===
SELECT company_id, SUBSTRING(name, 1, 30) AS name, SUBSTRING(post, 1, 30) AS post,
       role_category, contact_type,
       SUBSTRING(COALESCE(contact_value, '-'), 1, 40) AS contact
FROM company_decision_makers
WHERE source = 'hh'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC LIMIT 5;
