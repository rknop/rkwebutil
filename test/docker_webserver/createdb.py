import os
import psycopg2

def main():
    dbhost = os.getenv( 'DB_HOST' )
    dbname = os.getenv( 'DB_NAME' )
    dbuser = os.getenv( 'DB_USER' )
    dbpass = os.getenv( 'DB_PASS' )
    dbport = os.getenv( 'DB_PORT' )
    conn = psycopg2.connect( host=dbhost, user=dbuser, password=dbpass, port=dbport, dbname=dbname )
    cursor = conn.cursor()

    q = ( "CREATE TABLE authuser( id_ uuid NOT NULL, username text NOT NULL, displayname text NOT NULL, "
          "email text NOT NULL, pubkey text, privkey text, lastlogin timestamp with time zone )" )
    cursor.execute( q )
    q = "ALTER TABLE authuser ADD CONSTRAINT authuser_pkey PRIMARY KEY (id_)"
    cursor.execute( q )
    q = "CREATE UNIQUE INDEX ix_authuser_username ON authuser USING btree (username)"
    cursor.execute( q )
    q = "CREATE INDEX ix_authuser_email ON authuser USING btree(email)"

    q = ( "CREATE TABLE passwordlink( id_ uuid NOT NULL, userid uuid NOT NULL, expires timestamp with time zone )" )
    cursor.execute( q )
    q = "ALTER TABLE passwordlink ADD CONSTRAINT passwordlink_pkey PRIMARY KEY (id_)"
    cursor.execute( q )
    q = "CREATE INDEX ix_passwordlink_userid ON passwordlink USING btree (userid)"
    cursor.execute( q )

    conn.commit()

# ======================================================================

if __name__ == "__main__":
    main()
    
