<!--{"section":"ajs","type":"example","group":"advanced","order":18,"requiresApi":true}-->

# Vision: Classification

Classify and describe an image (requires vision model)

```javascript
function classifyImage({ imageUrl = '/photo-1.jpg' }) {
  // Fetch image as data URL
  let image = httpFetch({ url: imageUrl, responseType: 'dataUrl' })

  // Schema for classification result
  let schema = Schema.response('image_classification', {
    category: '',
    subject: '',
    description: '',
    tags: [''],
    confidence: ''
  })

  let result = llmVision({
    prompt: 'Classify this image. Identify the main subject, provide a brief description, and list relevant tags.',
    images: [image],
    responseFormat: schema
  })

  let parsed = JSON.parse(result.content)
  return { imageUrl, classification: parsed }
}
```
