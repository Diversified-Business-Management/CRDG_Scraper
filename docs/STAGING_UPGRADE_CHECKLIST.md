# CRDG Staging — Houzez Upgrade Checklist

**Hand this file to Claude Desktop (or any agent / dev / VA) to complete every WordPress-staging upgrade.** The CRDG listings pipeline + back-office dashboard already work end-to-end against this site; everything below is **WordPress / Houzez configuration** the WP REST API doesn't expose, so it must be done in the wp-admin UI.

Keep this file updated as items get checked off (PRs / commits welcome — it lives at `docs/STAGING_UPGRADE_CHECKLIST.md` in the [CRDG_Scraper repo](https://github.com/Diversified-Business-Management/CRDG_Scraper)).

---

## 0. Site & access

| Item | Value |
|---|---|
| Staging URL | https://staging3.costaricadreamgroup.com |
| Admin URL | https://staging3.costaricadreamgroup.com/wp-admin/ |
| Login | `errol@myrealtorassistant.com` |
| Password | `DreamBig2026!!$$` (stored in `~/crdg-secrets.env`; rotate after this work is done) |
| Theme | **Houzez 4.3.2** — *do not* customize via custom CSS / child-theme code; use Theme Options as designed |
| Hosting | Google Cloud (NOT in user's SiteGround account — the SG site is the unrelated production site `costaricadreamgroup.com`) |
| JWT plugin | "JWT Authentication for WP REST API" by tmeister — **installed + active** |
| `JWT_AUTH_SECRET_KEY` | defined in `wp-config.php` (already done) |

### REST connectivity smoke test
```bash
curl -s -X POST https://staging3.costaricadreamgroup.com/wp-json/jwt-auth/v1/token \
  -H "Content-Type: application/json" \
  -d '{"username":"errol@myrealtorassistant.com","password":"DreamBig2026!!$$"}'
# Expected: { "token": "eyJ...", "user_email": "...", ... }
```

---

## 1. Design target (read these before clicking anything)

- **Listing archive** — match https://main.houzez.co/listing-v7-grid-3-cols/
  - 3-column property grid, white header, top filter bar, large card image (584×438), badges, price, beds/baths/sqft, agent contact icons, agent photo+name
- **Single property** — match https://main.houzez.co/property/golden-dunes-villa/?s_top=v4 (Houzez **V4** top section)
  - Title + address + price-per-sqft at top, photo gallery, then Description → Documents → Overview → Details → Features → Address & Map → Floor Plans → Video → Mortgage Calc → 360° → Nearby → **Agent Contact (single block at bottom)** → Inquiry Form → Similar listings
  - **NO reviews section.** Real-estate listings don't have user reviews; remove the Houzez review module entirely.
- **Header**: white background (NOT blue / colored)
- **Footer copyright**: `© 2026 Costa Rica Dream Group · All rights reserved.` (NOT `© Houzez ...`)

Houzez documentation: https://favethemes.zendesk.com/hc/en-us/categories/360002468932-Houzez

---

## 2. Tasks — in execution order

### ☐ 2.1 Drop the `register_post_meta` mu-plugin
**Why:** Without this, the listings pipeline's REST writes silently drop every Houzez `fave_*` meta field (price, beds, baths, sqm, location, etc). It must land in `mu-plugins`, NOT in `plugins/`.

**How:**
1. WP Admin → **Appearance → Theme File Editor** → pick **Houzez Child** (or whatever's active) → open `functions.php`.
2. **Append** the snippet below at the bottom (don't replace anything else). Click **Update File**.

```php
add_action('init', function () {
    $keys = [
        'fave_property_price','fave_property_bedrooms','fave_property_bathrooms',
        'fave_property_size','fave_property_size_prefix','fave_property_land',
        'fave_property_year','fave_property_hoa_dues','fave_property_garage',
        'fave_property_rooms','fave_property_id','fave_currency',
        'fave_property_map_address','fave_property_location','fave_property_map',
        'fave_property_map_street_view','fave_property_country','fave_property_zip',
        'fave_video_url','fave_virtual_tour','fave_property_images',
        'fave_360','fave_energy_class','fave_energy_global_index',
        'fave_property_attachments','fave_property_label',
    ];
    foreach ($keys as $k) {
        register_post_meta('property', $k, [
            'type' => 'string', 'single' => true, 'show_in_rest' => true,
            'auth_callback' => function () { return current_user_can('edit_posts'); },
        ]);
    }
});
```

**Acceptance criteria:** `curl -s -X OPTIONS -H "Authorization: Bearer $TOKEN" https://staging3.costaricadreamgroup.com/wp-json/wp/v2/properties | jq '.schema.properties.meta.properties | keys | length'` returns ≥ 20.

---

### ☐ 2.2 Set the white header
**Path:** WP Admin → **Houzez → Theme Options → Header → Header Style** → choose **V1**, **V8**, or **V11** (the white-background variants).
**Save Changes.**
**Acceptance:** front-end refresh shows white header on all pages, dark text/logo, no blue band.

---

### ☐ 2.3 Set the V4 single-property template globally
**Path:** WP Admin → **Houzez → Theme Options → Properties → Property Single Page** (or **Single Property Settings** depending on Houzez version).
- **Top Section Style** → **V4**
- **Save Changes.**
**Acceptance:** open any listing detail page (e.g. http://staging3.costaricadreamgroup.com/property/golden-dunes-villa-test/ or one of the synced ones); top hero matches the V4 demo (title + address + price + price-per-sqft on the right).

---

### ☐ 2.4 Disable Reviews on listings
**Path:** Same Property Single Page panel → **Sections** subpanel.
- Find **"Reviews"** in the section list → **disable** / uncheck.
- **Save Changes.**
**Acceptance:** "Reviews" header no longer renders on any listing detail page.

---

### ☐ 2.5 Move Contact Realtor to bottom only
**Path:** Same Sections subpanel.
- Drag **"Agent Contact"** / **"Contact Form"** to be the **second-to-last** item, just before "Similar Listings".
- **Disable** any of the following if they're on:
  - Floating contact widget
  - Sidebar contact form
  - Mid-page inquiry form (often called "Schedule a Tour")
- Keep **only** the bottom Agent block + the inquiry form right under it.
- **Save Changes.**
**Acceptance:** listing detail page has exactly ONE "Contact Agent / Realtor" block, located at the bottom (just above Similar Listings).

---

### ☐ 2.6 Replace footer copyright text
**Path:** WP Admin → **Houzez → Theme Options → Footer** → **Copyright Text**.
- Replace `© Houzez - All rights reserved` with:
  ```
  © 2026 Costa Rica Dream Group · All rights reserved.
  ```
- **Save Changes.**
**Acceptance:** front-end footer shows the new line on every page.

---

### ☐ 2.7 Listings archive — confirm V7 Grid 3-col template (already set)
**Already done — verify only.** WP Admin → **Pages** → **Property Listings** → check page template = `template/template-listing-grid-v7-fullwidth-3cols.php`. If it's not, change and Update.

---

### ☐ 2.8 Page template consistency
**Why:** Half the pages currently render with the default WP template, half with cartoony custom layouts. Make every non-listing page use the standard layout.

For each of these pages — WP Admin → Pages → open → **Template = Default Template** → Update:
- Our Story
- About Us
- Contact
- Buying Real Estate
- Living in Costa Rica
- Moving to Costa Rica
- Resources
- Regions & Towns *(already cleaned via API — no further action; just confirm Template = Default)*
- Each region page (Central Pacific & Jaco, Guanacaste, Nicoya Peninsula, Caribbean Coast, South Pacific & Osa, Arenal & Monteverde, Manuel Antonio, Central Valley)
- Each lifestyle page (Retirees, Digital Nomads, Investors, Families, Entrepreneurs, Trial Movers)

**Acceptance:** all pages share consistent header → page-content → footer layout. No leftover full-width emoji-heavy cover blocks.

---

### ☐ 2.9 (Optional, nuclear) Houzez Demo Importer
If Theme Options click-through is taking forever, the alternative is to **import the Houzez Main Demo**, which sets every theme option (header, footer, single-page template, listing archive, colors, typography) to match the demo at main.houzez.co in one click. Then customize ~3 things back to CRDG branding.

**Path:** WP Admin → **Houzez → Demo Import** → pick **"Houzez Main Demo"** (or the demo whose preview matches https://main.houzez.co) → **Import**.

**After import:** swap the brand back to CRDG —
- Logo: Theme Options → General → upload CRDG logo
- Site title (already correct: "Costa Rica Dream Group")
- Footer copyright (task 2.6 above)
- Menu: rebuild Primary Navigation if the import wiped it (8 items, About Us at far right — see task 2.10 below for the order)

**Acceptance:** front-end visually matches main.houzez.co except for the CRDG logo + the menu items.

---

### ☐ 2.10 Verify menu order (already set via API — confirm only)
Primary Navigation top-level order should be (left → right):
```
Buying Real Estate · Living in Costa Rica · Moving to Costa Rica · Regions & Towns · Resources · Property Listings · Showcase Properties · About Us
```

If it's different (the demo importer may overwrite menus): WP Admin → **Appearance → Menus** → drag to reorder → Save.

---

### ☐ 2.11 Cache flush after every batch of changes
SiteGround Optimizer caches aggressively. After each Theme Options save (or before testing on the front-end):
- WP Admin → **SG Optimizer → Caching → Purge SG Cache**

If front-end still doesn't update, also clear browser cache (Cmd-Shift-R on Mac).

---

## 3. Verification — after all of section 2 is done

Open these URLs in an incognito window and confirm:

- [ ] Home page header is **white**
- [ ] Footer copyright reads **"© 2026 Costa Rica Dream Group · All rights reserved."**
- [ ] http://staging3.costaricadreamgroup.com/property-listings — 3-column property grid, white header, search bar at top, agent icons on each card
- [ ] Click any property — single-page hero matches V4 demo (title + address + price + price-per-sqft)
- [ ] Page **does not** include "Reviews" section
- [ ] Page has exactly **one** Agent Contact block, at the bottom (above Similar Listings)
- [ ] http://staging3.costaricadreamgroup.com/regions-and-towns — no cartoony emoji-heavy cover block at the bottom
- [ ] http://staging3.costaricadreamgroup.com/about-us, /our-story, /contact — all use the same standard page template
- [ ] Primary navigation reads left → right: Buying Real Estate · Living in CR · Moving to CR · Regions & Towns · Resources · Property Listings · Showcase Properties · About Us

---

## 4. Once verification passes — flip the listing pipeline to live-write

The pipeline currently has `DRY_RUN_WP=true` in `.env`. Once 2.1 (`register_post_meta`) is verified working:

```bash
cd ~/CRDG_Scraper
sed -i '' 's/^DRY_RUN_WP=.*/DRY_RUN_WP=false/' .env
npm run wp-sync -- --once
```

This pushes all canonical_listings to `staging3` as Houzez properties with full meta.

---

## 5. Items that come later (out of scope for this checklist)

- Production deploy of the listings pipeline to Fly.io
- Migrating the SG production site to use Houzez (currently it has no Houzez install)
- Setting up real Supabase magic-link auth on the back-office (currently dev fake-auth)
- Adapter tuning for the 9 newer scraper sources (Sotheby's, Realtor.com international, etc.) once the proven sources are at scale
- Mu-plugin to expose `houzez_options` via REST so the back-office dashboard can edit Theme Options too — currently each toggle is one click in WP admin

---

## 6. Where the data lives — quick reference for the agent

| Houzez option | DB location | Edit via |
|---|---|---|
| Header style | `wp_options.houzez_options[header_style]` (serialized) | Theme Options UI |
| Single Property top section | `wp_options.houzez_options[single_property_top_v]` | Theme Options UI |
| Single property sections list | `wp_options.houzez_options[property_sections]` | Theme Options UI |
| Reviews enabled | `wp_options.houzez_options[disable_reviews]` (and elsewhere) | Theme Options UI |
| Footer copyright | `wp_options.houzez_options[copyright_text]` | Theme Options UI |
| Page template | `wp_postmeta._wp_page_template` per page | WP Pages list, "Template" dropdown |
| Per-listing single-page version | `wp_postmeta.fave_single_top_v` per property | (back-office can write once 2.1 is done) |
| Menu items | `nav_menu_items` post type, `menu_order` field | WP Admin → Appearance → Menus, **OR** WP REST `/wp/v2/menu-items` |

`houzez_options` is a serialized PHP array in a single `wp_options` row. **Don't** try to edit it via SQL or REST — Houzez sanitizes + validates inputs through their own admin UI; bypassing that breaks reads.

---

**This checklist will be considered complete when section 3's verification list is all checked.**
