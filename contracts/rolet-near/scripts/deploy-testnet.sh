#!/usr/bin/env bash
# Rolet NEAR kontratı testnet deploy betiği (TASKS T-118).
# DİKKAT: Bu betik gerçek ağ işlemi yapar; çalıştırmadan önce `--dry-run`
# ile üretilen komutları inceleyin.
#
# Kullanım:
#   ROLET_CONTRACT_ID=rolet.<hesap>.testnet ROLET_OWNER_ID=<hesap>.testnet \
#     ./deploy-testnet.sh [--dry-run]
#
# Opsiyonel ortam değişkenleri:
#   FUND_AMOUNT=2            # fund_treasury için NEAR miktarı (varsayılan: 2)
#   NEAR_NETWORK=testnet     # varsayılan: testnet
#   USE_DEFAULT_CONFIG=1     # new() çağrısında Config::default JSON verir

set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Bilinmeyen argüman: $arg" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$CONTRACT_DIR/../.." && pwd)"
WASM_PATH="$CONTRACT_DIR/target/near/rolet_near.wasm"
ENV_EXAMPLE="$REPO_ROOT/apps/web/.env.example"

NEAR_NETWORK="${NEAR_NETWORK:-testnet}"
FUND_AMOUNT="${FUND_AMOUNT:-2}"
CONTRACT_ID="${ROLET_CONTRACT_ID:-rolet.example.testnet}"
OWNER_ID="${ROLET_OWNER_ID:-owner.example.testnet}"

if [[ "$DRY_RUN" -eq 0 ]]; then
  : "${ROLET_CONTRACT_ID:?ROLET_CONTRACT_ID ayarlı olmalı}"
  : "${ROLET_OWNER_ID:?ROLET_OWNER_ID ayarlı olmalı}"
fi

# Config::default() ile birebir uyumlu JSON başlatma argümanları.
INIT_CONFIG_JSON=$(cat <<'JSON'
{
  "price": "1000000000000000000000000",
  "ops_bps": 500,
  "durability": 10,
  "reward": "100000000000000000000000",
  "reveal_ms": 60000,
  "turn_ms": 45000,
  "allowance_hint": "500000000000000000000000",
  "tincture_good_pct": 50,
  "max_items": 4,
  "min_treasury": "100000000000000000000000",
  "load_size": 8,
  "min_live": 2,
  "max_live": 6,
  "copies_per_item": 4,
  "rounds": [
    {"start_hp": 4, "items_per_load": 4, "heal_cut_at": null, "item_bag": ["Loupe", "Pipe", "Flask", "Shackle", "Hacksaw"]},
    {"start_hp": 4, "items_per_load": 4, "heal_cut_at": null, "item_bag": ["Loupe", "Pipe", "Flask", "Shackle", "Hacksaw", "Ticker", "Magnet", "Tincture", "Lockpick"]},
    {"start_hp": 4, "items_per_load": 4, "heal_cut_at": 2, "item_bag": ["Loupe", "Pipe", "Flask", "Shackle", "Hacksaw", "Ticker", "Magnet", "Tincture", "Lockpick"]}
  ]
}
JSON
)
INIT_CONFIG_COMPACT="$(echo "$INIT_CONFIG_JSON" | tr -d '\n' | tr -s ' ')"
INIT_ARGS="{\"owner\":\"$OWNER_ID\",\"config\":$INIT_CONFIG_COMPACT}"

run_or_print() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    echo "+ $*"
    eval "$@"
  fi
}

echo "=== Rolet NEAR Testnet Deploy (network=$NEAR_NETWORK contract=$CONTRACT_ID owner=$OWNER_ID) ==="
run_or_print "cd \"$CONTRACT_DIR\" && cargo near build non-reproducible-wasm"

run_or_print "near contract deploy \"$CONTRACT_ID\" use-file \"$WASM_PATH\" with-init-call new json-args '$INIT_ARGS' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config \"$NEAR_NETWORK\" sign-with-keychain send"

run_or_print "near contract call-function as-transaction \"$CONTRACT_ID\" fund_treasury json-args '{}' prepaid-gas '30.0 Tgas' attached-deposit '${FUND_AMOUNT} NEAR' sign-as \"$OWNER_ID\" network-config \"$NEAR_NETWORK\" sign-with-keychain send"

run_or_print "near contract call-function as-read-only \"$CONTRACT_ID\" get_config json-args '{}' network-config \"$NEAR_NETWORK\" now"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] .env.example güncellemesi: NEXT_PUBLIC_ROLET_CONTRACT=$CONTRACT_ID ($ENV_EXAMPLE)"
else
  if [[ -f "$ENV_EXAMPLE" ]] && grep -q '^NEXT_PUBLIC_ROLET_CONTRACT=' "$ENV_EXAMPLE"; then
    sed -i "s|^NEXT_PUBLIC_ROLET_CONTRACT=.*|NEXT_PUBLIC_ROLET_CONTRACT=$CONTRACT_ID|" "$ENV_EXAMPLE"
  else
    printf 'NEXT_PUBLIC_ROLET_CONTRACT=%s\n' "$CONTRACT_ID" >> "$ENV_EXAMPLE"
  fi
  echo "Güncellendi: $ENV_EXAMPLE"
fi
