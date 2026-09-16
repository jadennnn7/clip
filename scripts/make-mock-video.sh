#!/usr/bin/env bash
# Erzeugt das Testvideo für den Editor auf Mock-Daten (public/mock/source.mp4).
#
# Warum synthetisch statt eines echten Clips: Der Editor muss ohne Netzwerk und
# ohne fremde Infrastruktur laufen. Öffentliche Test-Buckets verschwinden — der
# lange übliche Google-Sample-Bucket liefert inzwischen 403.
#
# Inhalt: zwei horizontal wandernde Flächen (damit das 16:9 → 9:16 Reframing
# sichtbar etwas zu verfolgen hat) und ein Fortschrittsbalken, der alle 20 s neu
# startet — daran lässt sich Scrubbing sofort verifizieren.
#
# Bewusst entropiearm: `testsrc2` als Quelle ergibt bei derselben Länge ~52 MB
# statt ~5 MB.
set -euo pipefail

OUT="$(dirname "$0")/../public/mock/source.mp4"
mkdir -p "$(dirname "$OUT")"

ffmpeg -y -loglevel error \
  -f lavfi -i "color=c=0x101026:s=1280x720:r=24:d=600" \
  -f lavfi -i "sine=frequency=180:sample_rate=44100:duration=600" \
  -filter_complex "[0:v]\
drawbox=x='340+250*sin(t/6.5)':y=120:w=320:h=460:color=0x4f46e5:t=fill,\
drawbox=x='760+200*sin(t/9+2.1)':y=190:w=240:h=380:color=0xf59e0b:t=fill,\
drawbox=x=0:y=640:w='iw*mod(t\,20)/20':h=14:color=0x22d3ee:t=fill[v]" \
  -map "[v]" -map 1:a \
  -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -g 48 \
  -c:a aac -b:a 48k -movflags +faststart \
  "$OUT"

echo "Erstellt: $OUT ($(du -h "$OUT" | cut -f1))"
