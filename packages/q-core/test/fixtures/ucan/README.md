# UCAN test vectors

Copied unchanged so q-core can prove it speaks UCAN the same way as everyone else.

| File | From | Licence |
|---|---|---|
| `delegation.json`, `invocation.json`, `policy.json` | github.com/ucan-wg/spec `fixtures/1.0.0` (commit 9955aa1) | MIT (fixtures) under the Community Specification License 1.0 |
| `go-ucan-delegation.json` | github.com/ucan-wg/go-ucan `token/delegation/testdata/interop_delegation.json` (commit 46ec5c6) | Apache-2.0 OR MIT |
| `container-*` | github.com/ucan-wg/container `testvectors` | MIT under the Community Specification License 1.0 |

**One change:** upstream `policy.json` is not valid JSON — the `newsletters` case has a
stray pair of braces (`{ { "christmas": … } }`). Our copy removes them, leaving
`newsletters` as a map, which is what the `all` quantifier over it is testing.
