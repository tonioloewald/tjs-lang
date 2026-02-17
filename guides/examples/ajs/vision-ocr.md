<!--{"section":"ajs","type":"example","group":"advanced","order":17,"requiresApi":true}-->

# Vision: OCR

Extract text from an image (requires vision model)

```ajs
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
