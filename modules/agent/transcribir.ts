import "server-only";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Transcribe WhatsApp voice notes via OpenRouter. We only have an OpenRouter
// key (no OpenAI/Whisper), so we use an audio-capable multimodal model: Gemini
// Flash accepts audio input (incl. WhatsApp's audio/ogg + opus) cheaply.
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL = process.env.OPENROUTER_TRANSCRIBE_MODEL ?? "google/gemini-2.5-flash";

export async function transcribirAudio(
  bytes: Uint8Array,
  mediaType: string,
): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;
  // Drop codec params ("audio/ogg; codecs=opus" -> "audio/ogg").
  const mime = mediaType.split(";")[0].trim() || "audio/ogg";
  try {
    const { text } = await generateText({
      model: openrouter(MODEL),
      maxOutputTokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe esta nota de voz en español. Devuelve SOLO el texto dicho, sin comentarios ni descripciones. Es un cliente de una tienda de celulares preguntando por precio o disponibilidad de productos (pantallas, baterías, refacciones).",
            },
            { type: "file", mediaType: mime, data: bytes },
          ],
        },
      ],
    });
    const t = text.trim();
    return t || null;
  } catch (err) {
    console.error("Transcripción de audio falló:", err);
    return null;
  }
}
