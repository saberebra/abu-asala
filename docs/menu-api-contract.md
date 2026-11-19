# Menu API contract (Cloudflare Worker -> frontend)

The frontend never reads Cloudflare KV or D1 directly. It requests a public menu endpoint served by a Cloudflare Worker; that Worker builds the menu from D1 (the views `v_categories`, `v_items`) or reads the prebuilt JSON from KV.

Set `MENU_API_URL` in `frontend/js/config.js`. `PUBLIC_MENU_TOKEN` is **optional**: leave it empty if the menu is public. Never put private keys, bot tokens, database credentials or Worker secrets in frontend files.

## Rules
- **Prices are in Egyptian pounds** (the same unit stored in D1, decimals allowed). No conversion happens in the app.
- Item price = `main_price` (the small size) + the selected size's `extra_price` (from the category's `size_variants`) + the price of each selected extra **for that size**.
- `is_available: 0` greys the item/category out, hides its buttons and moves it after the available ones inside its list. `is_visible: 0` removes it completely.
- Category availability comes from its main component (`v_categories.availability`), item availability from its sub component (`v_items.availability`). Map `'available'` to `1` and `'unavailable'` to `0`.
- A category that has no sub-categories lists its items directly in `items`.
- An item inside a category with size variants may set `"sized": 0` to show a single price without size buttons.
- Icons: send `icon_url` (R2 base address + the path stored in `icons.file`) when the file is an image path, otherwise send `icon_emoji` with the stored emoji. The app falls back to the emoji if the image fails to load.
- The order endpoint must **recalculate every price and check availability server-side**. The app sends `item_id`, `size_id` and extra ids; never trust its totals.

## Example response

```json
{
  "delivery_fee": 15,
  "categories": [
    {
      "cat_id": 3, "name": "البيتزا", "icon_url": "", "icon_emoji": "🍕", "is_visible": 1, "is_available": 1,
      "size_variants": [
        {"var_id": 1, "name": "صغير", "extra_price": 0},
        {"var_id": 4, "name": "وسط", "extra_price": 30},
        {"var_id": 5, "name": "كبير", "extra_price": 60}
      ],
      "extras": [
        {"ext_id": 1, "name": "حشو أطراف", "price": 15, "is_available": 1,
         "size_prices": [{"var_id": 1, "price": 15}, {"var_id": 4, "price": 25}, {"var_id": 5, "price": 40}]}
      ],
      "subcategories": [
        {"sub_id": 3, "name": "بيتزا لحوم وجبن", "icon_emoji": "🍕", "is_visible": 1, "is_available": 1,
          "items": [
            {"itm_id": 45, "name": "مارجريتا", "main_price": 100, "icon_emoji": "🧀", "is_visible": 1, "is_available": 1, "group_name": "الجبن"}
          ]
        }
      ]
    },
    {
      "cat_id": 8, "name": "المقبلات", "icon_emoji": "🍟", "is_visible": 1, "is_available": 1,
      "items": [
        {"itm_id": 129, "name": "باكيت بطاطس فارما", "main_price": 30, "icon_emoji": "🍟", "is_visible": 1, "is_available": 1}
      ]
    }
  ]
}
```

`size_prices` is optional. An extra without it uses `price` for every size. If your Worker returns a different shape, update `normalizeMenu()` in `frontend/js/app.js`.
