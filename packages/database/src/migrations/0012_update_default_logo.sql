-- Refresh company.logo / company.favicon defaults to the new ring-style mark
-- (transparent center, two parallel-aligned gaps) for installs that still hold
-- one of the previously seeded defaults. Operators who uploaded their own logo
-- via Settings -> Company are not touched (their stored value won't match
-- either old default).

UPDATE settings
SET value = '"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgMTIwIiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCI+PGRlZnM+PG1hc2sgaWQ9InJpbmdnYXBzIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgZmlsbD0id2hpdGUiLz48cG9seWdvbiBwb2ludHM9IjY4LjgyLC04LjI0IDc2LjcwLC02Ljg2IDY5LjgyLDMyLjU0IDYxLjk0LDMxLjE2IiBmaWxsPSJibGFjayIvPjxwb2x5Z29uIHBvaW50cz0iNTIuMDgsODcuNDYgNTkuOTYsODguODQgNTMuMDgsMTI4LjI0IDQ1LjIwLDEyNi44NiIgZmlsbD0iYmxhY2siLz48L21hc2s+PC9kZWZzPjxjaXJjbGUgY3g9IjYwIiBjeT0iNjAiIHI9IjUwIiBmaWxsPSJub25lIiBzdHJva2U9IiMyMmM1NWUiIHN0cm9rZS13aWR0aD0iMTIiIG1hc2s9InVybCgjcmluZ2dhcHMpIi8+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNjAgNjApIHNjYWxlKDAuOTUpIHRyYW5zbGF0ZSgtNjAgLTYwKSI+PHBhdGggZD0iTTY4IDIwTDM4IDY4aDIybC02IDMyIDMwLTQ4SDYybDYtMzJ6IiBmaWxsPSIjMjJjNTVlIi8+PC9nPjwvc3ZnPg=="',
    updated_at = NOW()
WHERE key IN ('company.logo', 'company.favicon')
  AND value IN (
    -- Original 0001_seed_defaults.sql default (small viewBox 0 0 24 24, fill #f0fdf4 + stroke)
    '"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzE2YTM0YSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjExIiBmaWxsPSIjZjBmZGY0IiBzdHJva2U9IiMxNmEzNGEiIHN0cm9rZS13aWR0aD0iMSIvPjxwYXRoIGQ9Ik0xMyAyTDMgMTRoOWwtMSA4IDEwLTEyaC05bDEtOHoiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEuNSAxKSBzY2FsZSgwLjg1KSIgZmlsbD0iIzE2YTM0YSIgc3Ryb2tlPSIjMTZhMzRhIi8+PC9zdmc+"',
    -- Previous seed.ts default (solid #4ade80 circle with white bolt)
    '"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgMTIwIDEyMCI+PGNpcmNsZSBjeD0iNjAiIGN5PSI2MCIgcj0iNTYiIGZpbGw9IiM0YWRlODAiLz48cGF0aCBkPSJNNjggMjBMMzggNjhoMjJsLTYgMzIgMzAtNDhINjJsNi0zMnoiIGZpbGw9IndoaXRlIi8+PC9zdmc+"'
  );

-- Seed `qr_code_icon` with the same ring mark, embedded raw (the CSMS hook
-- base64-encodes it client-side before inlining into QR codes). INSERT only
-- when no row exists, so an operator-uploaded icon is preserved.
INSERT INTO settings (key, value)
VALUES (
  'qr_code_icon',
  to_jsonb($svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><defs><mask id="ringgaps"><rect width="120" height="120" fill="white"/><polygon points="68.82,-8.24 76.70,-6.86 69.82,32.54 61.94,31.16" fill="black"/><polygon points="52.08,87.46 59.96,88.84 53.08,128.24 45.20,126.86" fill="black"/></mask></defs><circle cx="60" cy="60" r="50" fill="none" stroke="#22c55e" stroke-width="12" mask="url(#ringgaps)"/><g transform="translate(60 60) scale(0.95) translate(-60 -60)"><path d="M68 20L38 68h22l-6 32 30-48H62l6-32z" fill="#22c55e"/></g></svg>$svg$::text)
)
ON CONFLICT (key) DO NOTHING;
