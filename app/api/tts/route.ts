import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

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
  
  // 德州扑克术语替换规则 (不区分大小写，使用正则表达式替换)
  // 注意：需要确保不会替换单词的一部分，所以可能需要加上 \b 边界匹配
  const replacements: Record<string, string> = {
    "UTG": "under the gun",
    "BTN": "button",
    "BB": "big blind", // 注意: 大写BB
    "SB": "small blind",
    "CO": "cutoff",
    "3bet": "three bet",
    "4bet": "four bet",
    "bb": "big blinds" // 注意: 小写bb
  };

  // 1. 先替换带有数字前缀的如 3bet, 4bet (不使用 \b 前缀，因为前面是数字)
  processed = processed.replace(/\b3bet\b/gi, "three bet");
  processed = processed.replace(/\b4bet\b/gi, "four bet");

  // 2. 替换其他全大写/特定缩写 (区分大小写来准确区分 BB 和 bb)
  // 因为要求 BB -> big blind, bb -> big blinds
  const exactReplacements: Record<string, string> = {
    "UTG": "under the gun",
    "BTN": "button",
    "BB": "big blind",
    "SB": "small blind",
    "CO": "cutoff",
    "bb": "big blinds"
  };

  for (const [key, value] of Object.entries(exactReplacements)) {
    // 区分大小写进行替换，并确保是独立单词
    const regex = new RegExp(`\\b${key}\\b`, "g");
    processed = processed.replace(regex, value);
  }

  return processed;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice, provider = "openai" } = body;

    if (!text || typeof text !== "string" || text.trim() === "") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
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

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
        },
      });
    }

    // Default to openai
    const openaiVoice = voice || "alloy";
    const openai = getOpenAI();
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: openaiVoice as any, // "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
      input: processedText,
    });

    // 转换成 buffer
    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error: any) {
    console.error("TTS API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate speech" },
      { status: 500 }
    );
  }
}
