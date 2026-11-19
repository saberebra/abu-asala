# فطاطري أبو أصالة — customer app

Static HTML/CSS/JS frontend designed for Cloudflare Pages. Menu data is loaded dynamically from a Cloudflare Worker API that reads the live menu cache from Cloudflare KV. The browser must not connect to KV directly.

## Structure
- `frontend/` — customer-facing application. Set this as the Cloudflare Pages build output/root directory according to your deployment setup.
- `frontend/js/config.js` — intentionally blank API configuration. Until `MENU_API_URL` is supplied (the token is optional), the app displays **المنيو متوقف** and does not show a hardcoded menu.
- `backend/` — the Cloudflare Worker (`src/`), its settings (`wrangler.toml`) and the D1 schema (`schema.sql`). See `backend/README.md`.
- `docs/menu-api-contract.md` — expected menu JSON response.

## Run locally
Open `frontend/index.html` through a local static server (not `file://`) once the Worker API is configured.

## Security
Do not put private secrets in frontend JavaScript. Any token shipped to a browser is public. Keep private credentials in Cloudflare Worker secrets. The order endpoint must recalculate prices and validate items/sizes/extras server-side.
