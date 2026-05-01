#!/bin/sh
set -eu

npm run prisma:generate
npm run prisma:push

if [ -n "${SEED_ADMIN_EMAIL:-}" ] && [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
  npm run prisma:seed
else
  echo "Skipping seed: SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD is empty"
fi

exec npm run start:dev
