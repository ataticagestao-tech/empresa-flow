#!/bin/bash
set -e
echo "--- DB MIGRATION: PODMAN & IPV4 ---"

# ===== CONFIGURATION (set via environment or edit below) =====
DOMAIN="${SUPABASE_DB_DOMAIN:?Set SUPABASE_DB_DOMAIN env var (e.g. db.yourproject.supabase.co)}"
R_PASS="${SUPABASE_DB_PASSWORD:?Set SUPABASE_DB_PASSWORD env var}"
LOCAL_PG_PASS="${LOCAL_PG_PASSWORD:-postgres}"

# 1. Cleanup & Install
rpm -e pgdg-redhat-repo || true
dnf clean all
echo "Installing utils..."
dnf -y install podman bind-utils

# 2. Resolve IP (Supabase)
echo "Resolving $DOMAIN..."
R_IP=$(dig +short "$DOMAIN" A | head -n 1)

if [ -z "$R_IP" ]; then
    echo "Resolution failed (dig). Trying ping..."
    R_IP=$(ping -4 -c 1 "$DOMAIN" | head -n 1 | awk -F'(' '{print $2}' | awk -F')' '{print $1}')
fi

echo "Resolved IP: $R_IP"

if [[ ! "$R_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: Could not resolve valid IPv4 address. Got: '$R_IP'"
    exit 1
fi

# 3. Start Container (PG17)
if ! podman ps | grep -q pg17; then
    podman rm -f pg17 || true
    echo "Starting PG17..."
    podman run -d --name pg17 --restart always -p 5432:5432 \
        -e POSTGRES_PASSWORD="$LOCAL_PG_PASS" \
        -v pg_data:/var/lib/postgresql/data \
        docker.io/library/postgres:17

    echo "Waiting for DB..."
    sleep 15
fi

# 4. Migrate
echo "Migrating from $R_IP..."

# Dump
podman exec -e PGPASSWORD="$R_PASS" pg17 pg_dump -v -h "$R_IP" -U postgres -d postgres \
    --no-owner --no-privileges --clean --if-exists -Fc > /root/backup.dump

# Restore
echo "Restoring..."
podman exec -i pg17 psql -U postgres -c "CREATE DATABASE empresa_flow;" || true
podman exec -i pg17 psql -U postgres -c "ALTER USER postgres WITH PASSWORD '$LOCAL_PG_PASS';" || true
podman exec -i pg17 pg_restore -v -U postgres -d empresa_flow --no-owner --no-privileges < /root/backup.dump

echo "DOCKER_MIGRATION_SUCCESS"
