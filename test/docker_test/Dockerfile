FROM debian:bookworm AS base
LABEL maintainer="Rob Knop <raknop@pobox.com>"

SHELL ["/bin/bash", "-c"]

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get -y upgrade && \
  apt-get -y install \
    python3 locales tmux postgresql-client firefox-esr elinks curl less && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

RUN cat /etc/locale.gen | perl -pe 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' > /etc/locale.gen.new \
    && mv /etc/locale.gen.new /etc/locale.gen
RUN locale-gen en_US.utf8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN ln -s /usr/bin/python3 /usr/bin/python
ENV LESS=-XLRi

# Needed so that things like firefox can
# create profile directories and crap like that.
# (If not running as root, then leaving
# HOME at the default / will cause issues.)
ENV HOME=/tmp

# ======================================================================
FROM base AS build

RUN apt-get update \
    && apt-get -y install python3-pip python3-venv

RUN mkdir /venv
RUN python3 -mvenv /venv

# ======================================================================
FROM build AS shell

COPY --from=build /venv/ /venv/
ENV PATH=/venv/bin:$PATH
