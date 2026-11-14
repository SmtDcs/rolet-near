#!/usr/bin/env bash
# Rolet NEAR kontratı testnet deploy betiği (TASKS T-118).
# DİKKAT: Bu betik gerçek ağ işlemi yapar; çalıştırmadan önce `--dry-run`
# ile üretilen komutları inceleyin. Yalnızca `testnet` ağına izin verir.
#
# Kullanım:
#   ROLET_CONTRACT_ID=rolet.<hesap>.testnet ROLET_OWNER_ID=<hesap>.testnet \
#     ./deploy-testnet.sh [--dry-run]
#
# Opsiyonel ortam değişkenleri:
#   FUND_AMOUNT=2            # fund_treasury için NEAR miktarı (varsayılan: 2)
#   NEAR_NETWORK=testnet     # yalnızca 'testnet' kabul edilir (S1)
#   USE_DEFAULT_CONFIG=1     # 1: yerleşik Config::default() JSON; 0: ROLET_CONFIG_JSON zorunlu (S6)
#   ROLET_CONFIG_JSON=...    # USE_DEFAULT_CONFIG=0 iken verilecek Config JSON

set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Bilinmeyen argüman: $arg" >&2
      exit 1
      ;;
  esac
done

# S3: Gerçek çalıştırmada zorunlu ortam değişkenlerini varsayılan atamadan önce doğrula.
if [[ "$DRY_RUN" -eq 0 ]]; then
  : "${ROLET_CONTRACT_ID:?ROLET_CONTRACT_ID ayarlı olmalı}"
  : "${ROLET_OWNER_ID:?ROLET_OWNER_ID ayarlı olmalı}"
fi

NEAR_NETWORK="${NEAR_NETWORK:-testnet}"
FUND_AMOUNT="${FUND_AMOUNT:-2}"
CONTRACT_ID="${ROLET_CONTRACT_ID:-rolet.example.testnet}"
OWNER_ID="${ROLET_OWNER_ID:-owner.example.testnet}"
USE_DEFAULT_CONFIG="${USE_DEFAULT_CONFIG:-1}"

# S1: Mainnet koruması — ağ yalnızca 'testnet', hesap adları '.testnet' sonekli olmalı.
if [[ "$NEAR_NETWORK" != "testnet" ]]; then
  echo "HATA: NEAR_NETWORK yalnızca 'testnet' olabilir (gelen: '$NEAR_NETWORK')." >&2
  exit 1
fi
validate_testnet_account() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[a-z0-9._-]+\.testnet$ ]]; then
    echo "HATA: $label geçerli bir .testnet hesabı olmalı (gelen: '$value')." >&2
    exit 1
  fi
}
validate_testnet_account "ROLET_CONTRACT_ID" "$CONTRACT_ID"
validate_testnet_account "ROLET_OWNER_ID" "$OWNER_ID"

if [[ ! "$FUND_AMOUNT" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "HATA: FUND_AMOUNT sayısal NEAR miktarı olmalı (gelen: '$FUND_AMOUNT')." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$CONTRACT_DIR/../.." && pwd)"
WASM_PATH="$CONTRACT_DIR/target/near/rolet_near.wasm"
ENV_LOCAL="$REPO_ROOT/apps/web/.env.local"

# S6: USE_DEFAULT_CONFIG=1 ise Config::default() ile birebir uyumlu JSON üret; 0 ise ROLET_CONFIG_JSON kullan.
if [[ "$USE_DEFAULT_CONFIG" == "1" ]]; then
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
    {"start_hp": 4, "items_per_load": 4, "heal_cut_at": null, "item_bag": ["Loupe", "Pipe", "Flask", "Shackle", "Hacksaw"]},
    {"start_hp": 4, "items_per_load": 4, "heal_cut_at": 2, "item_bag": ["Loupe", "Pipe", "Flask", "Shackle", "Hacksaw", "Ticker", "Magnet", "Lockpick", "Tincture"]}
  ]
}
JSON
)
elif [[ "$USE_DEFAULT_CONFIG" == "0" ]]; then
  : "${ROLET_CONFIG_JSON:?USE_DEFAULT_CONFIG=0 iken ROLET_CONFIG_JSON ayarlı olmalı}"
  INIT_CONFIG_JSON="$ROLET_CONFIG_JSON"
else
  echo "HATA: USE_DEFAULT_CONFIG yalnızca '0' veya '1' olabilir (gelen: '$USE_DEFAULT_CONFIG')." >&2
  exit 1
fi

INIT_ARGS="$(python3 - "$OWNER_ID" "$INIT_CONFIG_JSON" <<'PY'
import json, sys
owner = sys.argv[1]
cfg = json.loads(sys.argv[2])
print(json.dumps({"owner": owner, "config": cfg}, separators=(",", ":")))
PY
)"

# S2: eval yerine doğrudan argüman dizisi ile çalıştır/yazdır.
run_or_print() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    printf '+'
    printf ' %q' "$@"
    printf '\n'
    "$@"
  fi
}

run_in_contract_dir() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] (cd %q &&' "$CONTRACT_DIR"
    printf ' %q' "$@"
    printf ')\n'
  else
    printf '+ (cd %q &&' "$CONTRACT_DIR"
    printf ' %q' "$@"
    printf ')\n'
    (cd "$CONTRACT_DIR" && "$@")
  fi
}

echo "=== Rolet NEAR Testnet Deploy (network=$NEAR_NETWORK contract=$CONTRACT_ID owner=$OWNER_ID) ==="
run_in_contract_dir cargo near build non-reproducible-wasm

run_or_print near contract deploy "$CONTRACT_ID" \
  use-file "$WASM_PATH" \
  with-init-call new json-args "$INIT_ARGS" \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
  network-config "$NEAR_NETWORK" sign-with-keychain send

run_or_print near contract call-function as-transaction "$CONTRACT_ID" \
  fund_treasury json-args '{}' \
  prepaid-gas '30.0 Tgas' attached-deposit "${FUND_AMOUNT} NEAR" \
  sign-as "$OWNER_ID" network-config "$NEAR_NETWORK" sign-with-keychain send

run_or_print near contract call-function as-read-only "$CONTRACT_ID" \
  get_config json-args '{}' \
  network-config "$NEAR_NETWORK" now

# S5: Takipli .env.example yerine takipli olmayan .env.local dosyasına yaz.
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] .env.local güncellemesi: NEXT_PUBLIC_ROLET_CONTRACT=$CONTRACT_ID ($ENV_LOCAL)"
else
  python3 - "$ENV_LOCAL" "$CONTRACT_ID" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
contract_id = sys.argv[2]
lines = path.read_text().splitlines() if path.exists() else [
    "# Rolet NEAR yerel kontrat ortam değişkenleri",
    "NEXT_PUBLIC_NEAR_NETWORK=testnet",
    "NEXT_PUBLIC_ROLET_CONTRACT=",
    "NEXT_PUBLIC_NEAR_RPC_URL=https://rpc.testnet.near.org",
]
updated = False
out = []
for line in lines:
    if line.startswith("NEXT_PUBLIC_ROLET_CONTRACT="):
        out.append(f"NEXT_PUBLIC_ROLET_CONTRACT={contract_id}")
        updated = True
    else:
        out.append(line)
if not updated:
    out.append(f"NEXT_PUBLIC_ROLET_CONTRACT={contract_id}")
path.write_text("\n".join(out) + "\n")
PY
  echo "Güncellendi: $ENV_LOCAL"
fi
