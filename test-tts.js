const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
(async () => {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata("en-US-AriaNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream("Hello world");
    const chunks = [];
    for await (const chunk of audioStream) {
        chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    console.log("Buffer size:", buffer.length);
    process.exit(0);
  } catch (e) {
    console.error(e);
  }
})();
