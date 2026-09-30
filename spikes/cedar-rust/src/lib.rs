//! The Rust half of ADR-Q-009's "one engine, two places, same answer".
//!
//! Loads an action chain [core, …derived] exported by packages/q-actions,
//! checks each parent hash with the same canonical JSON + SHA-256 as q-core,
//! and decides with Cedar. This crate is what a Spin component on a node
//! wraps (spikes/cedar-spin).

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use cedar_policy::{
    Authorizer, Context, Decision, Entities, EntityUid, Policy, PolicyId, PolicySet, Request,
    Schema, ValidationMode, Validator,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::str::FromStr;

/// q-core's canonical(): keys sorted, no whitespace. (Written out by hand so a
/// serde_json feature switched on by another crate can't change key order.)
pub fn canonical(v: &Value) -> String {
    match v {
        Value::Object(m) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .iter()
                .map(|k| format!("{}:{}", serde_json::to_string(k).unwrap(), canonical(&m[*k])))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        Value::Array(a) => format!("[{}]", a.iter().map(canonical).collect::<Vec<_>>().join(",")),
        _ => serde_json::to_string(v).unwrap(),
    }
}

/// q-actions' hashAction().
pub fn hash_action(def: &Value) -> String {
    let digest = Sha256::digest(canonical(def).as_bytes());
    format!("action:sha256:{}", URL_SAFE_NO_PAD.encode(digest))
}

pub struct Loaded {
    pub hash: String,
    schema: Schema,
    policies: PolicySet,
    action: EntityUid,
}

fn uid(type_name: &str, id: &str) -> Result<EntityUid, String> {
    EntityUid::from_str(&format!("{}::{}", type_name, serde_json::to_string(id).unwrap()))
        .map_err(|e| format!("bad entity {type_name}/{id}: {e}"))
}

/// Load a chain. Every problem is reported at once, as in engine.ts.
pub fn load(chain: &Value) -> Result<Loaded, Vec<String>> {
    let mut problems = Vec::new();
    let defs = chain.as_array().ok_or_else(|| vec!["A chain is a list.".to_string()])?;
    if defs.is_empty() {
        return Err(vec!["Nothing to load.".into()]);
    }
    let mut hashes = Vec::new();
    for (i, d) in defs.iter().enumerate() {
        hashes.push(hash_action(d));
        if i > 0 && d["parent"].as_str() != Some(hashes[i - 1].as_str()) {
            problems.push(format!("{}: its parent hash does not match the action before it.", d["by"]));
        }
        if d["engine"]["cedar"].as_str() != Some(cedar_policy::get_sdk_version().to_string().as_str()) {
            problems.push(format!(
                "{}: written for Cedar {}, but this engine is Cedar {}.",
                d["by"], d["engine"]["cedar"], cedar_policy::get_sdk_version()
            ));
        }
    }
    let facts = defs[0]["facts"].as_str().unwrap_or("");
    let schema = match Schema::from_cedarschema_str(facts) {
        Ok((s, _warnings)) => Some(s),
        Err(e) => {
            problems.push(format!("The facts could not be read: {e}"));
            None
        }
    };
    let mut policies = PolicySet::new();
    for d in defs {
        if let Some(rules) = d["rules"].as_object() {
            for (rid, rule) in rules {
                if rule["checked"] != "enforced" {
                    continue;
                }
                let text = rule["policy"].as_str().unwrap_or("");
                match Policy::parse(Some(PolicyId::new(rid)), text) {
                    Ok(p) => {
                        if let Err(e) = policies.add(p) {
                            problems.push(format!("Rule \"{rid}\": {e}"));
                        }
                    }
                    Err(e) => problems.push(format!("Rule \"{rid}\" could not be read: {e}")),
                }
            }
        }
    }
    let Some(schema) = schema else { return Err(problems) };
    let v = Validator::new(schema.clone()).validate(&policies, ValidationMode::default());
    for e in v.validation_errors() {
        problems.push(format!("A rule does not fit the facts: {e}"));
    }
    let id = defs[0]["id"].as_str().unwrap_or("");
    let action = match uid("Action", id) {
        Ok(a) => a,
        Err(e) => {
            problems.push(e);
            return Err(problems);
        }
    };
    if !problems.is_empty() {
        return Err(problems);
    }
    Ok(Loaded { hash: hashes.pop().unwrap(), schema, policies, action })
}

pub struct Answer {
    pub holds: bool,
    pub rules: Vec<String>,
}

/// Decide one receipt from its facts. Facts that don't fit are a refusal.
pub fn decide(l: &Loaded, principal: &Value, resource: &Value, facts: &Value) -> Result<Answer, String> {
    let p = uid(principal["type"].as_str().unwrap_or(""), principal["id"].as_str().unwrap_or(""))?;
    let r = uid(resource["type"].as_str().unwrap_or(""), resource["id"].as_str().unwrap_or(""))?;
    let ctx = Context::from_json_value(facts.clone(), Some((&l.schema, &l.action)))
        .map_err(|e| format!("The facts do not fit: {e}"))?;
    let req = Request::new(p, l.action.clone(), r, ctx, Some(&l.schema))
        .map_err(|e| format!("The request does not fit: {e}"))?;
    let resp = Authorizer::new().is_authorized(&req, &l.policies, &Entities::empty());
    if resp.diagnostics().errors().next().is_some() {
        return Err("A rule could not be evaluated.".into());
    }
    let mut rules: Vec<String> = resp.diagnostics().reason().map(|id| id.to_string()).collect();
    rules.sort();
    Ok(Answer { holds: resp.decision() == Decision::Allow, rules })
}
