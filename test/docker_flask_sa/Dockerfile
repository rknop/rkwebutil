FROM rknop/devuan-daedalus-rknop AS webserver
LABEL maintainer="Rob Knop <rknop@pobox.com>"

SHELL ["/bin/bash", "-c"]

RUN mkdir -p /flask
WORKDIR /flask

RUN DEBIAN_FRONTEND="noninteractive" TZ="US/Pacific" \
    apt-get update \
    && apt-get -y upgrade \
    && DEBIAN_FRONTEND="noninteractive" TZ="US/Pacific" \
    apt-get -y install -y \
       python3 python3-pip python3-psycopg2 tmux netcat-openbsd curl elinks \
       postgresql-client make git \
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN rm /usr/lib/python3.11/EXTERNALLY-MANAGED

RUN pip --no-cache install \
  apscheduler \
  flask \
  flask-session \
  flask-sock \
  gunicorn \
  pycryptodome \
  python-dateutil \
  pytz \
  requests \
  sqlalchemy

RUN mkdir /sessions
# This next one is horrible security... but this is a test environment, so whatevs
# Need it if I'm going to run as whatever user.
RUN chmod a+rwx /sessions

COPY docker_flask_sa/createdb.py /usr/src
COPY docker_flask_sa/key.pem /usr/src
COPY docker_flask_sa/cert.pem /usr/src

ENTRYPOINT [ "gunicorn", "--certfile", "/usr/src/cert.pem", "--keyfile", "/usr/src/key.pem", \
           "-w", "1", "--threads", "10", "-b", "0.0.0.0:8081", "--timeout", "0", "server:app" ]
