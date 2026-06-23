FROM python:3.12-trixie

ARG COMFYUI_GIT_REF=master
ARG PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cu130
ARG APT_EXTRA_PACKAGES=

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  cmake \
  ffmpeg \
  git \
  libgl1 \
  libglib2.0-0 \
  && if [ -n "$APT_EXTRA_PACKAGES" ]; then apt-get install -y --no-install-recommends $APT_EXTRA_PACKAGES; fi \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -m comfyui

WORKDIR /comfyui

RUN git clone --depth 1 --branch "${COMFYUI_GIT_REF}" https://github.com/Comfy-Org/ComfyUI.git /comfyui
RUN python -m venv /comfyui/.venv

ENV PATH="/comfyui/.venv/bin:$PATH"
ENV PIP_EXTRA_INDEX_URL="${PIP_EXTRA_INDEX_URL}"

RUN pip install \
  --no-cache-dir \
  --disable-pip-version-check \
  --extra-index-url "${PIP_EXTRA_INDEX_URL}" \
  -r requirements.txt

COPY infra/docker/comfyui.entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
  && chown -R comfyui:comfyui /comfyui /home/comfyui

EXPOSE 8188

VOLUME /comfyui/custom_nodes
VOLUME /comfyui/input
VOLUME /comfyui/models
VOLUME /comfyui/output
VOLUME /comfyui/temp
VOLUME /comfyui/user

ENTRYPOINT ["/entrypoint.sh"]
CMD ["python", "./main.py", "--listen", "0.0.0.0"]
