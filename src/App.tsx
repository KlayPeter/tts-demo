"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Square, Loader2, Volume2, VolumeX, Send, Settings, Mic, MessageSquare, PlusCircle } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

const OPENVOICE_LANGS = ["ZH", "EN", "JP", "KR", "ES", "FR"];
const OPENVOICE_LANG_NAMES: Record<string, string> = {
  "ZH": "中文 (Chinese)",
  "EN": "英文 (English)",
  "JP": "日文 (Japanese)",
  "KR": "韩文 (Korean)",
  "ES": "西班牙文 (Spanish)",
  "FR": "法文 (French)"
};

const SUGGESTED_QUESTIONS = [
  "Can you explain the GTO strategy when facing a 3bet from the big blind?",
  "请结合实战，用中英双语术语分析一下 3bet 策略。",
  "请纯中文详细分析一下遇到大下注时的应对策略。"
];

export default function Home() {
  const [scheme, setScheme] = useState<1 | 2 | 3>(1); // 1: Cloud API, 2: Kokoro, 3: Fish Speech
  const [provider, setProvider] = useState<"edge" | "openai" | "kokoro">("edge");
  const [voice, setVoice] = useState(EDGE_VOICES[0]);
  const [refAudio, setRefAudio] = useState<File | null>(null);

  // 新增：自动播放和设置栏状态
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isChatGenerating, setIsChatGenerating] = useState(false);
  const [isKokoroLoading, setIsKokoroLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentlyReadingId, setCurrentlyReadingId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Streaming TTS Queue
  const audioQueue = useRef<string[]>([]);
  const isPlayingQueue = useRef(false);
  const currentChunkText = useRef("");
  const isStreamFinished = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatGenerating]);

  // 同步音色选项
  useEffect(() => {
    if (scheme === 2) {
      if (!KOKORO_VOICES.includes(voice)) setVoice(KOKORO_VOICES[0]);
      setProvider("kokoro");
    } else if (scheme === 3) {
      if (!OPENVOICE_LANGS.includes(voice)) setVoice(OPENVOICE_LANGS[0]);
    } else {
      if (provider === "openai" && !OPENAI_VOICES.includes(voice)) {
        setVoice(OPENAI_VOICES[0]);
      } else if (provider === "edge" && !EDGE_VOICES.includes(voice)) {
        setVoice(EDGE_VOICES[0]);
      }
    }
  }, [provider, voice, scheme]);

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
      setIsKokoroLoading(false);
      setIsChatGenerating(false);
      setCurrentlyReadingId(null);
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

  // --- 朗读整条消息 (单独点击播放按钮) ---
  const handleReadMessage = async (msgId: string, textToRead: string) => {
    if (!textToRead.trim() || isChatGenerating) return;
    cleanupAll();
    
    setCurrentlyReadingId(msgId);
    
    // 移动端幽灵解锁
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    audio.play().catch(() => {});

    try {
      let url = "";
      if (scheme === 2) {
        setIsKokoroLoading(true);
        const { generateKokoroAudioBlob } = await import('./lib/kokoroEngine');
        const blob = await generateKokoroAudioBlob(textToRead, voice);
        url = URL.createObjectURL(blob);
        setIsKokoroLoading(false);
      } else if (scheme === 3) {
        setIsKokoroLoading(true);
        const { generateOpenVoiceAudioBlob } = await import('./lib/openVoiceEngine');
        const blob = await generateOpenVoiceAudioBlob(textToRead, voice, 1.0, refAudio || undefined); 
        url = URL.createObjectURL(blob);
        setIsKokoroLoading(false);
      } else {
        setIsPlaying(true); // 让 UI 显示加载中
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToRead, voice, provider }),
        });

        if (!response.ok) throw new Error(`Error: ${response.status}`);
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
      }
      
      audio.src = url;
      audio.onplay = () => { setIsPlaying(true); };
      audio.onended = () => { setIsPlaying(false); URL.revokeObjectURL(audio.src); setCurrentlyReadingId(null); };
      audio.onerror = (e) => { 
        setIsPlaying(false); 
        setCurrentlyReadingId(null);
        URL.revokeObjectURL(audio.src); 
        console.error("Audio error", e);
      };

      await audio.play();
    } catch (e: any) {
      console.error("Read message failed", e);
      setIsPlaying(false);
      setIsKokoroLoading(false);
      setCurrentlyReadingId(null);
    }
  };

  // --- 流式 TTS 队列 (自动播放) ---
  const enqueueTTS = async (sentence: string) => {
    if (!sentence.trim()) return;
    try {
      let blob;
      if (scheme === 2) {
        setIsKokoroLoading(true);
        const { generateKokoroAudioBlob } = await import('./lib/kokoroEngine');
        blob = await generateKokoroAudioBlob(sentence, voice);
        setIsKokoroLoading(false);
      } else if (scheme === 3) {
        setIsKokoroLoading(true);
        const { generateOpenVoiceAudioBlob } = await import('./lib/openVoiceEngine');
        blob = await generateOpenVoiceAudioBlob(sentence, voice, 1.0, refAudio || undefined);
        setIsKokoroLoading(false);
      } else {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sentence, voice, provider })
        });
        if (res.ok) blob = await res.blob();
      }

      if (blob) {
        console.log(`TTS Blob received, size: ${blob.size} bytes`);
      }
      
      if (blob && blob.size > 500) {
        // 确保音频不是空文件（通常有效的音频至少有几百字节，调高到 500）
        const url = URL.createObjectURL(blob);
        audioQueue.current.push(url);
        playNextInQueue();
      } else {
        console.warn("TTS generated empty or invalid audio chunk, skipping. Size:", blob ? blob.size : "null");
      }
    } catch (e) {
      console.error("Chunk TTS error:", e);
      setIsKokoroLoading(false);
    }
  };

  const playNextInQueue = () => {
    if (isPlayingQueue.current || audioQueue.current.length === 0) return;
    
    isPlayingQueue.current = true;
    setIsPlaying(true);
    
    const url = audioQueue.current.shift()!;
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    
    // 清除旧的监听器防止内存泄漏和重复触发
    audio.onended = null;
    audio.onerror = null;

    let handled = false;
    const handleNext = () => {
      if (handled) return;
      handled = true;
      URL.revokeObjectURL(url);
      isPlayingQueue.current = false;
      if (audioQueue.current.length === 0 && isStreamFinished.current) {
        setIsPlaying(false);
        setCurrentlyReadingId(null);
      } else {
        playNextInQueue(); // play next
      }
    };

    audio.onended = handleNext;
    
    audio.onerror = (e) => {
      console.error("Audio playback error (invalid blob/source)", e);
      handleNext();
    };

    audio.src = url;
    audio.play().catch(e => {
      console.error("Auto play blocked or aborted", e);
      handleNext();
    });
  };

  // --- 发送消息 ---
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputValue;
    if (!textToSend.trim() || isChatGenerating) return;
    
    cleanupAll();
    
    // 幽灵解锁（为了后续可能的自动播放）
    if (isAutoPlay) {
      const audio = new Audio();
      audioRef.current = audio;
      audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      audio.play().catch(() => {});
    }

    setInputValue("");
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text: textToSend };
    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: ChatMessage = { id: aiMsgId, role: "assistant", text: "" };
    
    setChatHistory(prev => [...prev, userMsg, aiMsg]);
    setIsChatGenerating(true);
    
    if (isAutoPlay) {
      setCurrentlyReadingId(aiMsgId);
    }
    
    isStreamFinished.current = false;
    currentChunkText.current = "";

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: textToSend }),
        signal: controller.signal
      });

      if (!response.body) throw new Error("No readable stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // 必须加上 stream: true，且要缓存未结束的行，防止 JSON 被 TCP 数据包拦腰截断！
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // 最后一行如果不完整，保留在 buffer 里等下一个 chunk
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const dataStr = trimmedLine.slice(6);
            if (dataStr === '[DONE]') break;
            try {
              const { text: token } = JSON.parse(dataStr);
              // 更新 UI (使用不可变数据避免 React StrictMode 导致的重复字符)
              setChatHistory(prev => prev.map(msg => 
                msg.id === aiMsgId ? { ...msg, text: msg.text + token } : msg
              ));

              // 如果开启了自动播放，则分句
              if (isAutoPlay) {
                currentChunkText.current += token;
                const parts = currentChunkText.current.split(/([.!?,;:。！？，；：\n]+)/);
                if (parts.length > 1) {
                  for (let i = 0; i < parts.length - 1; i += 2) {
                    const sentence = (parts[i] + parts[i+1]).trim();
                    // 核心修复：只把包含实际字母/数字/汉字的句子塞给语音引擎
                    if (sentence && /[a-zA-Z0-9\u4e00-\u9fa5]/.test(sentence)) {
                      enqueueTTS(sentence);
                    }
                  }
                  currentChunkText.current = parts[parts.length - 1];
                }
              }
            } catch (e) {
              console.error("JSON parse error on chunk:", dataStr);
            }
          }
        }
      }

      // 结束时把剩余的文字塞进语音队列
      if (isAutoPlay && currentChunkText.current.trim()) {
        const sentence = currentChunkText.current.trim();
        if (sentence && /[a-zA-Z0-9\u4e00-\u9fa5]/.test(sentence)) {
          enqueueTTS(sentence);
        }
        currentChunkText.current = "";
      }

    } catch (err: any) {
      if (err.name !== "AbortError") console.error("Chat stream error:", err);
    } finally {
      isStreamFinished.current = true;
      setIsChatGenerating(false);
      if (audioQueue.current.length === 0 && !isPlayingQueue.current) {
        setIsPlaying(false);
        setCurrentlyReadingId(null);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
      
      {/* 顶部导航栏 */}
      <header className="flex-none h-14 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-2 font-semibold text-slate-100">
          <MessageSquare className="w-5 h-5 text-emerald-400" />
          Zenith Poker AI
        </div>
        
        <div className="flex items-center gap-2">
          {/* 自动播放切换按钮 */}
          <button 
            onClick={() => {
              setIsAutoPlay(!isAutoPlay);
              if (isAutoPlay) handleStop(); // 如果关闭，顺便停止当前播放
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              isAutoPlay ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400 hover:text-slate-300"
            )}
          >
            {isAutoPlay ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {isAutoPlay ? "自动播放开启" : "自动播放关闭"}
          </button>
          
          {/* 设置按钮 */}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-1.5 rounded-full transition-colors",
              showSettings ? "bg-slate-800 text-slate-200" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            )}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 隐藏的设置面板 (展开时显示) */}
      {showSettings && (
        <div className="flex-none border-b border-slate-800 bg-slate-900/50 p-4 shadow-lg animate-in slide-in-from-top-2">
          <div className="max-w-3xl mx-auto flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">方案</label>
              <select 
                value={scheme}
                onChange={(e) => { setScheme(Number(e.target.value) as 1 | 2 | 3); handleStop(); }}
                className="bg-slate-950 border border-slate-700 text-sm rounded-lg px-2 py-1 outline-none"
              >
                <option value={1}>方案一: Cloud API</option>
                <option value={2}>方案二: Kokoro 本地</option>
                <option value={3}>方案三: OpenVoice 本地API</option>
              </select>
            </div>

            {scheme === 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">引擎</label>
                <div className="flex bg-slate-950 rounded-lg border border-slate-700 p-0.5">
                  <button onClick={() => {setProvider("edge"); handleStop();}} className={cn("text-xs px-2 py-1 rounded", provider === "edge" ? "bg-emerald-600 text-white" : "text-slate-400")}>Edge</button>
                  <button onClick={() => {setProvider("openai"); handleStop();}} className={cn("text-xs px-2 py-1 rounded", provider === "openai" ? "bg-emerald-600 text-white" : "text-slate-400")}>OpenAI</button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">音色</label>
              <select 
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-sm rounded-lg px-2 py-1 outline-none w-40"
              >
                {(scheme === 2 ? KOKORO_VOICES : (scheme === 3 ? OPENVOICE_LANGS : (provider === "edge" ? EDGE_VOICES : OPENAI_VOICES))).map(v => {
                  let label = v;
                  if (scheme === 2) label = KOKORO_VOICE_NAMES[v] || v;
                  else if (scheme === 3) label = OPENVOICE_LANG_NAMES[v] || v;
                  else if (provider === "edge") label = EDGE_VOICE_NAMES[v] || v.split('-')[1];
                  else if (provider === "openai") label = OPENAI_VOICE_NAMES[v] || v;
                  return <option key={v} value={v}>{label}</option>;
                })}
              </select>
            </div>

            {scheme === 3 && (
              <label className="flex items-center gap-2 cursor-pointer bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs px-3 py-1.5 rounded-lg border border-emerald-500/20">
                <Mic className="w-3.5 h-3.5" />
                {refAudio ? `${refAudio.name.slice(0,8)}...` : "克隆: 上传参考音频"}
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => setRefAudio(e.target.files?.[0] || null)} />
              </label>
            )}
          </div>
        </div>
      )}

      {/* 聊天内容区 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
        <div className="max-w-3xl mx-auto space-y-6">
          {chatHistory.length === 0 ? (
            <div className="h-[50vh] flex flex-col items-center justify-center text-slate-500 space-y-4">
              <MessageSquare className="w-12 h-12 text-slate-800" />
              <p>发送消息以开始语音对话。</p>
            </div>
          ) : (
            chatHistory.map(msg => (
              <div key={msg.id} className={cn("flex flex-col max-w-[85%]", msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
                {msg.role === "assistant" && (
                  <div className="text-xs mb-1.5 font-medium text-emerald-500 flex items-center gap-1.5 ml-1">
                    <MessageSquare className="w-3 h-3" /> AI 助手
                  </div>
                )}
                
                <div className={cn("p-4 rounded-2xl text-sm leading-relaxed relative group", 
                  msg.role === "user" ? "bg-emerald-600 text-emerald-50 rounded-tr-sm" : "bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm")}>
                  
                  {/* 文字内容 */}
                  <div className="whitespace-pre-wrap">
                    {msg.text}
                    {msg.role === "assistant" && isChatGenerating && msg.text.length > 0 && msg.id === chatHistory[chatHistory.length-1].id && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle"></span>
                    )}
                  </div>

                  {/* 针对 AI 助手的底部按钮栏 */}
                  {msg.role === "assistant" && !isChatGenerating && msg.text && (
                    <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-2">
                      {currentlyReadingId === msg.id && (isPlaying || isKokoroLoading) ? (
                        <button 
                          onClick={handleStop}
                          className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 px-2 py-1 rounded transition-colors"
                        >
                          <Square className="w-3.5 h-3.5" fill="currentColor" /> 停止朗读
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleReadMessage(msg.id, msg.text)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 hover:bg-slate-700/50 px-2 py-1 rounded transition-colors"
                        >
                          <Volume2 className="w-3.5 h-3.5" /> 朗读整段
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* 底部输入框区 */}
      <div className="flex-none bg-slate-950 p-4 border-t border-slate-800">
        <div className="max-w-3xl mx-auto">
          {/* 预设问题快速提问（常驻显示） */}
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                disabled={isChatGenerating}
                onClick={() => handleSendMessage(q)}
                className="text-[11px] bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PlusCircle className="w-3 h-3 shrink-0" /> <span className="truncate">{q}</span>
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2 bg-slate-900 border border-slate-700 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50 rounded-2xl p-2 transition-all">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="输入消息，Enter 键发送..."
              className="flex-1 max-h-32 min-h-[44px] bg-transparent text-slate-200 placeholder-slate-500 text-sm px-3 py-2.5 outline-none resize-none"
              rows={1}
            />
            
            {/* 发送/停止按钮 */}
            {isChatGenerating || isPlayingQueue.current ? (
              <button
                onClick={handleStop}
                className="flex-none h-[44px] w-[44px] flex items-center justify-center bg-slate-800 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors"
              >
                <Square className="w-5 h-5" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim()}
                className="flex-none h-[44px] w-[44px] flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-colors"
              >
                <Send className="w-5 h-5 ml-1" />
              </button>
            )}
          </div>
          <div className="text-center mt-2 text-[10px] text-slate-600">
            {isKokoroLoading && "正在加载本地模型..."}
          </div>
        </div>
      </div>
    </div>
  );
}
