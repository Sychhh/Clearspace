import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
const run = promisify(execFile);
export class SpeechError extends Error {}
export function validateWave(bytes) {
  if (
    bytes.length < 44 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  )
    throw new SpeechError("Please record WAV audio in the app.");
  let offset = 12,
    format = false,
    data = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4),
      length = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length)
      throw new SpeechError("Audio file is incomplete.");
    if (type === "fmt ") {
      if (
        length < 16 ||
        bytes.readUInt16LE(offset + 8) !== 1 ||
        bytes.readUInt16LE(offset + 10) !== 1 ||
        bytes.readUInt32LE(offset + 12) !== 16000 ||
        bytes.readUInt16LE(offset + 22) !== 16
      )
        throw new SpeechError("Audio must be mono, 16 kHz, 16-bit PCM WAV.");
      format = true;
    }
    if (type === "data") {
      if (length === 0 || length % 2 || length > 16000 * 2 * 181)
        throw new SpeechError("Keep recordings under three minutes.");
      data = true;
    }
    offset += 8 + length + (length % 2);
  }
  if (!format || !data) throw new SpeechError("Audio is missing its PCM data.");
}
export function makeLocalTranscriber({
  executable,
  model,
  tempRoot,
  runProcess = run,
  timeoutMs = 180000,
}) {
  let running = false;
  return async (bytes) => {
    validateWave(bytes);
    if (running)
      throw new SpeechError(
        "A recording is already being transcribed. Please wait.",
      );
    if (!existsSync(executable) || !existsSync(model))
      throw new SpeechError(
        "Bundled whisper.cpp or its model is missing. Extract the entire ZIP before starting.",
      );
    running = true;
    let dir;
    try {
      await mkdir(tempRoot, { recursive: true, mode: 0o700 });
      dir = await mkdtemp(join(tempRoot, "capture-"));
      const input = join(dir, "audio.wav"),
        output = join(dir, "transcript");
      await writeFile(input, bytes, { mode: 0o600 });
      await runProcess(
        resolve(executable),
        [
          "-m",
          resolve(model),
          "-f",
          input,
          "-l",
          "auto",
          "-otxt",
          "-of",
          output,
          "-nt",
          "-ng",
          "-t",
          "4",
        ],
        { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      );
      const text = (await readFile(output + ".txt", "utf8")).trim();
      if (!text || /^\[.*\]$/.test(text))
        throw new SpeechError("No clear speech detected. Please record again.");
      return text;
    } catch (e) {
      if (e instanceof SpeechError) throw e;
      throw new SpeechError(
        e.killed
          ? "Local transcription took too long. Try a shorter recording."
          : "whisper.cpp could not transcribe this recording. Check the included troubleshooting guide.",
      );
    } finally {
      try { if(dir) await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}); } finally { running=false; }
    }
  };
}
