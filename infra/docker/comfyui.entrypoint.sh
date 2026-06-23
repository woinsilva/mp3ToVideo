#!/bin/sh

set -e

cd /comfyui

echo "[entrypoint] Updating ComfyUI dependencies..."
pip install \
  --no-cache-dir \
  --disable-pip-version-check \
  --extra-index-url "${PIP_EXTRA_INDEX_URL}" \
  -r requirements.txt

if [ -n "${PIP_EXTRA_PACKAGES}" ]; then
  echo "[entrypoint] Installing extra Python packages..."
  pip install \
    --no-cache-dir \
    --disable-pip-version-check \
    --extra-index-url "${PIP_EXTRA_INDEX_URL}" \
    ${PIP_EXTRA_PACKAGES}
fi

find custom_nodes -mindepth 2 -maxdepth 2 -type f -name requirements.txt | while read -r req; do
  echo "[entrypoint] Installing custom node dependencies from ${req}..."
  pip install \
    --no-cache-dir \
    --disable-pip-version-check \
    --extra-index-url "${PIP_EXTRA_INDEX_URL}" \
    -r "${req}"
done

if [ -n "${CLI_ARGS}" ]; then
  set -- python ./main.py ${CLI_ARGS}
fi

echo "[entrypoint] Starting ComfyUI..."
exec "$@"
