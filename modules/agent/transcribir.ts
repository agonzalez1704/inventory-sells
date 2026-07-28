import "server-only";
import { experimental_transcribe as transcribe } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// Transcribe WhatsApp voice notes with OpenAI Whisper. Whisper accepts WhatsApp's
// audio/ogg (opus), so no format conversion is needed.
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1";

export async function transcribirAudio(
  bytes: Uint8Array,
  _mediaType: string, // Whisper infers the format; kept for signature compat.
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const { text } = await transcribe({
      model: openai.transcription(MODEL),
      audio: bytes,
      providerOptions: { openai: { language: "es" } },
    });
    const t = text.trim();
    return t || null;
  } catch (err) {
    console.error("Transcripción de audio falló:", err);
    return null;
  }
}
