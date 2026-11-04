<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 18, "requiresApi": true, "parent": "ajs-advanced.md"}-->

# Vision: Classification

Classify and describe an image (requires vision model)

<!-- TODO review -->
Sort images into categories, tag them for search, or describe them for people who cannot see
them. It needs a vision-capable model, so on this site it prints a message instead of running;
run it locally with the batteries, as in [Vision: OCR](/vision-ocr/).

```ajs:inline
function classifyImage({ imageUrl = '/photo-1.jpg' }) {
  // Fetch image as data URL
  let image = httpFetch({ url: imageUrl, responseType: 'dataUrl' })

  // Schema for classification result
  let schema = Schema.response('image_classification', {
    category: '',
    subject: '',
    description: '',
    tags: [''],
    confidence: '',
  })

  let result = llmVision({
    prompt:
      'Classify this image. Identify the main subject, provide a brief description, and list relevant tags.',
    images: [image],
    responseFormat: schema,
  })

  let parsed = JSON.parse(result.content)
  return { imageUrl, classification: parsed }
}
```

<!-- TODO review -->
## What to notice

- **Free-form categories drift.** With `category: ''` the model invents a new word for the same
  thing from one image to the next. If you will group or filter on it, close the set (variation
  below).
- **`confidence` is the model's own opinion of itself**, as text. Treat it as a hint, not a
  probability.
- **The same shape as OCR.** Fetch as a data URL, ask `llmVision` with a schema, parse
  `result.content`. Only the prompt and the schema change.

<!-- TODO review -->
## A variation

A fixed set of categories, with `Schema.enum`, and a yes/no question the program can act on:

```javascript
function screenImage({ imageUrl = 'https://images.example.com/upload.jpg' }) {
  let image = httpFetch({ url: imageUrl, responseType: 'dataUrl' })
  let schema = Schema.response(
    'screening',
    Schema.object({
      category: Schema.enum(['person', 'animal', 'landscape', 'document', 'other']),
      containsText: Schema.boolean,
      altText: Schema.string,
    })
  )
  let result = llmVision({
    prompt: 'Categorize this image and write one sentence of alt text for it.',
    images: [image],
    responseFormat: schema,
  })
  let screening = JSON.parse(result.content)
  return { imageUrl, screening, needsOcr: screening.containsText }
}
```

<!-- TODO review -->
## The gotcha

The image a model sees is the image the agent fetched, so the same trust rules apply as to text:
an image can contain written instructions, and a model may follow them. Decide what happens next
in code (`needsOcr` above), not by asking the model what to do.
