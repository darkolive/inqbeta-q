//! cargo run --release
//!
//! Reads money-spend.actions.json (exported by packages/q-actions, including
//! what the WASM engine decided for every case) and checks that Rust:
//!   1. computes the same action hashes,
//!   2. reaches the same decision on every case,
//!   3. names exactly the same rules,
//! then times warm decisions.

use cedar_rust::{decide, hash_action, load};
use serde_json::Value;
use std::time::Instant;

fn main() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/money-spend.actions.json");
    let data: Value = serde_json::from_str(&std::fs::read_to_string(path).expect("run the q-actions export first"))
        .expect("valid JSON");
    println!("Cedar (Rust) {}  vs  exported from WASM Cedar {}", cedar_policy::get_sdk_version(), data["cedar"]);

    let mut failed = 0;
    let mut loaded = std::collections::BTreeMap::new();
    for key in ["core", "club"] {
        let c = &data["chains"][key];
        let own = hash_action(c["chain"].as_array().unwrap().last().unwrap());
        let same = own == c["hash"].as_str().unwrap();
        if !same {
            failed += 1;
        }
        println!("{} hash {key}: {own}", if same { "ok  " } else { "FAIL" });
        match load(&c["chain"]) {
            Ok(l) => {
                loaded.insert(key, l);
            }
            Err(p) => {
                failed += 1;
                println!("FAIL load {key}: {}", p.join(" | "));
            }
        }
    }
    if loaded.len() < 2 {
        std::process::exit(1);
    }

    for e in data["expected"].as_array().unwrap() {
        let mut line = Vec::new();
        let mut ok = true;
        for key in ["core", "club"] {
            let a = decide(&loaded[key], &data["principal"], &data["resource"], &e["facts"]).expect("decides");
            let want_holds = e[key]["holds"].as_bool().unwrap();
            let want_rules: Vec<String> =
                e[key]["rules"].as_array().unwrap().iter().map(|r| r.as_str().unwrap().to_string()).collect();
            if a.holds != want_holds || a.rules != want_rules {
                ok = false;
                line.push(format!("{key}: rust {} {:?} / wasm {} {:?}", a.holds, a.rules, want_holds, want_rules));
            } else {
                line.push(format!("{key}={}", if a.holds { "holds" } else { "refused" }));
            }
        }
        if !ok {
            failed += 1;
        }
        println!("{} {}: {}", if ok { "ok  " } else { "FAIL" }, e["name"].as_str().unwrap(), line.join("  "));
    }

    let facts = &data["expected"][0]["facts"];
    let n = 20_000;
    let t0 = Instant::now();
    for _ in 0..n {
        decide(&loaded["club"], &data["principal"], &data["resource"], facts).unwrap();
    }
    let per = t0.elapsed().as_secs_f64() * 1000.0 / n as f64;
    println!("\n{per:.4} ms per decision (native Rust, warm, {n} runs)");

    if failed > 0 {
        println!("{failed} failed");
        std::process::exit(1);
    }
    println!("Rust and WASM agree on every hash, decision and rule.");
}
