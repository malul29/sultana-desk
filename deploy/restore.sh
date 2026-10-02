#!/usr/bin/env bash
# Restore a backup INTO an empty database. Usage: ./deploy/restore.sh backups/sultana-YYYY-MM-DD-HHMM.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 1 ] && [ -f "$1" ] || { echo "Pemakaian: $0 <file-backup.sql.gz>"; exit 1; }
read -r -p "Ini MENIMPA seluruh data saat ini dengan isi $1. Ketik 'ya' untuk lanjut: " ok
[ "$ok" = "ya" ] || { echo "Dibatalkan"; exit 1; }
docker compose stop app
docker compose exec -T db psql -U sultana -d postgres -c "DROP DATABASE IF EXISTS sultana WITH (FORCE)" -c "CREATE DATABASE sultana OWNER sultana"
gunzip -c "$1" | docker compose exec -T db psql -U sultana -d sultana -v ON_ERROR_STOP=1 -q
docker compose start app
echo "Selesai."
