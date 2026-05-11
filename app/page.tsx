"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Square, Loader2, Volume2, Clock, CheckCircle2, XCircle, Terminal, MessageSquare, Mic, List, AlignLeft } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type LogEntry = {
  id: string;
  text: string;
  duration: number;
  success: boolean;
  voice: string;
  timestamp: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const OPENAI_VOICES = ["alloy", "nova", "shimmer", "echo", "fable", "onyx"];
const OPENAI_VOICE_NAMES: Record<string, string> = {
  "alloy": "沉稳中性-Alloy",
  "nova": "活力女声-Nova",
  "shimmer": "温柔女声-Shimmer",
  "echo": "温暖男声-Echo",
  "fable": "叙事英音-Fable",
  "onyx": "低沉男声-Onyx"
};

const EDGE_VOICES = [
  "en-US-AriaNeural",
  "en-US-GuyNeural",
  "en-GB-SoniaNeural",
  "zh-CN-XiaoxiaoNeural",
  "zh-CN-YunxiNeural"
];
const EDGE_VOICE_NAMES: Record<string, string> = {
  "en-US-AriaNeural": "美音女声-Aria",
  "en-US-GuyNeural": "美音男声-Guy",
  "en-GB-SoniaNeural": "英音女声-Sonia",
  "zh-CN-XiaoxiaoNeural": "中文女声-晓晓",
  "zh-CN-YunxiNeural": "中文男声-云希"
};

const KOKORO_VOICES = [
  "af_heart",
  "af_bella",
  "am_adam",
  "am_michael",
  "bf_emma",
  "bm_george"
];

const KOKORO_VOICE_NAMES: Record<string, string> = {
  "af_heart": "美音女声-Heart (默认)",
  "af_bella": "美音女声-Bella",
  "am_adam": "美音男声-Adam",
  "am_michael": "美音男声-Michael",
  "bf_emma": "英音女声-Emma",
  "bm_george": "英音男声-George"
};

const STREAM_PRESETS = [
  {
    label: "纯英文长段落",
    question: "Can you explain the GTO strategy when facing a 3bet from the big blind?"
  },
  {
    label: "中英结合分析",
    question: "请结合实战，用中英双语术语分析一下 3bet 策略。"
  },
  {
    label: "纯中文策略",
    question: "请纯中文详细分析一下遇到大下注时的应对策略。"
  }
];

const STANDARD_PRESETS = [
  {
    label: "纯英文长段落",
    text: "When facing a 3bet from the big blind while holding Ace King suited in the cutoff, you have a very strong hand. Typically, in modern GTO strategy, you want to 4bet here to extract maximum value from weaker hands and to deny equity from speculative hands. If you just call, you allow the big blind to realize their equity too cheaply. A standard 4bet sizing would be around 2.2 to 2.5 times their 3bet."
  },
  {
    label: "中英结合分析",
    text: "在这手牌中，Hero 在 BTN 位置拿到了口袋 A（Pocket Aces）。前面 UTG 玩家做了一个标准的 2.5bb 的 Open raise，CO 玩家选择了 Call。这时候底池赔率（Pot odds）对我们非常有利，但为了保护我们的优质牌，我们绝对不能只做 Flat call。正确的打法是进行一次强力的 3bet，加注到大概 10bb 到 12bb 左右，迫使那些拿着投机牌的玩家付出更高的代价。"
  },
  {
    label: "纯中文策略",
    text: "综合来看，这手牌在翻牌圈的决策非常关键。牌面呈现出两张连牌和两张同花，我们的顶对虽然有一定的牌力，但面临极大的被反超风险。考虑到对手在转牌圈下注的幅度超过了底池的三分之二，这通常代表着极化的范围。在没有足够赢率支撑的情况下，为了保护我们的总筹码量，在这里选择弃牌是长远来看更具正期望值的选择。"
  }
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"standard" | "stream">("standard");

  const [scheme, setScheme] = useState<1 | 2 | 3>(1); // 1: Cloud API, 2: Kokoro, 3: Fish Speech
  const [provider, setProvider] = useState<"edge" | "openai" | "kokoro">("edge");
  const [voice, setVoice] = useState(EDGE_VOICES[0]);
  
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isKokoroLoading, setIsKokoroLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatGenerating, setIsChatGenerating] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Streaming TTS Queue
  const audioQueue = useRef<string[]>([]);
  const isPlayingQueue = useRef(false);
  const currentChunkText = useRef("");
  const isStreamFinished = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scheme === 2) {
      if (!KOKORO_VOICES.includes(voice)) setVoice(KOKORO_VOICES[0]);
      setProvider("kokoro");
    } else {
      if (provider === "openai" && !OPENAI_VOICES.includes(voice)) {
        setVoice(OPENAI_VOICES[0]);
      } else if (provider === "edge" && !EDGE_VOICES.includes(voice)) {
        setVoice(EDGE_VOICES[0]);
      }
    }
  }, [provider, voice, scheme]);

  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    const handleErr = (e: ErrorEvent) => setGlobalError(e.message);
    const handleRejection = (e: PromiseRejectionEvent) => setGlobalError(String(e.reason));
    window.addEventListener("error", handleErr);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleErr);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  // Cleanup all audio resources
  const cleanupAll = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current.src) URL.revokeObjectURL(audioRef.current.src);
        audioRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (audioQueue.current && audioQueue.current.length > 0) {
        audioQueue.current.forEach(url => URL.revokeObjectURL(url));
        audioQueue.current = [];
      }
      isPlayingQueue.current = false;
      currentChunkText.current = "";
      isStreamFinished.current = true;
      
      setIsPlaying(false);
      setIsLoading(false);
      setIsChatGenerating(false);
    } catch (e: any) {
      console.error("Cleanup error", e);
    }
  }, []);

  useEffect(() => {
    return () => cleanupAll();
  }, [cleanupAll]);

  const handleStop = () => {
    cleanupAll();
  };

  // --- Standard TTS ---
  const handleStandardPlay = async () => {
    if (!text.trim()) return;
    cleanupAll();
    
    setIsLoading(true);
    const startTime = Date.now();
    let success = false;

    try {
      let url = "";
      if (scheme === 2) {
        setIsKokoroLoading(true);
        const { generateKokoroAudioBlob } = await import('../lib/kokoroEngine');
        const blob = await generateKokoroAudioBlob(text, voice);
        url = URL.createObjectURL(blob);
        setIsKokoroLoading(false);
      } else {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice, provider }),
        });

        if (!response.ok) throw new Error(`Error: ${response.status}`);
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onplay = () => { setIsPlaying(true); setIsLoading(false); };
      audio.onended = () => { setIsPlaying(false); URL.revokeObjectURL(audio.src); };
      audio.onerror = () => { setIsPlaying(false); setIsLoading(false); URL.revokeObjectURL(audio.src); };

      await audio.play();
      success = true;
    } catch (error) {
      console.error("Playback failed:", error);
      setIsLoading(false);
      setIsPlaying(false);
    } finally {
      logActivity(text, Date.now() - startTime, success);
    }
  };

  // --- Streaming TTS ---
  const enqueueTTS = async (sentence: string) => {
    if (!sentence.trim()) return;
    try {
      const startTime = Date.now();
      let blob;
      
      if (scheme === 2) {
        setIsKokoroLoading(true);
        const { generateKokoroAudioBlob } = await import('../lib/kokoroEngine');
        blob = await generateKokoroAudioBlob(sentence, voice);
        setIsKokoroLoading(false);
      } else {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sentence, voice, provider })
        });
        if (res.ok) {
          blob = await res.blob();
        } else {
          logActivity(sentence, Date.now() - startTime, false);
          return;
        }
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        audioQueue.current.push(url);
        logActivity(sentence, Date.now() - startTime, true);
        playNextInQueue();
      } else {
        logActivity(sentence, Date.now() - startTime, false);
      }
    } catch (e) {
      console.error("Chunk TTS error:", e);
    }
  };

  const playNextInQueue = () => {
    if (isPlayingQueue.current || audioQueue.current.length === 0) return;
    
    isPlayingQueue.current = true;
    setIsPlaying(true);
    
    const url = audioQueue.current.shift()!;
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      isPlayingQueue.current = false;
      audioRef.current = null;
      if (audioQueue.current.length === 0 && isStreamFinished.current) {
        setIsPlaying(false);
      } else {
        playNextInQueue(); // play next
      }
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      isPlayingQueue.current = false;
      audioRef.current = null;
      playNextInQueue();
    };
    audio.play();
  };

  const handleStreamChat = async (question: string) => {
    cleanupAll();
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text: question };
    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: ChatMessage = { id: aiMsgId, role: "assistant", text: "" };
    
    setChatHistory([...chatHistory, userMsg, aiMsg]);
    setIsChatGenerating(true);
    isStreamFinished.current = false;
    currentChunkText.current = "";

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal
      });

      if (!response.body) throw new Error("No readable stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              break;
            }
            try {
              const { text: token } = JSON.parse(dataStr);
              // append to UI
              setChatHistory(prev => {
                const newHist = [...prev];
                const last = newHist[newHist.length - 1];
                if (last.id === aiMsgId) {
                  last.text += token;
                }
                return newHist;
              });

              // append to chunk buffer
              currentChunkText.current += token;
              
              // check punctuation to trigger TTS
              const parts = currentChunkText.current.split(/([.!?,;:。！？，；：]+)/);
              if (parts.length > 1) {
                for (let i = 0; i < parts.length - 1; i += 2) {
                  const sentence = (parts[i] + parts[i+1]).trim();
                  if (sentence) {
                    enqueueTTS(sentence);
                  }
                }
                currentChunkText.current = parts[parts.length - 1];
              }
            } catch (e) {}
          }
        }
      }

      // flush remaining
      if (currentChunkText.current.trim()) {
        enqueueTTS(currentChunkText.current.trim());
        currentChunkText.current = "";
      }

    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Chat stream error:", err);
      }
    } finally {
      isStreamFinished.current = true;
      setIsChatGenerating(false);
      // check if queue is empty, turn off playing state
      if (audioQueue.current.length === 0 && !isPlayingQueue.current) {
        setIsPlaying(false);
      }
    }
  };

  const logActivity = (textToLog: string, duration: number, success: boolean) => {
    setLogs(prev => {
      const newLog: LogEntry = {
        id: Date.now().toString() + Math.random(),
        text: textToLog,
        voice,
        duration,
        success,
        timestamp: Date.now(),
      };
      return [newLog, ...prev].slice(0, 8);
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
      <main className="max-w-5xl mx-auto p-4 md:p-8 pt-14">
        <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
              <Terminal className="w-8 h-8 text-emerald-400" />
              Zenith 扑克 AI 语音模块
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              支持领域专属词汇处理的文本转语音及流式对话系统。
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            系统在线
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-wrap items-center gap-6">
                <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  TTS 全局配置
                </label>
                
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">发音方案</label>
                  <select 
                    value={scheme}
                    onChange={(e) => {
                      setScheme(Number(e.target.value) as 1 | 2 | 3);
                      cleanupAll();
                    }}
                    className="bg-slate-950 border border-slate-700 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500/50 outline-none text-slate-200 transition-all cursor-pointer"
                  >
                    <option value={1}>方案一: Cloud API</option>
                    <option value={2}>方案二: Kokoro (本地推理)</option>
                    <option value={3}>方案三: Fish Speech (待接入)</option>
                  </select>
                </div>

                {(scheme === 1 || scheme === 2) && (
                  <div className="flex flex-wrap items-center gap-4 ml-auto">
                    {scheme === 1 && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500">引擎</label>
                        <div className="flex bg-slate-950 rounded-lg border border-slate-800 p-0.5">
                          <button
                            onClick={() => {setProvider("edge"); cleanupAll();}}
                            className={cn("text-xs px-3 py-1.5 rounded-md transition-colors", provider === "edge" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200")}
                          >
                            Edge TTS
                          </button>
                          <button
                            onClick={() => {setProvider("openai"); cleanupAll();}}
                            className={cn("text-xs px-3 py-1.5 rounded-md transition-colors", provider === "openai" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200")}
                          >
                            OpenAI
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">音色</label>
                      <select 
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500/50 outline-none text-slate-200 transition-all cursor-pointer w-[180px]"
                      >
                        {(scheme === 2 ? KOKORO_VOICES : (provider === "edge" ? EDGE_VOICES : OPENAI_VOICES)).map(v => {
                          let label = v;
                          if (scheme === 2) {
                            label = KOKORO_VOICE_NAMES[v] || v;
                          } else if (provider === "edge") {
                            label = EDGE_VOICE_NAMES[v] || v.replace("Neural", "").replace(/.*-/, "");
                          } else if (provider === "openai") {
                            label = OPENAI_VOICE_NAMES[v] || v;
                          }
                          return <option key={v} value={v}>{label} ({v})</option>;
                        })}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {scheme === 3 && (
                <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 border-dashed text-center text-sm text-slate-500">
                  该方案仅保留接口，当前不可用，请切换回可用方案。
                </div>
              )}
            </div>

            {/* Tabs Navigation */}
            <div className="flex flex-wrap border-b border-slate-800 gap-x-6 gap-y-2 pb-1 relative z-20">
              <button 
                type="button"
                onClick={() => {
                  setActiveTab("standard");
                  cleanupAll();
                }}
                className={cn("pb-2 text-sm font-medium transition-colors flex items-center gap-2 border-b-2 cursor-pointer touch-manipulation select-none", activeTab === "standard" ? "text-emerald-400 border-emerald-400" : "text-slate-500 border-transparent hover:text-slate-300")}
              >
                <AlignLeft className="w-4 h-4 shrink-0" /> 一次性合成 (Standard)
              </button>
              <button 
                type="button"
                onClick={() => {
                  setActiveTab("stream");
                  cleanupAll();
                }}
                className={cn("pb-2 text-sm font-medium transition-colors flex items-center gap-2 border-b-2 cursor-pointer touch-manipulation select-none", activeTab === "stream" ? "text-emerald-400 border-emerald-400" : "text-slate-500 border-transparent hover:text-slate-300")}
              >
                <MessageSquare className="w-4 h-4 shrink-0" /> 流式对话模拟 (Streaming)
              </button>
            </div>

            {/* Tab 1: Standard TTS */}
            {activeTab === "standard" && (
              <div className="space-y-4 relative z-20">
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-xs text-slate-500 mr-2 flex items-center">快捷填入：</span>
                  {STANDARD_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setText(preset.text)}
                      className="text-xs px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-emerald-100 transition-colors cursor-pointer touch-manipulation select-none active:scale-95"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setText("")}
                    className="text-xs px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-red-900/40 border border-slate-700 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition-colors ml-auto cursor-pointer touch-manipulation select-none active:scale-95"
                  >
                    清空输入
                  </button>
                </div>

                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="输入任意德州扑克复盘文本，点击下方按钮整段合成音频..."
                  className="w-full h-40 bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/50 outline-none resize-none transition-all shadow-inner"
                />

                <div className="flex items-center gap-4 bg-slate-900/30 p-4 rounded-2xl border border-slate-800/50">
                  <button
                    onClick={handleStandardPlay}
                    disabled={isLoading || !text.trim() || scheme === 3}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-emerald-900/20"
                  >
                    {isKokoroLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> 加载模型中...</> : isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> 合成中...</> : <><Play className="w-5 h-5" fill="currentColor" /> 生成并播放</>}
                  </button>

                  <button
                    onClick={handleStop}
                    disabled={!isPlaying && !isLoading}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 border border-slate-700 disabled:border-slate-800 text-slate-300 px-6 py-3 rounded-xl font-medium transition-all"
                  >
                    <Square className="w-5 h-5" fill="currentColor" /> 停止
                  </button>

                  <div className="ml-auto flex items-center gap-3">
                    <div className="text-sm font-medium text-slate-400">
                      {isPlaying ? <span className="text-emerald-400">正在播放...</span> : isLoading ? <span className="text-amber-400">请求中...</span> : "就绪"}
                    </div>
                    {/* Visualizer */}
                    <div className="flex items-center gap-[2px] h-6 px-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className={cn("w-1 rounded-full bg-emerald-500 transition-all duration-150", isPlaying ? "animate-pulse" : "h-1 bg-slate-700")} style={{ height: isPlaying ? `${Math.random() * 100 + 40}%` : '4px', animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Streaming Chat */}
            {activeTab === "stream" && (
              <div className="space-y-4 relative z-20">
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-xs text-slate-500 mr-2 flex items-center">发送快捷提问：</span>
                  {STREAM_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={isChatGenerating || scheme === 3}
                      onClick={() => handleStreamChat(preset.question)}
                      className="text-xs px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer touch-manipulation select-none active:scale-95"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl h-[400px] flex flex-col shadow-inner overflow-hidden relative">
                  {/* Chat Area */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {chatHistory.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                        点击上方快捷提问，体验真实的「边流式打字边断句朗读」效果。
                      </div>
                    ) : (
                      chatHistory.map(msg => (
                        <div key={msg.id} className={cn("flex flex-col max-w-[85%]", msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
                          <div className={cn("text-xs mb-1.5 font-medium text-slate-500 flex items-center gap-1.5", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                            {msg.role === "user" ? <span className="text-emerald-500">You</span> : <><Mic className="w-3 h-3 text-cyan-400" /> <span>AI Agent</span></>}
                          </div>
                          <div className={cn("p-4 rounded-2xl text-sm leading-relaxed", msg.role === "user" ? "bg-emerald-600/20 text-emerald-50 border border-emerald-500/30 rounded-tr-sm" : "bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm")}>
                            {msg.text}
                            {msg.role === "assistant" && isChatGenerating && msg.text.length > 0 && (
                              <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle"></span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Chat Action Footer */}
                  <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isChatGenerating && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />}
                      <span className="text-xs font-medium text-slate-400">
                        {isKokoroLoading ? "⏳ 正在加载并初始化 Kokoro 模型..." : isPlaying ? "🎙️ 正在朗读最新句子..." : isChatGenerating ? "🧠 模型思考并输出中..." : "✅ 对话空闲"}
                      </span>
                    </div>
                    {(isChatGenerating || isPlaying) && (
                      <button
                        onClick={handleStop}
                        className="text-xs flex items-center gap-1.5 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Square className="w-3.5 h-3.5" /> 打断输出
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Logs */}
          <div className="lg:col-span-4 h-[600px]">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-full">
              <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
                <List className="w-4 h-4 text-emerald-400" />
                后台 TTS 请求日志
              </h2>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-600 text-xs italic">暂无请求。</div>
                ) : (
                  logs.map(log => (
                    <div key={log.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          {log.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                          <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px]">{log.duration}ms</span>
                      </div>
                      <p className="text-slate-300 line-clamp-3 leading-relaxed">"{log.text}"</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
