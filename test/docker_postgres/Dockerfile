FROM rknop/devuan-chimaera-rknop
MAINTAINER Rob Knop <raknop@lbl.gov>

ENV DEBIAN_FRONTEND=noninteractive

# RUN mkdir /secrets
# RUN echo "replace_this" >> /secrets/postgres_password

RUN mkdir /build
WORKDIR /build

RUN apt-get update && apt-get -y upgrade && \
  apt-get -y install \
    postgresql-13 postgresql-client-13 postgresql-server-dev-13 pgtop libssl-dev libreadline-dev zlib1g-dev tmux netcat && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

RUN mkdir /var/lib/postgresql/data \
    && chmod 700 /var/lib/postgresql/data \
    && chown postgres:postgres /var/lib/postgresql/data

RUN locale-gen en_US.utf8

RUN echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/13/main/pg_hba.conf
# COPY postgresql.conf /etc/postgresql/13/main/postgresql.conf

RUN echo "listen_addresses='*'" >> /etc/postgresql/13/main/postgresql.conf
RUN cat /etc/postgresql/13/main/postgresql.conf | \
       perl -pe "s{data_directory *= *'(.*)'(.*)}{data_directory = '/var/lib/postgresql/data'\2}" \
         > /etc/postgresql/13/main/postgresql.conf.new \
    && mv /etc/postgresql/13/main/postgresql.conf /etc/postgresql/13/main/postgresql.conf.old \
    && mv /etc/postgresql/13/main/postgresql.conf.new /etc/postgresql/13/main/postgresql.conf


# Make sure this matches what is in the config file (created just above)
# (There is some futzing about here to make sure the right permissions are
# on the file regardless of the permissions as it exists on the machine
# where the docker image is built.  I don't know why a simple ADD
# followed by CHMOD didn't work.)
COPY run_postgres.sh /tmp/run_postgres.sh
RUN cp /tmp/run_postgres.sh /run_postgres.sh && chmod 755 /run_postgres.sh

USER postgres
ENV POSTGRES_DATA_DIR=/var/lib/postgresql/data
CMD ["bash", "/run_postgres.sh"]
