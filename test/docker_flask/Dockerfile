# This dockerfile must be run from the top of the rkwebutil checkout

FROM rknop/devuan-daedalus-rknop AS base
LABEL maintainer="Rob Knop <rknop@pobox.com>"

SHELL ["/bin/bash", "-c"]

RUN mkdir -p /flask
WORKDIR /flask

ENV DEBIAN_FRONTEND="noninteractive"
ENV TZ="UTC"

RUN  apt-get update \
    && apt-get -y upgrade \
    && apt-get -y install -y \
         python3 tmux netcat-openbsd curl elinks postgresql-client make \
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/python3 /usr/bin/python
ENV LESS=-XLRi

# ======================================================================
FROM base AS build

RUN DEBIAN_FRONTEND="noninteractive" TZ="US/Pacific" \
    apt-get update \
    && DEBIAN_FRONTEND="noninteractive" TZ="US/Pacific" \
    apt-get -y install -y python3-pip python3-venv git libpq-dev

RUN mkdir /venv
RUN python3 -mvenv /venv

RUN source /venv/bin/activate && \
    pip --no-cache install \
       apscheduler \
       flask \
       flask-session \
       flask-sock \
       gunicorn \
       psycopg2 \
       pycryptodome \
       python-dateutil \
       pytz \
       requests \
       setuptools \
       setuptools-scm \
xo
RUN mkdir -p /usr/src/rkwebutil
WORKDIR /usr/src/rkwebutil
COPY . /usr/src/rkwebutil
RUN source /venv/bin/activate && \
    pip install .

# ======================================================================
FROM base AS webserver

COPY --from=build /venv/ /venv/
ENV PATH=/venv/bin:$PATH

RUN mkdir /sessions
# This next one is horrible security... but this is a test environment, so whatevs
# Need it if I'm going to run as whatever user.
RUN chmod a+rwx /sessions

COPY test/docker_flask/createdb.py /usr/src/createdb.py
COPY test/docker_flask/key.pem /usr/src/key.pem
COPY test/docker_flask/cert.pem /usr/src/cert.pem

COPY test/docker_flask/server.py /flask
COPY test/docker_flask/ap /flask/ap
RUN ln -s /flask/ap/static /flask/static
RUN ln -s /flask/ap/templates /flask/templates
RUN cp -p /venv/lib/python3.11/site-packages/rkwebutil/static/* /flask/static/
WORKDIR /flask

ENTRYPOINT [ "gunicorn", "--certfile", "/usr/src/cert.pem", "--keyfile", "/usr/src/key.pem", \
           "-w", "1", "--threads", "10", "-b", "0.0.0.0:8080", "--timeout", "0", "server:app" ]
