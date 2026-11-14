#!/usr/bin/env python3
"""Full Rolet match on NEAR testnet where every game turn is signed with a
function-call access key (no full-access key, no wallet prompt per move).

Prereqs: both players own a character NFT (buy_character) and have a
function-call key for the contract saved by near-cli-rs in
~/.near-credentials/testnet/<account>/ed25519_<pubkey>.json.

Usage: ROLET_CONTRACT_ID=... PLAYER_A=... PLAYER_B=... FC_KEY_A=<file> FC_KEY_B=<file> \
       python3 scripts/fc-match.py
Testnet only. Prints transaction links, never key material.
"""
import base64, hashlib, json, os, re, struct, subprocess, sys, time

NET = "testnet"
C = os.environ["ROLET_CONTRACT_ID"]
A, B = os.environ["PLAYER_A"], os.environ["PLAYER_B"]
KEYS = {A: os.environ["FC_KEY_A"], B: os.environ["FC_KEY_B"]}
MID = os.environ.get("MATCH_ID", str(int(time.time())))
TX_LOG = os.environ.get("TX_LOG", "/tmp/rolet-match-txs.json")
for acc in (C, A, B):
    assert acc.endswith(".testnet"), "testnet only"

TXS = []

def short(a):
    return a.split(".")[0] if a != C else "contract"

def view(method, args):
    out = subprocess.run(["near", "contract", "call-function", "as-read-only", C, method,
                          "json-args", json.dumps(args), "network-config", NET, "now"],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)

def call(signer, method, args, label):
    cmd = ["near", "contract", "call-function", "as-transaction", C, method,
           "json-args", json.dumps(args, separators=(",", ":")),
           "prepaid-gas", "30.0 Tgas", "attached-deposit", "0 NEAR",
           "sign-as", signer, "network-config", NET,
           "sign-with-access-key-file", KEYS[signer], "send"]
    p = subprocess.run(cmd, capture_output=True, text=True)
    out = p.stdout + p.stderr
    m = re.search(r"Transaction ID: (\w+)", out)
    if p.returncode != 0 or not m:
        err = re.findall(r"(Smart contract panicked: [^\n]*|ERR_[A-Z_]+[^\n]*|Error[^\n]*)", out)
        print(f"  ! {label} failed: {err[:2]}")
        sys.exit(1)
    tx = m.group(1)
    TXS.append({"label": label, "signer": signer, "method": method, "tx": tx})
    print(f"  {label:<34} tx {tx[:10]}…  (function-call key)")
    return tx

def secret_commit(acc):
    s = os.urandom(32)
    c = hashlib.sha256(s + acc.encode() + struct.pack("<Q", int(MID))).digest()
    return base64.b64encode(s).decode(), base64.b64encode(c).decode()

def token_of(acc):
    return view("nft_tokens_for_owner", {"account_id": acc, "from_index": "0", "limit": 1})[0]["token_id"]

print(f"ROLET on NEAR testnet  contract={C}  match={MID}")
print(f"players: {short(A)} vs {short(B)}  (4 HP, 8 chambers, 2-6 live, best of 3)\n")
sa, ca = secret_commit(A)
sb, cb = secret_commit(B)
print("commit-reveal seed:")
call(A, "join", {"match_id": MID, "opponent": B, "commit": ca, "token_id": token_of(A)}, f"{short(A)} join (commit)")
call(B, "join", {"match_id": MID, "opponent": A, "commit": cb, "token_id": token_of(B)}, f"{short(B)} join (commit)")
call(A, "reveal", {"match_id": MID, "secret": sa}, f"{short(A)} reveal")
call(B, "reveal", {"match_id": MID, "secret": sb}, f"{short(B)} reveal")
print("\nduel:")
for step in range(1, 200):
    m = view("get_match", {"match_id": MID})
    g = m.get("game") or {}
    if m.get("status") == "Finished":
        print(f"\nmatch finished in {step-1} shots. score {g.get('score')}  hp {g.get('hp')}")
        break
    turn = g["turn"]
    shooter = A if turn == 0 else B
    load = g.get("load") or {}
    info = f"R{g.get('round')} hp {g.get('hp')} score {g.get('score')}"
    call(shooter, "fire", {"match_id": MID, "target": "Opponent"}, f"{short(shooter)} fires at opponent")
    print(f"      {info}")
else:
    print("match did not finish"); sys.exit(1)

json.dump({"contract": C, "match_id": MID, "txs": TXS}, open(TX_LOG, "w"), indent=1)
print(f"\n{len(TXS)} transactions, all signed with function-call keys. log: {TX_LOG}")
