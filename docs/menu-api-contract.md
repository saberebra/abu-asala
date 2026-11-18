# Menu API contract (Cloudflare Worker -> frontend)

The frontend does not read Cloudflare KV directly. It requests a public menu endpoint served by a Cloudflare Worker; that Worker reads the menu JSON from KV.

Configure `frontend/js/config.js` with `MENU_API_URL` and the agreed **public/client** access token only after the Worker endpoint is ready. Do not put private API keys, bot tokens, database credentials, or Worker secrets in frontend files. If menu reads are public, omit client-token authentication in the Worker and leave the frontend token unused.

Example response:

```json
{
  "delivery_fee": 15,
  "categories": [
    {
      "cat_id": 1, "name": "الفطير", "icon_url": "https://images.example.com/icons/feteer.png", "is_visible": 1,
      "size_variants": [
        {"var_id": 1, "name": "صغير", "extra_price": 0},
        {"var_id": 2, "name": "وسط", "extra_price": 3000},
        {"var_id": 3, "name": "كبير", "extra_price": 6000}
      ],
      "extras": [
        {"ext_id": 1, "name": "حشو أطراف", "price": 2500, "is_available": 1}
      ],
      "subcategories": [
        {"sub_id": 1, "name": "الفطير الشرقي", "icon_url": "https://images.example.com/icons/oriental.png", "is_visible": 1,
          "items": [
            {"itm_id": 10, "name": "رومي", "main_price": 13000, "icon_url": "", "is_visible": 1, "is_available": 1, "group_name": "الجبن"}
          ]
        }
      ]
    }
  ]
}
```

Prices are integer piastres. The app displays EGP and computes item price as `main_price + category size extra_price + selected category extra prices`. If your Worker returns a different shape, update `normalizeMenu()` in `frontend/js/app.js`. The order API must independently revalidate all prices and availability against trusted server-side data; never trust frontend totals.
