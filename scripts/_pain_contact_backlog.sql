WITH pc AS (
  SELECT DISTINCT s.company_id
  FROM company_pain_scores s
  JOIN pain_tags pt ON pt.id = s.pain_tag_id
   AND pt.status = 'active' AND pt.sentiment = 'negative'
),
em AS (
  SELECT DISTINCT company_id FROM company_contacts
  WHERE type = 'email' AND value <> ''
)
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE c.website IS NOT NULL AND c.website <> '') AS has_site,
  count(*) FILTER (WHERE c.phone IS NOT NULL AND c.phone <> '') AS has_phone,
  count(*) FILTER (WHERE (jsonb_typeof(c.emails) = 'array' AND jsonb_array_length(c.emails) > 0)
                      OR em.company_id IS NOT NULL) AS has_email,
  count(*) FILTER (WHERE (c.website IS NOT NULL AND c.website <> '')
                     AND NOT ((jsonb_typeof(c.emails) = 'array' AND jsonb_array_length(c.emails) > 0)
                              OR em.company_id IS NOT NULL)) AS site_no_email,
  count(*) FILTER (WHERE (c.website IS NULL OR c.website = '')
                     AND NOT ((jsonb_typeof(c.emails) = 'array' AND jsonb_array_length(c.emails) > 0)
                              OR em.company_id IS NOT NULL)) AS no_site_no_email
FROM pc
JOIN companies c ON c.id = pc.company_id
LEFT JOIN em ON em.company_id = pc.company_id;
