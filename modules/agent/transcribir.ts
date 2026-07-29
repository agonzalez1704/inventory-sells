import "server-only";

// Transcribe WhatsApp voice notes with OpenAI Whisper. We call the REST endpoint
// directly with a multipart file whose FILENAME carries the right extension —
// OpenAI decides the format from that, and without it Whisper 400s ("Invalid
// file format") even for supported types (ogg/m4a). WhatsApp sends audio/ogg
// (opus), which Whisper accepts.
const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1";

const EXT: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/oga": "oga",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
};

export async function transcribirAudio(
  bytes: Uint8Array,
  mediaType: string,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const mime = (mediaType || "audio/ogg").split(";")[0].trim().toLowerCase();
  const ext = EXT[mime] ?? "ogg";
  try {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart], { type: mime }), `nota.${ext}`);
    form.append("model", MODEL);
    form.append("language", "es");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      console.error("Transcripción de audio falló:", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { text?: string };
    const t = (data.text ?? "").trim();
    return t || null;
  } catch (err) {
    console.error("Transcripción de audio falló:", err);
    return null;
  }
}
