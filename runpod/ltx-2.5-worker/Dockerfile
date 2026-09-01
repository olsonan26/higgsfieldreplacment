FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ARG LTX_COMMIT=a95ab856bf29407b6b066ede0abe1846050db56c
LABEL org.opencontainers.image.source="https://github.com/olsonan26/higgsfieldreplacment" \
      org.opencontainers.image.description="VesperFrame private LTX-2.5 RunPod worker"
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    LTX_MODEL_DIR=/runpod-volume/models/ltx-2.5 \
    LTX_PRELOAD_ON_START=1 \
    LTX_OFFLOAD_MODE=none

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg git python3 python3-pip && \
    rm -rf /var/lib/apt/lists/* && \
    python3 -m pip install --break-system-packages --no-cache-dir uv==0.12.7

WORKDIR /opt/ltx2
RUN git clone --filter=blob:none https://github.com/Lightricks/LTX-2.git . && \
    git checkout "$LTX_COMMIT" && \
    uv sync --no-dev --extra natten && \
    uv pip install runpod==1.12.0 requests==2.34.2

COPY handler.py /worker/handler.py
RUN python3 -m py_compile /worker/handler.py && \
    PYTHONPATH=/worker uv run python -c "import handler; print('LTX worker imports verified')"
CMD ["uv", "run", "python", "/worker/handler.py"]
