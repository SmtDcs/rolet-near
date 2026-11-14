#!/usr/bin/env bash
# Rolet NEAR iki hesapla CLI tam maç duman testi (TASKS T-119).
# DİKKAT: Gerçek testnet işlemi içerir; T-119 Samet onayı olmadan ÇALIŞTIRMAYIN.
# Önce `--dry-run` ile akışı ve komutları gözden geçirin. Yalnızca `testnet` ağına izin verir.
#
# Kullanım:
#   ROLET_CONTRACT_ID=rolet.<hesap>.testnet \
#   PLAYER_A=alice.<hesap>.testnet PLAYER_B=bob.<hesap>.testnet \
#     ./cli-match.sh [--dry-run]

set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
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
  : "${PLAYER_A:?PLAYER_A ayarlı olmalı}"
  : "${PLAYER_B:?PLAYER_B ayarlı olmalı}"
fi

NEAR_NETWORK="${NEAR_NETWORK:-testnet}"
CONTRACT_ID="${ROLET_CONTRACT_ID:-rolet.example.testnet}"
PLAYER_A="${PLAYER_A:-alice.example.testnet}"
PLAYER_B="${PLAYER_B:-bob.example.testnet}"
MATCH_ID="${MATCH_ID:-$(date +%s)}"

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
validate_testnet_account "PLAYER_A" "$PLAYER_A"
validate_testnet_account "PLAYER_B" "$PLAYER_B"

if [[ ! "$MATCH_ID" =~ ^[0-9]+$ ]]; then
  echo "HATA: MATCH_ID tam sayı olmalı (gelen: '$MATCH_ID')." >&2
  exit 1
fi

# S4: Her çalıştırmada taze 32-byte rastgele sır (os.urandom) ve sha256(secret || account_id || match_id_le) taahhüdü üret.
gen_random_commit_payload() {
  local account="$1"
  local mid="$2"
  python3 - "$account" "$mid" <<'PY'
import base64, hashlib, os, struct, sys
secret = os.urandom(32)
account = sys.argv[1].encode("utf-8")
mid = struct.pack("<Q", int(sys.argv[2]))
commit = hashlib.sha256(secret + account + mid).digest()
print(base64.b64encode(secret).decode(), base64.b64encode(commit).decode())
PY
}

read -r SECRET_A_B64 COMMIT_A_B64 <<< "$(gen_random_commit_payload "$PLAYER_A" "$MATCH_ID")"
read -r SECRET_B_B64 COMMIT_B_B64 <<< "$(gen_random_commit_payload "$PLAYER_B" "$MATCH_ID")"

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

echo "=== Rolet CLI Tam Maç Duman Testi (network=$NEAR_NETWORK match_id=$MATCH_ID A=$PLAYER_A B=$PLAYER_B) ==="

# 1. İki oyuncu karakter satın alır.
run_or_print near contract call-function as-transaction "$CONTRACT_ID" \
  buy_character json-args '{"kind":"Kuleci"}' \
  prepaid-gas '30.0 Tgas' attached-deposit '1 NEAR' \
  sign-as "$PLAYER_A" network-config "$NEAR_NETWORK" sign-with-keychain send

run_or_print near contract call-function as-transaction "$CONTRACT_ID" \
  buy_character json-args '{"kind":"Ayarci"}' \
  prepaid-gas '30.0 Tgas' attached-deposit '1 NEAR' \
  sign-as "$PLAYER_B" network-config "$NEAR_NETWORK" sign-with-keychain send

if [[ "$DRY_RUN" -eq 1 ]]; then
  TOKEN_A="kuleci:1"
  TOKEN_B="ayarci:2"
else
  TOKEN_A="$(near contract call-function as-read-only "$CONTRACT_ID" nft_tokens_for_owner json-args "{\"account_id\":\"$PLAYER_A\",\"from_index\":\"0\",\"limit\":1}" network-config "$NEAR_NETWORK" now | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["token_id"])')"
  TOKEN_B="$(near contract call-function as-read-only "$CONTRACT_ID" nft_tokens_for_owner json-args "{\"account_id\":\"$PLAYER_B\",\"from_index\":\"0\",\"limit\":1}" network-config "$NEAR_NETWORK" now | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["token_id"])')"
fi

# 2. join x2
JOIN_A_ARGS="$(python3 -c 'import json,sys; print(json.dumps({"match_id":sys.argv[1],"opponent":sys.argv[2],"commit":sys.argv[3],"token_id":sys.argv[4]}, separators=(",",":")))' "$MATCH_ID" "$PLAYER_B" "$COMMIT_A_B64" "$TOKEN_A")"
JOIN_B_ARGS="$(python3 -c 'import json,sys; print(json.dumps({"match_id":sys.argv[1],"opponent":sys.argv[2],"commit":sys.argv[3],"token_id":sys.argv[4]}, separators=(",",":")))' "$MATCH_ID" "$PLAYER_A" "$COMMIT_B_B64" "$TOKEN_B")"

run_or_print near contract call-function as-transaction "$CONTRACT_ID" \
  join json-args "$JOIN_A_ARGS" \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
  sign-as "$PLAYER_A" network-config "$NEAR_NETWORK" sign-with-keychain send

run_or_print near contract call-function as-transaction "$CONTRACT_ID" \
  join json-args "$JOIN_B_ARGS" \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
  sign-as "$PLAYER_B" network-config "$NEAR_NETWORK" sign-with-keychain send

# 3. reveal x2
REVEAL_A_ARGS="$(python3 -c 'import json,sys; print(json.dumps({"match_id":sys.argv[1],"secret":sys.argv[2]}, separators=(",",":")))' "$MATCH_ID" "$SECRET_A_B64")"
REVEAL_B_ARGS="$(python3 -c 'import json,sys; print(json.dumps({"match_id":sys.argv[1],"secret":sys.argv[2]}, separators=(",",":")))' "$MATCH_ID" "$SECRET_B_B64")"

run_or_print near contract call-function as-transaction "$CONTRACT_ID" \
  reveal json-args "$REVEAL_A_ARGS" \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
  sign-as "$PLAYER_A" network-config "$NEAR_NETWORK" sign-with-keychain send

run_or_print near contract call-function as-transaction "$CONTRACT_ID" \
  reveal json-args "$REVEAL_B_ARGS" \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
  sign-as "$PLAYER_B" network-config "$NEAR_NETWORK" sign-with-keychain send

# 4. Maç bitene kadar get_match -> sıradaki oyuncu fire(Opponent)
if [[ "$DRY_RUN" -eq 1 ]]; then
  run_or_print near contract call-function as-read-only "$CONTRACT_ID" \
    get_match json-args "{\"match_id\":\"$MATCH_ID\"}" \
    network-config "$NEAR_NETWORK" now
  run_or_print near contract call-function as-transaction "$CONTRACT_ID" \
    fire json-args "{\"match_id\":\"$MATCH_ID\",\"target\":\"Opponent\"}" \
    prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
    sign-as "<turn_player>.testnet" network-config "$NEAR_NETWORK" sign-with-keychain send
  exit 0
fi

for step in $(seq 1 120); do
  VIEW_JSON="$(near contract call-function as-read-only "$CONTRACT_ID" get_match json-args "{\"match_id\":\"$MATCH_ID\"}" network-config "$NEAR_NETWORK" now)"
  STATUS="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["status"])' <<< "$VIEW_JSON")"
  if [[ "$STATUS" == "Finished" ]]; then
    echo "Maç bitti ($step adımda): $VIEW_JSON"
    exit 0
  fi
  TURN_IDX="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["game"]["turn"])' <<< "$VIEW_JSON")"
  if [[ "$TURN_IDX" -eq 0 ]]; then
    TURN_PLAYER="$PLAYER_A"
  else
    TURN_PLAYER="$PLAYER_B"
  fi
  echo "Adım $step: sıra=$TURN_PLAYER → fire(Opponent)"
  near contract call-function as-transaction "$CONTRACT_ID" fire \
    json-args "{\"match_id\":\"$MATCH_ID\",\"target\":\"Opponent\"}" \
    prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
    sign-as "$TURN_PLAYER" network-config "$NEAR_NETWORK" sign-with-keychain send
done

echo "Maç 120 adımda bitmedi!" >&2
exit 1
