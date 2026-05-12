import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

let openaiInstance: OpenAI | null = null;

function getOpenAI() {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "dummy_key",
    });
  }
  return openaiInstance;
}

function preprocessText(text: string): string {
  let processed = text;
  
  processed = processed.replace(/\b3bet\b/gi, "three bet");
  processed = processed.replace(/\b4bet\b/gi, "four bet");

  const exactReplacements: Record<string, string> = {
    "UTG": "under the gun",
    "BTN": "button",
    "BB": "big blind",
    "SB": "small blind",
    "CO": "cutoff",
    "bb": "big blinds"
  };

  for (const [key, value] of Object.entries(exactReplacements)) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    processed = processed.replace(regex, value);
  }

  return processed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text, provider, voice } = req.body || {};

    if (!text || typeof text !== "string" || text.trim() === "") {
      return res.status(400).json({ error: "Text is required" });
    }

    const processedText = preprocessText(text);

    if (provider === "edge") {
      const edgeVoice = voice || "en-US-AriaNeural";
      const tts = new MsEdgeTTS();
      await tts.setMetadata(edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(processedText);

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      res.setHeader('Content-Type', 'audio/mpeg');
      return res.status(200).send(buffer);
    }

    const openaiVoice = voice || "alloy";
    const openai = getOpenAI();
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: openaiVoice as any,
      input: processedText,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error("TTS API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate speech" });
  }
}
