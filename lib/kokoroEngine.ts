import { KokoroTTS } from "kokoro-js";

let kokoroInstance: any = null;
let isInitializing = false;

export async function initKokoro(onProgress?: (info: any) => void) {
  if (kokoroInstance) return kokoroInstance;
  if (isInitializing) {
    // Wait for the instance to be initialized by another call
    while (!kokoroInstance) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return kokoroInstance;
  }

  isInitializing = true;
  const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";

  try {
    console.log("尝试使用 WebGPU 加载 Kokoro 模型...");
    kokoroInstance = await KokoroTTS.from_pretrained(model_id, {
      dtype: "fp32", // WebGPU 推荐使用 fp32，q8 在某些显卡下会触发 ONNX 内存/算子报错
      device: "webgpu",
      progress_callback: onProgress
    });
  } catch (error) {
    console.warn("WebGPU 加载失败，降级使用 WebAssembly (WASM)...", error);
    try {
      kokoroInstance = await KokoroTTS.from_pretrained(model_id, {
        dtype: "q8",
        device: "wasm",
        progress_callback: onProgress
      });
    } catch (fallbackError) {
      console.error("WASM 降级加载失败:", fallbackError);
      isInitializing = false;
      throw fallbackError;
    }
  }

  isInitializing = false;
  return kokoroInstance;
}

export async function generateKokoroAudioBlob(text: string, voice: string): Promise<Blob> {
  const tts = await initKokoro();
  const audio = await tts.generate(text, { voice });
  return await audio.toBlob();
}
