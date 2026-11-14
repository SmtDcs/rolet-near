#!/usr/bin/env bash
# Rolet NEAR iki hesapla CLI tam maç duman testi (TASKS T-119).
# DİKKAT: Gerçek testnet işlemi içerir; T-119 Samet onayı olmadan ÇALIŞTIRMAYIN.
# Önce `--dry-run` ile akışı ve komutları gözden geçirin.
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
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Bilinmeyen argüman: $arg" >&2
      exit 1
      ;;
  esac
done

NEAR_NETWORK="${NEAR_NETWORK:-testnet}"
CONTRACT_ID="${ROLET_CONTRACT_ID:-rolet.example.testnet}"
PLAYER_A="${PLAYER_A:-alice.example.testnet}"
PLAYER_B="${PLAYER_B:-bob.example.testnet}"
MATCH_ID="${MATCH_ID:-$(date +%s)}"

if [[ "$DRY_RUN" -eq 0 ]]; then
  : "${ROLET_CONTRACT_ID:?ROLET_CONTRACT_ID ayarlı olmalı}"
  : "${PLAYER_A:?PLAYER_A ayarlı olmalı}"
  : "${PLAYER_B:?PLAYER_B ayarlı olmalı}"
fi

# 32-byte rastgele sırlar ve sha256(secret || account_id || match_id_le) taahhütleri.
gen_commit_payload() {
  local secret_hex="$1"
  local account="$2"
  local mid="$3"
  python3 - "$secret_hex" "$account" "$mid" <<'PY'
import base64, hashlib, struct, sys
secret = bytes.fromhex(sys.argv[1])
account = sys.argv[2].encode("utf-8")
mid = struct.pack("<Q", int(sys.argv[3]))
commit = hashlib.sha256(secret + account + mid).digest()
print(base64.b64encode(secret).decode(), base64.b64encode(commit).decode())
PY
}

SECRET_A_HEX="1111111111111111111111111111111111111111111111111111111111111111"
SECRET_B_HEX="2222222222222222222222222222222222222222222222222222222222222222"
read -r SECRET_A_B64 COMMIT_A_B64 <<< "$(gen_commit_payload "$SECRET_A_HEX" "$PLAYER_A" "$MATCH_ID")"
read -r SECRET_B_B64 COMMIT_B_B64 <<< "$(gen_commit_payload "$SECRET_B_HEX" "$PLAYER_B" "$MATCH_ID")"

run_or_print() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    echo "+ $*"
    eval "$@"
  fi
}

echo "=== Rolet CLI Tam Maç Duman Testi (match_id=$MATCH_ID, A=$PLAYER_A, B=$PLAYER_B) ==="

# 1. İki oyuncu karakter satın alır (mevcut token yoksa).
run_or_print "near contract call-function as-transaction \"$CONTRACT_ID\" buy_character json-args '{\"kind\":\"Kuleci\"}' prepaid-gas '30.0 Tgas' attached-deposit '1 NEAR' sign-as \"$PLAYER_A\" network-config \"$NEAR_NETWORK\" sign-with-keychain send"
run_or_print "near contract call-function as-transaction \"$CONTRACT_ID\" buy_character json-args '{\"kind\":\"Ayarci\"}' prepaid-gas '30.0 Tgas' attached-deposit '1 NEAR' sign-as \"$PLAYER_B\" network-config \"$NEAR_NETWORK\" sign-with-keychain send"

if [[ "$DRY_RUN" -eq 1 ]]; then
  TOKEN_A="kuleci:1"
  TOKEN_B="ayarci:2"
else
  TOKEN_A="$(near contract call-function as-read-only "$CONTRACT_ID" nft_tokens_for_owner json-args "{\"account_id\":\"$PLAYER_A\",\"from_index\":\"0\",\"limit\":1}" network-config "$NEAR_NETWORK" now | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["token_id"])')"
  TOKEN_B="$(near contract call-function as-read-only "$CONTRACT_ID" nft_tokens_for_owner json-args "{\"account_id\":\"$PLAYER_B\",\"from_index\":\"0\",\"limit\":1}" network-config "$NEAR_NETWORK" now | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["token_id"])')"
fi

# 2. join x2
run_or_print "near contract call-function as-transaction \"$CONTRACT_ID\" join json-args '{\"match_id\":\"$MATCH_ID\",\"opponent\":\"$PLAYER_B\",\"commit\":\"$COMMIT_A_B64\",\"token_id\":\"$TOKEN_A\"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as \"$PLAYER_A\" network-config \"$NEAR_NETWORK\" sign-with-keychain send"
run_or_print "near contract call-function as-transaction \"$CONTRACT_ID\" join json-args '{\"match_id\":\"$MATCH_ID\",\"opponent\":\"$PLAYER_A\",\"commit\":\"$COMMIT_B_B64\",\"token_id\":\"$TOKEN_B\"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as \"$PLAYER_B\" network-config \"$NEAR_NETWORK\" sign-with-keychain send"

# 3. reveal x2
run_or_print "near contract call-function as-transaction \"$CONTRACT_ID\" reveal json-args '{\"match_id\":\"$MATCH_ID\",\"secret\":\"$SECRET_A_B64\"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as \"$PLAYER_A\" network-config \"$NEAR_NETWORK\" sign-with-keychain send"
run_or_print "near contract call-function as-transaction \"$CONTRACT_ID\" reveal json-args '{\"match_id\":\"$MATCH_ID\",\"secret\":\"$SECRET_B_B64\"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as \"$PLAYER_B\" network-config \"$NEAR_NETWORK\" sign-with-keychain send"

# 4. Maç bitene kadar get_match -> sıradaki oyuncu fire(Opponent)
if [[ "$DRY_RUN" -eq 1 ]]; then
  run_or_print "near contract call-function as-read-only \"$CONTRACT_ID\" get_match json-args '{\"match_id\":\"$MATCH_ID\"}' network-config \"$NEAR_NETWORK\" now"
  run_or_print "near contract call-function as-transaction \"$CONTRACT_ID\" fire json-args '{\"match_id\":\"$MATCH_ID\",\"target\":\"Opponent\"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as \"<turn_player>\" network-config \"$NEAR_NETWORK\" sign-with-keychain send"
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
