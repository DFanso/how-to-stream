import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const input = Bun.argv[2];
const outputDir = Bun.argv[3] ?? "streams";
const mode = Bun.argv[4] ?? "multi";

if (!input) {
  console.error("Usage: bun run generate:hls -- <input-file> [output-dir] [single|multi]");
  process.exit(1);
}

const absoluteOutputDir = resolve(process.cwd(), outputDir);
const absoluteInput = resolve(process.cwd(), input);
await mkdir(absoluteOutputDir, { recursive: true });

async function detectAudioStream(filePath: string): Promise<boolean> {
  const proc = Bun.spawn(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", filePath], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    console.error(stderr.trim() || `ffprobe exited with code ${exitCode}`);
    process.exit(exitCode);
  }

  return stdout.trim().length > 0;
}

const hasAudio = await detectAudioStream(absoluteInput);

const singleVariantArgs = [
  "-i",
  absoluteInput,
  "-c:v",
  "libx264",
  "-c:a",
  "aac",
  "-preset",
  "veryfast",
  "-hls_time",
  "4",
  "-hls_playlist_type",
  "vod",
  "-hls_list_size",
  "0",
  "-hls_segment_filename",
  "segment_%03d.ts",
  "index.m3u8",
];

const multiVariantArgs = [
  "-i",
  absoluteInput,
  "-map",
  "0:v:0",
  "-map",
  "0:v:0",
  "-filter:v:0",
  "scale=w=-2:h=720",
  "-filter:v:1",
  "scale=w=-2:h=480",
  "-c:v",
  "libx264",
  "-c:a",
  "aac",
  "-preset",
  "veryfast",
  "-b:v:0",
  "2800k",
  "-b:v:1",
  "1400k",
  "-b:a",
  "128k",
  "-hls_time",
  "4",
  "-hls_playlist_type",
  "vod",
  "-hls_list_size",
  "0",
  "-master_pl_name",
  "master.m3u8",
  "-hls_segment_filename",
  "%v/segment_%03d.ts",
  "%v/index.m3u8",
];

if (hasAudio) {
  multiVariantArgs.splice(4, 0, "-map", "0:a:0", "-map", "0:a:0");
  multiVariantArgs.splice(multiVariantArgs.length - 3, 0, "-var_stream_map", "v:0,a:0 v:1,a:1");
} else {
  multiVariantArgs.splice(multiVariantArgs.length - 3, 0, "-var_stream_map", "v:0 v:1");
}

if (mode === "multi") {
  await Promise.all([
    mkdir(resolve(absoluteOutputDir, "0"), { recursive: true }),
    mkdir(resolve(absoluteOutputDir, "1"), { recursive: true }),
  ]);
}

const args = mode === "single" ? singleVariantArgs : multiVariantArgs;

const proc = Bun.spawn(["ffmpeg", ...args], {
  cwd: absoluteOutputDir,
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
  console.error(`ffmpeg exited with code ${exitCode}`);
  process.exit(exitCode);
}

console.log(`HLS output generated in ${absoluteOutputDir}`);
console.log(mode === "single" ? "Load /streams/index.m3u8 in the demo page." : "Load /streams/master.m3u8 in the demo page.");
