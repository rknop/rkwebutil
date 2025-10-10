# This dockerfile must be run from the top of the rkwebutil checkout

FROM rknop/devuan-daedalus-rknop AS base
LABEL maintainer="Rob Knop <rknop@pobox.com>"

SHELL ["/bin/bash", "-c"]

ENV DEBIAN_FRONTEND="noninteractive"
ENV TZ="UTC"

RUN apt-get update \
    && apt-get -y upgrade \
    && apt-get -y install -y \
       python3 tmux netcat-openbsd curl elinks postgresql-client make \
       apache2 apache2-bin libapache2-mod-wsgi-py3 \
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/python3 /usr/bin/python
ENV LESS=-XLRi

# ======================================================================
FROM base AS build

RUN apt-get update \
    && apt-get -y install -y python3-pip python3-venv git libpq-dev

RUN mkdir /venv
RUN python3 -mvenv /venv

RUN source /venv/bin/activate \
    && pip --no-cache install \
       flask \
       flask-session \
       flask-sock \
       psycopg \
       pycryptodome \
       python-dateutil \
       pytz \
       requests \
       setuptools \
       setuptools-scm

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
RUN echo "Listen 8084" > /etc/apache2/ports.conf
COPY test/docker_apache/000-default.conf /etc/apache2/sites-available

# Sessions directory for flask
RUN mkdir /sessions

# This next ones are horrible security... but this is a test environment, so whatevs
# Need it if I'm going to run as whatever user.
# For any kind of production deployment, figure out the users and do the Dockerfile right.
RUN chmod a+rwx /sessions
RUN chmod -R a+rwx /var/www/html
RUN chmod -R a+rwx /var/log/apache2
RUN chmod -R a+rwx /var/run/apache2

RUN mkdir /flask
RUN chmod a+rx /flask
COPY test/docker_apache/server.py /flask/
COPY test/docker_flask/ap /flask/ap
RUN ln -s /flask/ap/static /flask/static
RUN ln -s /flask/ap/tempaltes /flask/templates
RUN cp -p /venv/lib/python3.11/site-packages/rkwebutil/static/* /flask/static/

ENTRYPOINT [ "apachectl", "-D", "FOREGROUND", "-D", "APACHE_CONFDIR=/etc/apache2" ]
