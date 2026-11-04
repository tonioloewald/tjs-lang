<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 17, "requiresApi": true, "parent": "ajs-advanced.md"}-->

# Vision: OCR

Extract text from an image (requires vision model)

<!-- TODO review -->
Read the text in an image (a receipt, a sign, a scanned form) and return it as structured data.
It needs a vision-capable model, so on this site it prints a message instead of running. Locally
it needs the batteries (below), not just an `llm` capability.

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

<!-- TODO review -->
## What to notice

- **The image travels as data.** `httpFetch({ url, responseType: 'dataUrl' })` returns the image
  as a `data:image/…;base64,…` string, which the vision model receives inline. The agent never
  holds a file or a binary buffer, only a string.
- **`llmVision` is a battery atom.** It is not part of the core VM. The host registers it with
  `new AgentVM(batteryAtoms)` and supplies the `llmBattery` capability; the core `llm`
  capability is not enough.
- **It returns a chat message, not a string.** The text is in `result.content`, which is why
  this agent parses `result.content` rather than `result`.
- **Amounts are strings on purpose.** A receipt's `$4.50` is text until you decide how to parse
  it, and an example of `''` keeps the model from inventing a number format.

<!-- TODO review -->
## Running it locally

`/photo-2.jpg` is a sample image the playground served. Pass the URL of an image on a domain
your fetch allows:

```javascript
import { AgentVM, batteryAtoms, getBatteries, transpile } from 'tjs-lang'

const vm = new AgentVM(batteryAtoms)
const batteries = await getBatteries() // finds a local LM Studio and its models
const { ast } = transpile(source, { atoms: vm.atoms })
const run = await vm.run(
  ast,
  { imageUrl: 'https://images.example.com/receipt.jpg' },
  {
    fuel: 1000,
    capabilities: batteries,
    context: { allowedFetchDomains: ['images.example.com'] },
  }
)
```

<!-- TODO review -->
## Limits

A photo is large, and a data URL is a third larger again. Every value crossing into the VM is
copied under a size cap (`membraneMaxBytes`, 4 MB by default), so a big image is refused before it
is copied; raise the cap for the run if you expect large images, or resize them first. A vision
call costs 150 units of fuel and may take up to two minutes before it times out.
