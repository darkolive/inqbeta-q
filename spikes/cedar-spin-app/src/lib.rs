//! A Spin HTTP component that decides money.spend receipts on a node, with
//! the same crate (and so the same Cedar) as spikes/cedar-rust.
//!
//!   POST /decide   { "chain": "core" | "club", "principal": {...}, "resource": {...}, "facts": {...} }
//!   →              { "holds": bool, "rules": [ids], "action": "action:sha256:…" }
//!
//! Written for Spin 4.1 / spin-sdk 7 (async handlers, WASI 0.3). Everything
//! that matters is in cedar_rust::{load, decide}; this file is only the door.

use cedar_rust::{decide, load, Loaded};
use serde_json::{json, Value};
use spin_sdk::http::body::IncomingBodyExt;
use spin_sdk::http::{IntoResponse, Request, Response};
use spin_sdk::http_service;
use std::sync::OnceLock;

static ACTIONS: &str = include_str!("../../cedar-rust/money-spend.actions.json");
static LOADED: OnceLock<Result<(Loaded, Loaded), String>> = OnceLock::new();

fn loaded() -> &'static Result<(Loaded, Loaded), String> {
    LOADED.get_or_init(|| {
        let data: Value = serde_json::from_str(ACTIONS).map_err(|e| e.to_string())?;
        let core = load(&data["chains"]["core"]["chain"]).map_err(|p| p.join(" "))?;
        let club = load(&data["chains"]["club"]["chain"]).map_err(|p| p.join(" "))?;
        Ok((core, club))
    })
}

fn reply(status: u16, body: Value) -> anyhow::Result<Response<String>> {
    Ok(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(body.to_string())?)
}

#[http_service]
async fn handle(req: Request) -> anyhow::Result<impl IntoResponse> {
    let (core, club) = match loaded() {
        Ok(pair) => (&pair.0, &pair.1),
        Err(e) => return reply(500, json!({ "refused": e })),
    };
    let bytes = match req.into_body().bytes().await {
        Ok(b) => b,
        Err(e) => return reply(400, json!({ "refused": format!("Could not read the request: {e:?}") })),
    };
    let ask: Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(e) => return reply(400, json!({ "refused": format!("Not JSON: {e}") })),
    };
    let action = if ask["chain"] == "club" { club } else { core };
    match decide(action, &ask["principal"], &ask["resource"], &ask["facts"]) {
        Ok(a) => reply(200, json!({ "holds": a.holds, "rules": a.rules, "action": action.hash })),
        Err(e) => reply(422, json!({ "refused": e })),
    }
}
