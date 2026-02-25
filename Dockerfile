ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache python3 py3-pip

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY www/ ./www/
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
