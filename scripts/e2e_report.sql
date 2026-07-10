\pset expanded off
\pset format aligned
\pset border 2
\pset linestyle unicode

\echo === Все компании с найденным marketing-ЛПР (всего 19) ===
SELECT
    dm.company_id AS id,
    SUBSTRING(c.name, 1, 45) AS "компания",
    c.city        AS "город",
    SUBSTRING(dm.name, 1, 32) AS "директор",
    SUBSTRING(dm.post, 1, 20) AS "должность",
    dm.source     AS "источник"
FROM company_decision_makers dm
JOIN companies c ON c.id = dm.company_id
WHERE dm.is_marketing_dm = true
ORDER BY dm.created_at DESC;
