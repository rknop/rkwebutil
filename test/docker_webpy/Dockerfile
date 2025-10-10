# This dockerfile must be run from the parent directory of the Dockerfile's directory

FROM debian:bookworm AS base
LABEL maintainer="Rob Knop <rknop@pobox.com>"

SHELL [ "/bin/bash", "-c" ]

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ="UTC"

RUN apt-get update \
    && apt-get -y upgrade \
    && apt-get -y install \
       python3 locales tmux less netcat-openbsd curl elinks postgresql-client make \
       apache2 apache2-bin libapache2-mod-wsgi-py3 patch \
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

# =====================================================================
FROM base AS build

RUN apt-get update \
    && apt-get -y install -y python3-pip python3-venv git libpq-dev

RUN mkdir /venv
RUN python3 -mvenv /venv

RUN source /venv/bin/activate \
    && pip --no-cache install \
       psycopg \
       setuptools \
       setuptools-scm \
       web.py

RUN mkdir -p /usr/src/rkwebutil
WORKDIR /usr/src/rkwebutil
COPY . /usr/src/rkwebutil
RUN source /venv/bin/activate && \
    pip install .

# ======================================================================
FROM base AS webserver

COPY --from=build /venv/ /venv/
ENV PATH=/venv/bin:$PATH

COPY test/docker_flask/key.pem /usr/src/key.pem
COPY test/docker_flask/cert.pem /usr/src/cert.pem

# Set up apache
RUN ln -s ../mods-available/socache_shmcb.load /etc/apache2/mods-enabled/socache_shmcb.load
RUN ln -s ../mods-available/ssl.load /etc/apache2/mods-enabled/ssl.load
RUN ln -s ../mods-available/ssl.conf /etc/apache2/mods-enabled/ssl.conf
RUN echo "Listen 8082" > /etc/apache2/ports.conf
COPY test/docker_webpy/000-default.conf /etc/apache2/sites-available/
COPY test/docker_webpy/wsgi.conf.patch /usr/src/
RUN patch /etc/apache2/mods-available/wsgi.conf /usr/src/wsgi.conf.patch

# This next ones are horrible security... but this is a test environment, so whatevs
# Need it if I'm going to run as whatever user.
# For any kind of production deployment, figure out the users and do the Dockerfile right.
RUN chmod -R a+rwx /var/www/html
RUN chmod -R a+rwx /var/log/apache2
RUN chmod -R a+rwx /var/run/apache2

COPY test/docker_webpy/ap.css test/docker_webpy/ap.js test/docker_webpy/ap.py test/docker_webpy/ap_start.js /var/www/html/
RUN cp -p /venv/lib/python3.11/site-packages/rkwebutil/static/* /var/www/html/

RUN apachectl start

ENTRYPOINT [ "apachectl", "-D", "FOREGROUND", "-D", "APACHE_CONFDIR=/etc/apache2" ]
