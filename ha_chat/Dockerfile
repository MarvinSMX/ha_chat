# Debian-basiert, damit onnxruntime (ChromaDB-Abhängigkeit) als Wheel installiert werden kann.
# Alpine hat keine passenden onnxruntime-Wheels; der Supervisor baut trotzdem für alle Architekturen.
FROM python:3.12-slim-bookworm

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY www/ ./www/
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
