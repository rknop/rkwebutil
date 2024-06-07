FROM rknop/devuan-daedalus-rknop
MAINTAINER Rob Knop <rknop@pobox.com>

ARG pgver=15

ENV DEBIAN_FRONTEND=noninteractive

# RUN mkdir /secrets
# RUN echo "replace_this" >> /secrets/postgres_password

RUN mkdir /build
WORKDIR /build

RUN apt-get update && apt-get -y upgrade && \
  apt-get -y install \
    postgresql-${pgver} postgresql-client-${pgver} postgresql-server-dev-${pgver} pgtop \
    libssl-dev libreadline-dev zlib1g-dev \
    tmux netcat-openbsd && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

RUN mkdir /var/lib/postgresql/data \
    && chmod 700 /var/lib/postgresql/data \
    && chown postgres:postgres /var/lib/postgresql/data

RUN locale-gen en_US.utf8

RUN echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/${pgver}/main/pg_hba.conf
# COPY postgresql.conf /etc/postgresql/${pgver}/main/postgresql.conf

RUN echo "listen_addresses='*'" >> /etc/postgresql/${pgver}/main/postgresql.conf
RUN cat /etc/postgresql/${pgver}/main/postgresql.conf | \
       perl -pe "s{data_directory *= *'(.*)'(.*)}{data_directory = '/var/lib/postgresql/data'\2}" \
         > /etc/postgresql/${pgver}/main/postgresql.conf.new \
    && mv /etc/postgresql/${pgver}/main/postgresql.conf /etc/postgresql/${pgver}/main/postgresql.conf.old \
    && mv /etc/postgresql/${pgver}/main/postgresql.conf.new /etc/postgresql/${pgver}/main/postgresql.conf


# Make the contents of this file match the postgres config file above
#  (in particular, the postgres version)
COPY run_postgres.sh /tmp/run_postgres.sh

# (There is some futzing about here to make sure the right permissions are
# on the file regardless of the permissions as it exists on the machine
# where the docker image is built.  I don't know why a simple ADD
# followed by CHMOD didn't work.)
RUN cp /tmp/run_postgres.sh /run_postgres.sh && chmod 755 /run_postgres.sh

USER postgres
ENV POSTGRES_DATA_DIR=/var/lib/postgresql/data
CMD ["bash", "/run_postgres.sh"]
