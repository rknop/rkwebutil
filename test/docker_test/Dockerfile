FROM rknop/devuan-daedalus-rknop
MAINTAINER Rob Knop <raknop@pobox.com>

SHELL ["/bin/bash", "-c"]

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get -y upgrade && \
  apt-get -y install \
    python3 python3-pip python3-psycopg2 python3-pytest tmux postgresql-client \
    firefox-esr elinks && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

RUN rm /usr/lib/python3.11/EXTERNALLY-MANAGED

RUN pip3 --no-cache install \
  sqlalchemy \
  pyyaml \
  python-dateutil \
  pytz \
  requests \
  selenium_firefox

RUN ln -s /usr/bin/python3 /usr/bin/python
