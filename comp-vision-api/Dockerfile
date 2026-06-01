FROM python:3.9-slim

# creates non root user and sets directory permissions
RUN useradd -m -u 1000 user
RUN mkdir /app && chown user:user /app

WORKDIR /app

# sets active user and binary path
USER user
ENV PATH="/home/user/.local/bin:$PATH"

# transfers requirements and installs python dependencies
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# enabled dynamic axes to allow the model to handle batches of any size
RUN python3 -c "import torch; from ultralytics.nn.tasks import DetectionModel; torch.serialization.add_safe_globals([DetectionModel]); from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx', dynamic=True)"

# transfers remaining application codebase
COPY --chown=user . .

EXPOSE 7860

# executes flask server initialization
CMD ["flask", "--app", "comp_vision_cpu", "run", "--host=0.0.0.0", "--port=7860"]
