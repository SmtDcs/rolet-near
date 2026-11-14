//! Parite vektör üreticisi (F3-3): kontratın saf `game.rs` motorunu çalıştırıp
//! `docs/near/schema/vectors.json` üretir. `src/` kodu değiştirilmez.
//!
//! Çalıştırma: `cd contracts/rolet-near && cargo test --test vectors_export -- --ignored`

use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json;
use rolet_near::config::Config;
use rolet_near::game::{
    deal_items, fire, new_deck, new_load, use_item, Action, GameError, GameState, Item, Load,
    Shell, ShellSource, Target,
};
use std::path::Path;

struct LocalScriptedSource {
    shells: Vec<Shell>,
    rolls: Vec<u32>,
    shell_idx: usize,
    roll_idx: usize,
}

impl LocalScriptedSource {
    fn new(shells: Vec<Shell>, rolls: Vec<u32>) -> Self {
        Self {
            shells,
            rolls,
            shell_idx: 0,
            roll_idx: 0,
        }
    }
}

impl ShellSource for LocalScriptedSource {
    fn draw(&mut self, _live_unfixed: u8, _blank_unfixed: u8) -> Shell {
        let s = self
            .shells
            .get(self.shell_idx)
            .copied()
            .expect("LocalScriptedSource: scripted shells exhausted");
        self.shell_idx += 1;
        s
    }

    fn roll(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        let v = self.rolls.get(self.roll_idx).copied().unwrap_or(0);
        self.roll_idx += 1;
        v % n
    }
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde", tag = "kind")]
enum VectorMove {
    Fire {
        actor: u8,
        target: Target,
    },
    UseItem {
        actor: u8,
        slot: u8,
        steal_slot: Option<u8>,
    },
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct VectorStep {
    #[serde(rename = "move")]
    mv: VectorMove,
    ok: bool,
    actions: Vec<Action>,
    error: Option<String>,
    state_after: GameState,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct VectorScenario {
    name: String,
    initial_state: GameState,
    shells: Vec<Shell>,
    rolls: Vec<u32>,
    steps: Vec<VectorStep>,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct VectorsFile {
    version: u32,
    config: Config,
    scenarios: Vec<VectorScenario>,
}

fn err_code(err: GameError) -> &'static str {
    match err {
        GameError::NotYourTurn => "NotYourTurn",
        GameError::NoShellsLeft => "NoShellsLeft",
        GameError::PositionOutOfRange => "PositionOutOfRange",
        GameError::SlotOutOfRange => "SlotOutOfRange",
        GameError::SlotEmpty => "SlotEmpty",
        GameError::SlotsFull => "SlotsFull",
        GameError::ItemBlocked => "ItemBlocked",
        GameError::HealBlocked => "HealBlocked",
        GameError::SawAlreadyActive => "SawAlreadyActive",
        GameError::AlreadyShackled => "AlreadyShackled",
        GameError::ShackleJustBroke => "ShackleJustBroke",
        GameError::MatchFinished => "MatchFinished",
    }
}

fn base_state(round: u8, load: Load, cfg: &Config) -> GameState {
    let rc = &cfg.rounds[(round - 1) as usize];
    GameState {
        round,
        score: [0, 0],
        hp: [rc.start_hp, rc.start_hp],
        max_hp: rc.start_hp,
        heal_cut: [false, false],
        items: [Vec::new(), Vec::new()],
        load,
        turn: 0,
        shackled: None,
        shackle_broke_this_turn: false,
        saw_active: false,
        deck_counts: new_deck(cfg.copies_per_item),
    }
}

fn run_scenario(
    name: &str,
    initial_state: GameState,
    shells: Vec<Shell>,
    rolls: Vec<u32>,
    moves: Vec<VectorMove>,
    cfg: &Config,
) -> VectorScenario {
    let mut state = initial_state.clone();
    let mut src = LocalScriptedSource::new(shells.clone(), rolls.clone());
    let mut steps = Vec::with_capacity(moves.len());

    for mv in moves {
        let res = match &mv {
            VectorMove::Fire { actor, target } => fire(&mut state, cfg, *actor, *target, &mut src),
            VectorMove::UseItem {
                actor,
                slot,
                steal_slot,
            } => use_item(&mut state, cfg, *actor, *slot, *steal_slot, &mut src),
        };
        match res {
            Ok(actions) => steps.push(VectorStep {
                mv,
                ok: true,
                actions,
                error: None,
                state_after: state.clone(),
            }),
            Err(e) => steps.push(VectorStep {
                mv,
                ok: false,
                actions: Vec::new(),
                error: Some(err_code(e).to_string()),
                state_after: state.clone(),
            }),
        }
    }

    VectorScenario {
        name: name.to_string(),
        initial_state,
        shells,
        rolls,
        steps,
    }
}

#[test]
#[ignore]
fn export_parity_vectors() {
    let cfg = Config::default();
    let mut scenarios = Vec::new();

    // 1. Ateş kuralları: kendine kuru (sıra kalır), rakibe dolu (hasar + sıra), kelepçe + testere zinciri
    {
        let mut st = base_state(1, Load::new(2, 3), &cfg);
        st.items[0] = vec![Item::Hacksaw, Item::Shackle];
        scenarios.push(run_scenario(
            "fire_hacksaw_and_shackle_chain",
            st,
            vec![Shell::Blank, Shell::Live, Shell::Blank, Shell::Blank, Shell::Live],
            vec![],
            vec![
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None }, // Hacksaw
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None }, // Shackle
                VectorMove::Fire { actor: 0, target: Target::SelfTarget },   // Blank self -> keeps turn & saw? wait: saw resets!
                VectorMove::Fire { actor: 0, target: Target::Opponent },     // Live opp (1 dmg) -> P1 TurnSkipped!
                VectorMove::Fire { actor: 0, target: Target::SelfTarget },   // Blank self -> keeps turn, shackle_broke_this_turn still true
                VectorMove::Fire { actor: 0, target: Target::Opponent },     // Blank opp -> turn passes to P1, shackle_broke cleared
                VectorMove::Fire { actor: 1, target: Target::Opponent },     // Live opp -> P0 takes 1 dmg, turn -> 0
            ],
            &cfg,
        ));
    }

    // 2. Eşya + lazy draw + Magnet + Ticker + Flask son fişek reload (ortak deste)
    {
        let mut st = base_state(2, Load::new(2, 2), &cfg);
        st.items[0] = vec![Item::Loupe, Item::Magnet, Item::Ticker, Item::Flask];
        st.items[1] = vec![Item::Flask];
        scenarios.push(run_scenario(
            "loupe_magnet_ticker_flask_reload",
            st,
            vec![Shell::Live, Shell::Live, Shell::Blank, Shell::Blank],
            vec![1, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8],
            vec![
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None }, // Loupe -> draws pos 0 = Live
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None }, // Magnet -> flips pos 0 to Blank
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None }, // Ticker -> roll(3)=1 -> pos 2 = Live
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None }, // Flask -> ejects pos 0 (Blank)
                VectorMove::Fire { actor: 0, target: Target::Opponent },     // fires pos 0 (was pos 1 = Blank) -> turn P1
                VectorMove::Fire { actor: 1, target: Target::Opponent },     // fires pos 0 (was pos 2 = Live) -> P0 dmg 1, turn P0
                VectorMove::Fire { actor: 0, target: Target::SelfTarget },   // last shell (Blank) -> reload!
            ],
            &cfg,
        ));
    }

    // 3. Pipe, Lockpick, Tincture (iyi/kötü), R3 HealCut
    {
        let mut st = base_state(3, Load::new(2, 2), &cfg);
        st.hp = [3, 4];
        st.items[0] = vec![Item::Pipe, Item::Lockpick, Item::Tincture, Item::Tincture];
        st.items[1] = vec![Item::Pipe, Item::Lockpick];
        scenarios.push(run_scenario(
            "pipe_lockpick_tincture_r3_heal_cut",
            st,
            vec![Shell::Blank],
            vec![10, 80, 80], // Tincture good (10 < 50), then two bad rolls (80 >= 50)
            vec![
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None },     // Pipe -> hp[0]=4
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: Some(0) },  // Lockpick steals P1 Pipe -> ItemBlocked (full hp)
                VectorMove::UseItem { actor: 0, slot: 1, steal_slot: None },     // Tincture good (roll 10) -> hp[0]=4 (Healed 0)
                VectorMove::UseItem { actor: 0, slot: 1, steal_slot: None },     // Tincture bad (roll 80) -> hp[0]=3
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: Some(0) },  // Lockpick steals P1 Pipe -> hp[0]=4
                VectorMove::Fire { actor: 0, target: Target::Opponent },         // Blank -> turn P1
            ],
            &cfg,
        ));
    }

    // 3b. R3 HealCut tetiklenmesi + sonrasında Pipe/Tincture HealBlocked
    {
        let mut st = base_state(3, Load::new(1, 1), &cfg);
        st.hp = [3, 4];
        st.items[0] = vec![Item::Tincture, Item::Pipe];
        scenarios.push(run_scenario(
            "r3_heal_cut_and_blocked",
            st,
            vec![],
            vec![80],
            vec![
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None }, // Tincture bad -> hp=2, HealCut
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None }, // Pipe -> HealBlocked
            ],
            &cfg,
        ));
    }

    // 4. R1/R2 round geçişi ve maç sonu + hata yolları
    {
        let mut init_src = LocalScriptedSource::new(vec![], vec![2, 0, 1, 2, 3, 4, 5, 6, 7]);
        let mut st = base_state(1, new_load(&cfg, &mut init_src), &cfg);
        let _ = deal_items(&mut st, &cfg, &mut init_src);
        st.hp = [2, 2];
        st.score = [1, 0]; // R1 zaten kazanılmış gibi: 2. galibiyet maçı bitirir
        st.items[0] = vec![Item::Hacksaw];
        scenarios.push(run_scenario(
            "round_and_match_end_plus_errors",
            st,
            vec![Shell::Live],
            vec![],
            vec![
                VectorMove::Fire { actor: 1, target: Target::Opponent },         // NotYourTurn
                VectorMove::UseItem { actor: 0, slot: 9, steal_slot: None },     // SlotOutOfRange
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None },     // Hacksaw
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None },     // SlotEmpty
                VectorMove::Fire { actor: 0, target: Target::Opponent },         // Live (2 dmg) -> RoundEnded + MatchEnded
                VectorMove::Fire { actor: 0, target: Target::Opponent },         // MatchFinished
            ],
            &cfg,
        ));
    }

    // 5. Round 1 -> Round 2 tam geçişi (kaybeden başlar)
    {
        let mut st = base_state(1, Load::new(1, 1), &cfg);
        st.hp = [1, 4];
        st.items[0] = vec![Item::Tincture];
        scenarios.push(run_scenario(
            "round1_to_round2_loser_starts",
            st,
            vec![],
            vec![99, 1, 0, 1, 2, 3, 4, 5, 6, 7],
            vec![
                VectorMove::UseItem { actor: 0, slot: 0, steal_slot: None }, // Tincture bad kills P0 -> P1 wins R1, P0 starts R2
            ],
            &cfg,
        ));
    }

    let out = VectorsFile {
        version: 1,
        config: cfg,
        scenarios,
    };

    let json = serde_json::to_string_pretty(&out).expect("vectors JSON serileşmeli");
    let out_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/near/schema/vectors.json");
    std::fs::write(&out_path, format!("{json}\n")).expect("vectors.json yazılmalı");
}
