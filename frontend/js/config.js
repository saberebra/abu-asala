/*
 * Configure this after deploying the Cloudflare Worker menu API.
 * The browser must call your Worker; it cannot read Cloudflare KV directly.
 * Keep private secrets in Worker environment variables, never in this file.
 */
window.ABU_ASALA_CONFIG = {
  MENU_API_URL: "",       // Example: https://abu-asala-api.example.workers.dev/api/menu
  PUBLIC_MENU_TOKEN: "",  // Leave empty until your public-menu auth scheme is configured. Never use a private secret here.
  DELIVERY_FEE: 15,
  ORDER_API_URL: ""       // Configure later when the order endpoint is ready.
};
