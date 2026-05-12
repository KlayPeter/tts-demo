import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { question } = req.body;

    const answers: Record<string, string> = {
      "Can you explain the GTO strategy when facing a 3bet from the big blind?": "When facing a 3bet from the big blind while holding Ace King suited in the cutoff, you have a very strong hand...",
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
}
