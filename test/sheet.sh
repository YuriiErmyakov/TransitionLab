#!/usr/bin/env bash
# sheet.sh <frames_dir> <out.png> [count]  - waits for AE's async PNGs, tiles them 5 per row
dir="$1"; out="$2"; n="${3:-10}"
for i in $(seq 1 60); do
  c=$(ls "$dir"/f*.png 2>/dev/null | wc -l)
  [ "$c" -ge "$n" ] && break
  sleep 1
done
sleep 1
rows=$(( (n + 4) / 5 ))
ffmpeg -v error -y -framerate 1 -i "$dir/f%02d.png" -vf "scale=384:-2,tile=5x${rows}:padding=4:color=gray" -frames:v 1 "$out" && echo "ok $out"
