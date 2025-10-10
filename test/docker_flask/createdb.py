import os
import psycopg


def main():
    dbhost = os.getenv( 'DB_HOST' )
    dbname = os.getenv( 'DB_NAME' )
    dbuser = os.getenv( 'DB_USER' )
    dbpass = os.getenv( 'DB_PASS' )
    dbport = os.getenv( 'DB_PORT' )
    conn = psycopg.connect( host=dbhost, user=dbuser, password=dbpass, port=dbport, dbname=dbname )
    cursor = conn.cursor()

    q = ( "CREATE TABLE authuser( id uuid NOT NULL, username text NOT NULL, displayname text NOT NULL, "
          "email text NOT NULL, pubkey text, privkey jsonb )" )
    cursor.execute( q )
    q = "ALTER TABLE authuser ADD CONSTRAINT authuser_pkey PRIMARY KEY (id)"
    cursor.execute( q )
    q = "CREATE UNIQUE INDEX ix_authuser_username ON authuser USING btree (username)"
    cursor.execute( q )
    q = "CREATE INDEX ix_authuser_email ON authuser USING btree(email)"

    q = ( "CREATE TABLE passwordlink( id uuid NOT NULL, userid uuid NOT NULL, expires timestamp with time zone )" )
    cursor.execute( q )
    q = "ALTER TABLE passwordlink ADD CONSTRAINT passwordlink_pkey PRIMARY KEY (id)"
    cursor.execute( q )
    q = "CREATE INDEX ix_passwordlink_userid ON passwordlink USING btree (userid)"
    cursor.execute( q )

    q = ( "CREATE TABLE authgroup( id uuid NOT NULL, name text NOT NULL, description text )" )
    cursor.execute( q )
    q = "ALTER TABLE authgroup ADD CONSTRAINT authgroup_pkey PRIMARY KEY (id)"
    cursor.execute( q )
    q = "CREATE UNIQUE INDEX ix_authgroup_name ON authgroup USING btree (name)"

    q = ( "CREATE TABLE auth_user_group( userid uuid NOT NULL, groupid uuid NOT NULL )" )
    cursor.execute( q )
    q = "ALTER TABLE auth_user_group ADD CONSTRAINT auth_user_group_pkey PRIMARY KEY (userid, groupid)"
    cursor.execute( q )
    q = "CREATE INDEX idx_auth_user_group_userid ON auth_user_group USING btree (userid)"
    cursor.execute( q )
    q = "CREATE INDEX idx_auth_user_group_groupid ON auth_user_group USING btree (groupid)"
    cursor.execute( q )
    q = ( "ALTER TABLE auth_user_group ADD CONSTRAINT fk_auth_user_group_user "
          "FOREIGN KEY (userid) REFERENCES authuser(id) ON DELETE CASCADE" )
    cursor.execute( q )
    q = ( "ALTER TABLE auth_user_group ADD CONSTRAINT fk_auth_user_group_group "
          "FOREIGN KEY (groupid) REFERENCES authgroup(id) ON DELETE CASCADE" )
    cursor.execute( q )


    # q = ( "INSERT INTO authuser(id,username,displayname,email) "
    #       "VALUES ('fdc718c3-2880-4dc5-b4af-59c19757b62d','browser_test','Test User','testuser@mailhog')" )
    # cursor.execute( q )

    conn.commit()


# ======================================================================

if __name__ == "__main__":
    main()
