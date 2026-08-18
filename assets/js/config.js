/* ============================================================
   Sheikhpura PIP Portal — data source configuration
   This is the ONLY file you edit when connecting Google Sheets.
   No content lives here. No credentials live here.
   ============================================================ */
window.PORTAL_CONFIG = {

  /* Paste the Apps Script Web App /exec URL here after deploying.
     NOTE: this is the script's /exec URL, NOT the Google Sheets URL.
     Leave empty to run entirely from the local JSON snapshot. */
  API_URL: 'https://script.google.com/macros/s/AKfycbwZ8OFOMmOUAKbbUWyltHpXhXEBSJcAHFG5YV6D49towlcOoZ7HylTPgHvUsrapiITQ/exec',

  /* The master Google Sheet. Used only for the "Open Google Sheet" button on the
     Admin dashboard — no data is read from here directly, and this ID is not a
     secret (it is useless without permission on the sheet itself). */
  SHEET_ID: '1V2FbGpfVuX1Z7OhL0yEWQMs43t4QgvwQ4DSfmHEm0vs',

  /* Offline fallback — generated from the Excel workbook by export_json.py.
     Used when API_URL is empty, or when the API is unreachable. */
  FALLBACK_JSON: 'assets/data/portal-data.json',

  /* Minutes to reuse data from sessionStorage before re-fetching.
     Overridden by Settings.cache_minutes once data has loaded. */
  CACHE_MINUTES: 30,

  /* Seconds before a slow API is abandoned in favour of the fallback. */
  TIMEOUT_SECONDS: 12,

  /* Show the validation banner to ordinary visitors.
     false = errors are visible on the Admin dashboard only. */
  SHOW_VALIDATION_TO_PUBLIC: false
};
