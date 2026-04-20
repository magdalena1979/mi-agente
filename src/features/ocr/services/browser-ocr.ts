import Tesseract from 'tesseract.js'

export async function extractTextFromImage(
  image: File | Blob,
  language = 'spa+eng',
) {
  const result = await Tesseract.recognize(image, language)
  return result.data.text.trim()
}
