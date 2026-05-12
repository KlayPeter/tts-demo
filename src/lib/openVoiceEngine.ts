/**
 * OpenVoice V2 引擎桥接
 * 调用本地 Python API (http://localhost:8001/tts)
 */

export async function generateOpenVoiceAudioBlob(
  text: string, 
  language: string = 'ZH', 
  speed: number = 1.0,
  refAudio?: File
): Promise<Blob> {
  try {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('language', language);
    formData.append('speed', speed.toString());
    
    if (refAudio) {
      formData.append('ref_audio', refAudio);
    }

    // 硬编码局域网 IP，用于 Vercel 部署后在同一局域网下访问本地服务
    const apiBase = `http://10.10.1.137:8001`;

    const response = await fetch(`${apiBase}/tts`, {
      method: "POST",
      body: formData, // 使用 FormData 自动设置 multipart/form-data
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.blob();
  } catch (error) {
    console.error("OpenVoice generation failed:", error);
    throw error;
  }
}

/**
 * 检查后端服务是否在线
 */
export async function checkOpenVoiceStatus(): Promise<boolean> {
  try {
    const apiBase = `http://10.10.1.137:8001`;
    const response = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}
