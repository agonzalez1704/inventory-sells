import "server-only";
import { createOpenAI } from "@ai-sdk/openai";

// The app's AI model (assistant, invoice reading, requisition criteria,
// inventory import), on the shop's own OpenAI key. OpenRouter was dropped
// when its key hit its spend cap and all four went silent.
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const modeloIA = openai(process.env.OPENAI_ASISTENTE_MODEL ?? "gpt-4.1");

// OpenAI's strict JSON schema refuses optional fields ("'required' must
// include every key"), and these schemas and tools have them.
export const opcionesIA = { openai: { strictJsonSchema: false } };
