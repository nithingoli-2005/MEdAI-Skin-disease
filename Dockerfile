FROM python:3.10-slim

WORKDIR /app

COPY . /app

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# HuggingFace Spaces requires port 7860
EXPOSE 7860

ENV PYTHONUNBUFFERED=1

# --preload    → load models ONCE before forking workers (prevents 4x RAM usage)
# --workers 2  → limit parallel workers to reduce memory pressure
# --timeout 120 → give enough time for models to load without being killed
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "2", "--timeout", "120", "--preload", "app:app"]