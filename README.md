# HomeCheck

Personal Nextcloud **app home**: card grid of apps you can open, Samsung-style **folders**, personal order that **syncs to the top bar**, optional start-page CTA, and an admin **seed** template (applied once).

**Licence:** AGPL-3.0-or-later · **Nextcloud:** 32–34 · **PHP:** 8.2–8.5

## Install (dev)

```bash
cd nextcloud
docker compose exec -u www-data nextcloud php occ app:enable homecheck
```

Open **HomeCheck** in the app menu. Use **Edit** to rearrange / group. Saving updates `core`/`apporder` (folders stay in HomeCheck only).

Admin: **Settings → Administration → Additional settings → HomeCheck** for the seed JSON.

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
```

## Product spec

Internal SoT: `planning/app-ideas/homecheck/CORE-PRODUCT-SPEC.md` (workspace parent repo).
