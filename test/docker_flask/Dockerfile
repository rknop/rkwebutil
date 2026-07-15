# This dockerfile must be run from the top of the rkwebutil checkout

FROM debian:bookworm AS base
LABEL maintainer="Rob Knop <rknop@pobox.com>"

SHELL ["/bin/bash", "-c"]

RUN mkdir -p /flask
WORKDIR /flask

ENV DEBIAN_FRONTEND="noninteractive"
ENV TZ="UTC"

RUN  apt-get update \
    && apt-get -y upgrade \
    && apt-get -y install -y \
         python3 locales tmux less netcat-openbsd curl elinks postgresql-client make \
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN cat /etc/locale.gen | perl -pe 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' > /etc/locale.gen.new \
    && mv /etc/locale.gen.new /etc/locale.gen
RUN locale-gen en_US.utf8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN ln -s /usr/bin/python3 /usr/bin/python
ENV LESS=-XLRi

# ======================================================================
FROM base AS build

RUN DEBIAN_FRONTEND="noninteractive" TZ="US/Pacific" \
    apt-get update \
    && DEBIAN_FRONTEND="noninteractive" TZ="US/Pacific" \
    apt-get -y install -y python3-pip python3-venv git libpq-dev \
       python3-setuptools python3-setuptools-scm

RUN mkdir /venv
RUN python3 -mvenv /venv

# Trying to get all the dependencies here
#   so that the pip install . step below
#   doesn't always redownload every time
#   we rebuild the dockerfile after
#   a trivial edit.
# This also meant putting setuptools and setuptools-scm
#   in the apt-get above.  (For reasons I don't
#   understand, pip installing setuptools made the
#   "pip install ." later choke, claiming that
#   setuptools was a package and not a module.
#   Sigh.  The pytproject.toml tries to do
#   everything for you, but lives in a world
#   that assumes we have good net connection at
#   all times.

RUN source /venv/bin/activate && \
    pip --no-cache install \
       apscheduler \
       "dateutils>=0.6.12,<0.7.0" \
       flask \
       flask-session \
       numpy \
       psycopg \
       "pycryptodome>=3.20,<4.0" \
       "pytz>=2022.7.1" \
       "pyyaml>6.0.2,<7.0.0" \
       gunicorn \
       "requests>=2.28,<3.0"

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
