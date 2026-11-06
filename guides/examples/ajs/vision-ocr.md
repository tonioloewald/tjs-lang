<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 17, "requiresApi": true, "parent": "ajs-advanced.md"}-->
<!-- TODO review -->

# Vision: OCR

Read the text in an image (a receipt, a sign, a scanned form) and return it as structured data.

It needs a vision-capable model. The tjs.tosijs.net doc site has no model, so there the example
does not run; it shows "This example needs an LLM, which the static site does not provide",
which is the expected result, not a failure. Locally it needs the **batteries**: tjs-lang's
ready-made atoms and capabilities for a local OpenAI-compatible model server such as LM Studio.
[Running it locally](#running-it-locally) shows the setup.

```ajs:inline
function extractText({ imageUrl = '/photo-2.jpg' }) {
  // Fetch image as data URL for vision model
  let image = httpFetch({ url: imageUrl, responseType: 'dataUrl' })

  // Use Schema.response for structured output
  let schema = Schema.response('ocr_result', {
    text: '',
    items: [{ description: '', amount: '' }],
  })

  let result = llmVision({
    prompt:
      'Extract all text from this image. If it is a receipt, list the items and amounts.',
    images: [image],
    responseFormat: schema,
  })

  let parsed = JSON.parse(result.content)
  return { imageUrl, extracted: parsed }
}
```

The default image, `/photo-2.jpg`, is a Finnish train-station receipt served by the doc site. Run
locally against its absolute URL (see below), the agent returns something shaped like this; the
exact text depends on the model:

```javascript
{
  imageUrl: 'https://tjs.tosijs.net/photo-2.jpg',
  extracted: {
    text: 'AVECRA TRAIN & STATION CATERING ... Yhteensä EUR 10,20 ...',
    items: [
      { description: 'RV.Hot dog nakilla', amount: '6,90' },
      { description: 'Coca-Cola Zero 0,5L', amount: '3,30' },
    ],
  },
}
```

## What to notice

- **The image travels as data.** `httpFetch({ url, responseType: 'dataUrl' })` returns the image
  as a `data:image/…;base64,…` string, which the vision model receives inline. The agent never
  holds a file or a binary buffer, only a string.
- **`images` is a list.** It takes one or more images, each a base64 data URL or an `http(s)`
  URL. An `http(s)` URL is fetched by the model server, so it must be on the run's fetch
  allowlist too; a data URL always passes. See [llmVision](/ajs-atoms/#llmvision).
- **`llmVision` returns a chat message, not a string.** The text is in `result.content`, which
  is why this agent parses `result.content` rather than `result`.
- **`Schema.response(name, example)` describes the answer by example.** It builds the
  OpenAI-style `{ type: 'json_schema', json_schema: { name, strict, schema } }` value that
  `responseFormat` takes. The example values stand for types: `''` means a string, and
  `[{ description: '', amount: '' }]` means an array of objects with two string fields.
  `'ocr_result'` is the schema's name as the model API sees it.
- **Amounts are strings on purpose.** The receipt above writes `6,90` with a decimal comma. With
  `''` as the example the amount arrives exactly as printed, and you decide how to parse it. An
  example of `0.0` would ask for a number, and the model would have to guess what `6,90` means.
- **`responseFormat` is a request, not a guarantee.** Some local models ignore it, and the reply
  is not checked against the schema. If `result.content` is not JSON, `JSON.parse` fails and the
  run ends with an error value (`JSON Parse error: …`) instead of a half-filled result. A
  `try`/`catch` around the parse would let the agent handle it. Valid JSON in the wrong shape
  passes straight through; to refuse it, check it before returning:

  ```javascript
  if (!Schema.isValid(parsed, schema.json_schema.schema)) {
    return { error: 'reply does not match ocr_result' }
  }
  ```

## Running it locally

This part is for the host: the program that embeds the VM and runs the agent.

`llmVision` is a **battery atom**, not part of the core VM, so the host registers it with
`new AgentVM(batteryAtoms)`. It reads the `llmBattery` capability, which `getBatteries()`
supplies. The core `llm` capability is not enough: its `predict` takes a text prompt and has
nowhere to put an image.

`/photo-2.jpg` is relative, so outside the doc site it is `Invalid URL`. Pass an absolute URL on
a domain the run allows. In the code below, `source` is the agent above, as a string.

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM, batteryAtoms } from 'tjs-lang/vm-ast'
import { getBatteries } from 'tjs-lang/batteries'

const vm = new AgentVM(batteryAtoms)
const batteries = await getBatteries() // probes the local model server (TJS_LLM_BASE_URL)
// `atoms` tells the transpiler that llmVision exists, so it can check the call's inputs
const { ast } = transpile(source, { atoms: vm.atoms })
const run = await vm.run(
  ast,
  { imageUrl: 'https://tjs.tosijs.net/photo-2.jpg' },
  {
    fuel: 1000,
    capabilities: batteries,
    context: { allowedFetchDomains: ['tjs.tosijs.net'] },
  }
)
console.log(run.error ?? run.result)
```

The two options do opposite jobs. `capabilities` is the IO the host gives the agent: here, the
model server and a store. `context.allowedFetchDomains` restricts: the built-in `httpFetch`
fetches nothing without it, and only from the domains it lists. The full rules are in
[Fetch policy](/ajs-host/#fetch-policy); what `getBatteries()` returns is in
[the batteries](/ajs-capabilities/#llmbattery-and-vector-the-batteries).

When something is missing, the run ends with an error value:

- **No model server reachable.** `getBatteries()` sets `llmBattery` to `null`, and the run ends
  with `Capability 'llmBattery' missing or invalid.`
- **A server, but no vision model.** The batteries do not pick a vision model for you: a call
  with `responseFormat` goes to the first model that passed the structured-output probe. If that
  model cannot read images, the server's refusal comes back as `LLM Error: <status> …`, or the
  model answers without having seen the image. Load a vision-capable model in LM Studio and name
  it with `TJS_LLM_MODEL`; see [LM Studio setup](/lm-studio-setup/). mlx-omni-server does not handle
  vision yet ([MLX setup](/mlx-setup/)).
- **The domain is not on the list.** `Fetch blocked: domain not in allowlist`.
- **The fetch returns something that is not an image** (a 404 page, for example). `httpFetch`
  hands back a data URL of that body, and `llmVision` refuses it:
  `llmVision: an inline image must be base64 image data (data:image/...;base64,...)`.

## Limits

A photo is large, and a data URL is a third larger again: the 107 KB sample image becomes a
143 KB string. The fetched body, and every value crossing the membrane (the boundary every value
crosses between the host and the agent), is held to a size cap, `membraneMaxBytes`, 4 MB by
default. A larger one is refused rather than copied. For large images, resize them first or raise
the cap in the `vm.run` options, for example `membraneMaxBytes: 16 * 1024 * 1024`.

Fuel is the VM's work budget: every step costs some, and the run stops at `Out of Fuel`. One run
of this agent uses about 185 fuel, most of it the vision call (150), so `fuel: 1000` is ample.
Fuel does not measure waiting. The vision call may take up to two minutes before it times out,
and the run's own timeout covers that: without `timeoutMs`, a run gets twice the slowest
registered atom's timeout, four minutes on a VM with the battery atoms. To change either, pass
`timeoutMs` (the whole run) or `timeoutOverrides: { llmVision: 180_000 }` (that atom) to
`vm.run`.

The model reads whatever the image says, including text written to look like instructions.
Treat the extracted text as data; see [Vision: Classification](vision-classification.md) for the
same caution applied to a decision.
