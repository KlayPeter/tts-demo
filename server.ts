import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
    const regex = new RegExp(`\\b${key}\\b`, "g");
    processed = processed.replace(regex, value);
  }

  return processed;
}

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice, provider = "openai" } = req.body;

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
});

app.post('/api/chat', async (req, res) => {
  try {
    const { question } = req.body;

    const answers: Record<string, string> = {
      "Can you explain the GTO strategy when facing a 3bet from the big blind?": "When facing a 3bet from the big blind while holding Ace King suited in the cutoff, you have a very strong hand. Typically, in modern GTO strategy, you want to 4bet here to extract maximum value from weaker hands and to deny equity from speculative hands. If you just call, you allow the big blind to realize their equity too cheaply. A standard 4bet sizing would be around 2.2 to 2.5 times their 3bet.",
      "请结合实战，用中英双语术语分析一下 3bet 策略。": "在这手牌中，Hero 在 BTN 位置拿到了口袋 A（Pocket Aces）。前面 UTG 玩家做了一个标准的 2.5bb 的 Open raise，CO 玩家选择了 Call。这时候底池赔率（Pot odds）对我们非常有利，但为了保护我们的优质牌，我们绝对不能只做 Flat call。正确的打法是进行一次强力的 3bet，加注到大概 10bb 到 12bb 左右，迫使那些拿着投机牌的玩家付出更高的代价。",
      "请纯中文详细分析一下遇到大下注时的应对策略。": "综合来看，这手牌在翻牌圈的决策非常关键。牌面呈现出两张连牌和两张同花，我们的顶对虽然有一定的牌力，但面临极大的被反超风险。考虑到对手在转牌圈下注的幅度超过了底池的三分之二，这通常代表着极化的范围。在没有足够赢率支撑的情况下，为了保护我们的总筹码量，在这里选择弃牌是长远来看更具正期望值的选择。"
    };

    const defaultAnswer = "I'm sorry, I don't have a pre-configured answer for that scenario. But generally, playing tight and aggressive is the best strategy in Texas Hold'em.";

    const textToStream = answers[question] || defaultAnswer;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const tokens = textToStream.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_]+|[^a-zA-Z0-9_\u4e00-\u9fa5\s]+|\s+/g) || [];
    
    for (let i = 0; i < tokens.length; i++) {
      res.write(`data: ${JSON.stringify({ text: tokens[i] })}\n\n`);
      await new Promise(r => setTimeout(r, 15 + Math.random() * 25)); 
    }
    
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    console.error("Chat API Error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to generate stream" });
    }
    res.end();
  }
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
  });
}

export default app;
