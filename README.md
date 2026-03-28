# Bun HLS demo

This project shows the smallest practical setup for serving HLS with Bun and TypeScript.

## What you get

- A Bun server that serves static files from `public/`
- Special MIME handling for HLS playlists (`.m3u8`) and transport stream segments (`.ts`)
- A small browser player page powered by `hls.js`
- A helper script that runs `ffmpeg` to generate HLS output into `streams/`

## How HLS works

HLS is just HTTP + playlists + video chunks:

1. The browser loads a playlist such as `master.m3u8`.
2. That playlist points to one or more variant playlists like `0/index.m3u8` and `1/index.m3u8`.
3. Each variant playlist lists short `.ts` segment files.
4. The player downloads those segments one by one while playing.

`master.m3u8` decides _which stream quality exists_.

`index.m3u8` decides _which segment comes next_.

`.ts` files contain the actual video/audio payload for a few seconds at a time.

## Install

```bash
bun install
```

## Generate HLS files

Make sure `ffmpeg` is installed and available on your `PATH`.

Multi-variant output (recommended):

```bash
bun run generate:hls -- ./video/sample.mp4 streams multi
```

Single-variant output:

```bash
bun run generate:hls -- ./video/sample.mp4 streams single
```

Rolling event output for long videos (play before full transcode finishes):

```bash
bun run generate:hls -- ./video/sample.mp4 streams/live-demo event 2
```

Sliding live-window output:

```bash
bun run generate:hls -- ./video/sample.mp4 streams/live-demo live 2
```

This writes playlists and segments under `streams/`.

## Run the server

```bash
bun run dev
```

Then open `http://localhost:3001`.

## Default URLs

- Multi-variant: `http://localhost:3001/streams/master.m3u8`
- Single-variant: `http://localhost:3001/streams/index.m3u8`

## Notes

- Bun serves the files; it does not create the HLS segments itself.
- `ffmpeg` handles segmentation, playlists, codecs, and bitrates.
- The demo uses `hls.js` for browsers without native HLS playback.
