<!--{"parent": "ajs.md", "order": 7}-->

# A Lean 4 specification of the AJS VM

**Status (2026-11-01): PROPOSED.** A spike after 0.14 ships and Pattern lands, so it can shape
the 1.0 VM ([`ajs-native-vm.md`](ajs-native-vm.md)) rather than arrive after it.

The AJS VM makes promises: a program can do nothing except call the capabilities it was given,
every run halts, and nothing is allocated before it is paid for. Today those promises are held by
tests, review rounds and ratchets. Most of the 0.14 release candidates went to finding doors
those methods missed. This proposal is to state the promises as theorems about a formal model of
the VM, prove them in [Lean 4](https://lean-lang.org), and test the shipping VM against that
model.

## The shape: Lean is the specification, not the VM

Lean is the reference semantics and the proofs. A separate implementation ships: the planned
Rust → wasm VM, and the JavaScript VM until then. The two are kept in agreement by
**differential testing**: the same programs run on the Lean interpreter and on the shipping VM,
and any difference is a bug in one of them.

AWS's Cedar authorization language is built this way. Its semantics and proofs are in Lean, and
its Rust implementation is tested against the Lean model by differential random testing. AJS is
unusually well placed to do the same, because the program is already DATA: the AST is versioned
JSON (`src/vm/ast-version.ts`, frozen by `src/vm/ast-fixtures/`). Both sides can read the same
programs with no parser in between.

Writing the shipping VM in Lean (Lean compiles to C, and C can reach wasm) is possible. It is not
proposed: Lean's runtime and its compiled output are not what a small, embeddable sandbox wants,
and keeping the specification readable matters more than making it fast.

## What can be proved, and what each theorem needs defined first

| Property | What has to be defined | Difficulty |
| --- | --- | --- |
| **No ambient authority.** Every effect a run has is a call to an injected capability, with arguments the program computed. | A small-step semantics whose effects are a TRACE of capability calls, and nothing else. | Low. It follows from the definition, which is the point: the design is what makes it true. |
| **Termination.** Every run halts. | Fuel as a natural number that every step decreases. | Low. |
| **Charge before allocation.** Nothing is allocated before it is charged; live memory stays under the ceiling. | A cost model for values (what `allocate()` charges), and a heap measure. | Medium. This is the invariant the rc.2 reviews kept circling (`docs/vm-budgets.md`); in Lean it is one step invariant rather than a convention checked door by door. |
| **No data leakage** (noninterference): labelled inputs cannot influence chosen outputs, such as one capability's data reaching another capability's arguments. | Labels, and a policy saying which flows are allowed. AJS has neither today. | High, and the definition is the real work. |
| **Minimality** of the instruction set: no instruction is expressible by the others. | The instruction set as a closed inductive type. | Medium. Provable, of limited value. |
| **Optimality.** | A cost model and an objective. | Not a theorem until both exist. Left out rather than claimed weakly. |

Two cautions about the leakage theorem:

- **Fuel is a channel.** What a run costs can depend on secret data, and the host can see the
  cost. A noninterference theorem must either treat cost as observable (and then prove that cost
  does not depend on secrets, which is rarely true) or explicitly exclude it. That choice is
  stated in the theorem, or the theorem promises more than it delivers.
- **Errors are a channel.** Which refusal ended a run, and its message, are outputs. The
  semantics has to model them, not just successful results.

## Where the gap is

A proof is about the model. Nearly every 0.14 blocker lived in the JavaScript the current VM
calls: string methods, the host regex engine, the JS object model (`docs/vm-budgets.md`, the
rc.2 reviews). A Lean model has none of that, so against today's VM it would prove things about
a VM we do not ship.

That is why this pairs with the Rust → wasm VM, whose point is that the AST executes with no
JavaScript invoked. Once the shipping VM calls no host builtins, the model and the implementation
can actually correspond, and differential testing covers what the proofs cannot reach.

What then remains trusted:

- the Lean kernel;
- the definitions, meaning that the theorems state what we actually care about (reviewed by
  people, which is where the effort belongs);
- the agreement between the Lean model and the Rust VM, established by testing, not proof;
- wasm's own sandbox;
- the host's capabilities, which are out of scope by design: a capability can do anything the
  host lets it.

## What it costs

The core is small: the expression nodes, the control-flow atoms (`seq`, `if`, `while`,
`try`), capability calls, fuel. Most of the work is the **method table** and the string
builtins, and above all the **regex engine** (`src/vm/regex.ts`). Pattern (`docs/pattern.md`)
replaces regex with a small grammar run as data, which removes the hardest part to model. That
is the argument for doing Pattern first.

## The spike

Small enough to stop cheaply if it goes badly.

1. **Model** the expression evaluator, `seq`, `if`, `while`, one capability call and fuel, over
   the v2 AST.
2. **Prove** termination and no ambient authority.
3. **Run** the golden fixtures (`src/vm/ast-fixtures/`) and the guest fuzzer's programs
   (`src/vm/guest-fuzz.test.ts`) on both the Lean interpreter and the current VM, and compare
   results, refusals and fuel.

What would end it: the definitions turn out too awkward to state the properties we care about,
or the two interpreters disagree in ways that show the model cannot follow the real semantics
without modelling the JavaScript underneath. Either finding is worth having before the 1.0 VM's
design is fixed.

What would make it worth continuing: the two theorems go through, and differential testing
finds a real disagreement in the current VM. That is the evidence the approach finds defects the
existing tests do not.

## Constraints this puts on 1.0 now

None beyond those in [`ajs-native-vm.md`](ajs-native-vm.md): the AST format is versioned and
frozen by fixtures, which is what lets a second interpreter read the same programs. Keeping the
semantics free of host-dependent behaviour (no host regex, no host string methods in the trust
path) is already the direction; it is also what keeps a formal model honest.
