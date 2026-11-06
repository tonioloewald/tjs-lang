<!--{"parent": "ajs.md", "order": 14}-->
<!-- TODO review -->

# A Lean 4 specification of the AJS VM

> **Status (2026-11-01): PROPOSED.** Nothing in this chapter changes how you use AJS today. It is
> a research proposal for how the VM's safety promises could be proved rather than only tested.
> If you are embedding the VM or writing agents now, the promises below already hold, by testing;
> this page is about proving them later.

The plan is a short, time-boxed experiment (a spike) after 0.14 ships and after Pattern, the
proposed replacement for regex described under "What it costs", lands. That timing lets it shape
the 1.0 VM ([`ajs-native-vm.md`](ajs-native-vm.md)) rather than arrive after it.

The AJS VM makes promises: a program can do nothing except call the capabilities it was given,
every run halts, and nothing is allocated before it is paid for. Today those promises are held by
tests and review. Most of the 0.14 release candidates were spent finding places where untrusted
code could reach host behaviour or allocate memory it had not paid for, places the tests had
missed. This proposal is to state the promises as theorems about a formal model of the VM (a
precise definition of how it behaves), prove them in [Lean 4](https://lean-lang.org), and test
the shipping VM against that model.

Lean 4 is a programming language and proof assistant: you write a definition of how the VM
behaves, state properties of it as theorems, and the Lean kernel checks the proofs mechanically.

**The shipping VM itself will not be proved.** It will be tested against a proved model.

## The shape: Lean is the specification, not the VM

Lean is the reference semantics and the proofs. A separate implementation ships: the planned
Rust → wasm VM, and the JavaScript VM until then. The two are kept in agreement by
**differential testing**. Lean definitions are executable, so the specification is also an
interpreter: the same programs run on it and on the shipping VM, and any difference is a bug in
one of them.

AWS's Cedar authorization language is built this way. Its semantics and proofs are in Lean, and
its Rust implementation is tested against the Lean model by differential random testing. AJS is
unusually well placed to do the same, because the program is already DATA: the AST is versioned
JSON (`src/vm/ast-version.ts`, frozen by `src/vm/ast-fixtures/`). Both sides can read the same
programs with no parser in between, so a disagreement can only come from the two interpreters,
never from two parsers reading the source differently.

Writing the shipping VM in Lean (Lean compiles to C, and C can reach wasm) is possible. It is not
proposed: Lean's runtime and its compiled output are not what a small, embeddable sandbox wants,
and keeping the specification readable matters more than making it fast.

## What can be proved, and what each theorem needs defined first

| Property | What has to be defined | Difficulty |
| --- | --- | --- |
| **No ambient authority.** Every effect a run has is a call to an injected capability, with arguments the program computed. | A small-step semantics (a definition of what one execution step does) whose effects are a TRACE of capability calls, and nothing else. | Low. It follows from the definition, which is the point: the design is what makes it true. The hard part is showing the shipping VM matches the model (see "Where the gap is"). |
| **Termination.** Every run halts. | Fuel as a natural number that every step decreases (the VM's fractional costs scaled to integer units, which differential testing also needs in order to compare fuel exactly). | Low. |
| **Charge before allocation.** Nothing is allocated before it is charged; live memory stays under the ceiling. | A rule for how many bytes each value costs, and a way to measure how much memory a run holds at once. | Medium. This is the invariant the 0.14 reviews kept returning to (`docs/vm-budgets.md`). In Lean it is a step invariant, a property every execution step preserves, so proving it once for each kind of step covers every program, instead of checking each allocation site by hand. |
| **No data leakage** (noninterference): labelled inputs cannot influence chosen outputs, such as one capability's data reaching another capability's arguments: an agent given `store` (private) and `fetch` (public) cannot put store contents into a fetch URL. | Labels, and a policy saying which flows are allowed. AJS has neither today. | High, and the definition is the real work. |
| **Minimality** (asked for) of the instruction set: no instruction is expressible by the others. | The instruction set as a closed inductive type. | Medium. Provable, of limited value. |
| **Optimality** (asked for), for example fuel costs that track real work as closely as possible. | A cost model and an objective. | Not a theorem until both exist. Left out rather than claimed weakly. |

Two cautions about the leakage theorem:

- **Fuel is a channel.** What a run costs can depend on secret data, and the host can see the
  cost (a loop that runs once per character of a secret reveals its length in fuel used). A
  noninterference theorem must either treat cost as observable (and then prove that cost
  does not depend on secrets, which is rarely true) or explicitly exclude it. That choice is
  stated in the theorem, or the theorem promises more than it delivers.
- **Errors are a channel.** Which refusal ended a run, and its message, are outputs. The
  semantics has to model them, not just successful results.

## Where the gap is

A proof is about the model. Nearly every 0.14 blocker lived in the JavaScript the current VM
calls: string methods, the host regex engine, the JS object model (`docs/vm-budgets.md`). A Lean
model has none of that, so its proofs would not transfer to today's VM: they would be about a VM
we do not ship. Differential testing against today's VM is still useful for finding bugs, which
is what the spike does.

That is why this pairs with the Rust → wasm VM, whose point is that the AST executes with no
JavaScript invoked. Once the shipping VM calls no host builtins, the model and the implementation
can actually correspond, and differential testing covers what the proofs cannot reach.

What then remains trusted:

- the Lean kernel;
- the definitions, meaning that the theorems state what we actually care about (reviewed by
  people, which is where the effort belongs);
- **the agreement between the Lean model and the Rust VM, established by testing, not proof;**
- wasm's own sandbox;
- the host's capabilities, which are out of scope by design: a capability can do anything the
  host lets it.

## What it costs

The core is small: the expression nodes, the control-flow atoms (`seq`, `if`, `while`,
`try`), capability calls, fuel. Most of the work is the **method table** (the string, array and
other methods a guest program may call) and the string builtins, and above all the **regex
engine** (`src/vm/regex.ts`). No effort estimate exists yet; producing one is part of what the
spike is for. Pattern (`docs/pattern.md`, also proposed) would replace regex with a small grammar
run as data, which removes the hardest part to model. That is the argument for doing Pattern
first.

The same approach is proposed for Pattern itself, in tosijs-pattern (`docs-src/formal.md`): it is
smaller and pure, every claim it makes is precise, and it becomes this VM's matching builtin, so
its proofs would be a component of these. Prior art for the regex side of both: Warblre, an
executable mechanization (a formalization a machine can check) of ECMAScript 2023 regexes in
Rocq, the proof assistant formerly called Coq (De Santo, Barrière and Pit-Claudel, ICFP 2024).

## The spike

Small enough to stop cheaply if it goes badly. It has no timebox or owner yet.

1. **Model** the expression evaluator, `seq`, `if`, `while`, one capability call and fuel, over
   the v2 AST.
2. **Prove** termination and no ambient authority.
3. **Run** the golden fixtures (`src/vm/ast-fixtures/`) and the guest fuzzer's programs
   (`src/vm/guest-fuzz.test.ts`, a generator of random AJS programs used in the test suite) on
   both the Lean interpreter and the current VM, and compare
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
