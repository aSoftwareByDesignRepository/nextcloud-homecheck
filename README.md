# HomeCheck

Personal Nextcloud **app home**: Dashboard-style panes, Samsung-style **folders**, personal order that **syncs to the top bar**, hide/restore apps, optional start-page CTA, and an admin **seed** template (applied once).

**Licence:** AGPL-3.0-or-later · **Nextcloud:** 32–34 · **PHP:** 8.2–8.5  
**Store / website:** https://nextcloud.software-by-design.de/ · **Issues:** https://github.com/aSoftwareByDesignRepository/nextcloud-homecheck/issues

## Screenshots

App Store assets (1920×1040) live in [`screenshots/`](screenshots/). Regenerate with Playwright:

```bash
npx playwright test e2e/capture-store-screenshots.spec.js --project=chromium-store
```

## Install (dev)

```bash
cd nextcloud
docker compose exec -u www-data nextcloud php occ app:enable homecheck
```

Open **HomeCheck** in the app menu. Use **Edit** to rearrange / group / hide. Saving updates `core`/`apporder` (folders stay in HomeCheck only).

Admin: **Settings → Administration → Additional settings → HomeCheck** for the seed JSON.

## Release (App Store)

```bash
make release          # unsigned tarball under build/release/
make release-signed   # requires ~/.nextcloud/certificates/homecheck.{key,crt}
```

See `nextcloud/ready2publish/APPSTORE-RELEASE.md` in the development monorepo for the full publish checklist (signature, GitHub release, apps.nextcloud.com upload).

## Tests

```bash
# Host — unit + mutation (from this app directory)
composer install
./vendor/bin/phpunit --testsuite unit
composer test:mutation

# Integration — Docker Nextcloud (from nextcloud/)
docker compose exec -u www-data nextcloud \
  php /var/www/html/custom_apps/homecheck/vendor/bin/phpunit \
  --configuration /var/www/html/custom_apps/homecheck/phpunit.xml \
  --testsuite integration

# E2E (Playwright)
npm ci
npx playwright install chromium
npm run e2e:flows
```
