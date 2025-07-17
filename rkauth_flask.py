#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023-2024 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

#### HOW TO USE
# This is for a webap built with flask and a PostgreSQL database
#
# An example may be found in test/docker_flaskserver_sql
#
# 1. Make sure the expected database tables exist (see "DATABASE
#    ASSUMPTIONS" below).
#
# 2. Import this file into your main webap code.
#
# 3. Create a flask app, and make sure it is configured for server-side
#    sessions; you do *not* want to use client side sessions with
#    authentication systems.  (In particular, with this system,
#    looking at the session data gives you enough information to
#    log in without knowing the user's password.)
#
#    Exmaple code that will accomplish this:
#
#      app = flask.Flask(  __name__ )
#      app.logger.setLevel( logging.INFO )
#      app.config.from_mapping(
#          SECRET_KEY='blah',
#          SESSION_COOKIE_PATH='/',
#          SESSION_TYPE='filesystem',
#          SESSION_PERMANENT=True,
#          SESSION_USE_SIGNER=True,
#          SESSION_FILE_DIR='/sessions',
#          SESSION_FILE_THRESHOLD=1000,
#      )
#
#    replace '/sessions' with the directory where the web server can store session files.
#
# 4. Configure the databse, and configure email for password link sending.
#    After you've imported this file, call the setdbparams() class method of the
#    RKAuthConfig class:
#      rkauth_flask.RKAuthConfig.setdbparams(
#          db_host='postgres',
#          db_port=5432,
#          db_name='test_rkwebutil',
#          db_user='postgres',
#          db_password='fragile',
#          email_from = 'rkwebutil test <nobody@nowhere.org>',
#          email_subject = 'rkwebutil test password reset',
#          email_system_name = 'the rkwebutil test webserver',
#          smtp_server = 'mailhog',
#          smtp_port = 1025,
#          smtp_use_ssl = False,
#          smtp_username = None,
#          smtp_password = None,
#      )
#
#    The values in this example are from the tests-- substitute in the right values for your setup.
#
# 5. Add the following code:
#      app.register_blueprint( rkauth_flask.bp )
#
#    That will hook up a subapplication /auth under your main webap that
#    handles all of the authentication stuff.
#
# In your webap, you can find out information about the user by
# accessing the session;
#    authenticated : True or False
#    useruuid
#    username
#    userdisplayname
#    useremail
#    ( there's also authuuid, a temporary throwaway value )

# CLIENT SIDE:
#
# use rkauth.js and resetpasswd_start.js.  It assumes that there are
# css classes "link" and "center" defined.  When you start up the
# javascript of your web application, instantiate a rkAuth, and then
# call checkAuth() on that instance at the end of your initialization;
# use the callbacks you passed to the constructor to do the rest of
# your rendering.
#
# See the example in test/docker_flask for an example.
#
# ======================================================================
# DATABASE ASSUMPTIONS
#
# You must call RKAuthConfig.setdbparams() (a global class method) to set
# the database parameters; see below for calling semantics.
#
# The database has two tables, which must have at least the following columns;
# they may have additional columns.  The table names can be configured at the
# call to RKAuthConfig.setdbparams().
#
# (NOTE: the authgroup and auth_user_group tables are not used unless
# usegroups=True is passed to rkauth_flask.RKAuthConfig.setdbparams.)
#
#   authuser:
#      id : UUID
#      username : text
#      displayname : text
#      email : text
#      pubkey : text
#      privkey : jsonb
#
#   authgroup
#      id : UUID
#      name : text
#      description : text
#
#   auth_user_group:
#      userid : UUID, foreign key to authuser.id
#      groupid : UUID, foreign key to authgroupid
#
#   passwordlink:
#      id : UUID
#      userid : UUID, foreign key to authuser.id
#      expires : timestamp with time zone

import sys
import re
import pathlib
import contextlib
from collections import namedtuple
from types import SimpleNamespace
import binascii
import uuid
import datetime
import pytz
import traceback
import smtplib
import ssl
from email.message import EmailMessage
from email.policy import EmailPolicy

import psycopg
import psycopg.rows
import psycopg.types.json

import flask
import Crypto.PublicKey.RSA
import Crypto.Cipher.PKCS1_OAEP
import Crypto.Hash

_dir = pathlib.Path(__file__).parent
if str(_dir) not in sys.path:
    sys.path.append( str(_dir) )

bp = flask.Blueprint( 'auth', __name__, url_prefix='/auth' )

class RKAuthConfig:
    """Global rkauth config.

    After importing, call the setdbparams class method of this class.

    """
    db_host = "postgres"
    db_port = 5432
    db_user = "postgres"
    db_password = "fragile"
    db_name = "db"

    authuser_table = "authuser"
    passwordlink_table = "passwordlink"
    authgroup_table = "authgroup"
    auth_user_group_link_table = "auth_user_group"
    usegroups = False

    email_from = 'RKAuth <nobody@nowhere.org>'
    email_subject = 'RKAuth password reset'
    email_system_name = 'a webserver using the RKAuth system'
    smtp_server = 'some_smtp_server'
    smtp_port = 465
    smtp_use_ssl = True
    smtp_username = None
    smtp_password = None
    webap_url = None

    @classmethod
    def setdbparams( cls, **kwargs ):
        """Set the database parameters

        Possible arguments:
        db_host : host with postgres database
        db_port : database port
        db_user : database user
        db_password : database password
        db_name : name of the database

        authuser_table : name of the authuser table (defaults to "authuser")
        passwordlink_table : name of the passwordlink table (defaults to "passwordlink")
        authgroup_table : name of the authgroup table (defaults to "authgroup")
        auth_user_groups_link_table : name of the auth_user_group table (defaults to "auth_user_group")
        usegroups : bool, use groups?  (defaults to False )

        email_from : the From line in password reset emails
        email_subject : the subject line in password reset emails
        email_system_name :
        smtp_server : smtp server for sending password reset emails
        smtp_port : port for smtp_server
        smtp_use_ssl : bool, default True
        smtp_username : str or None
        smtp_password : str or None

        webap_url : where the *auth* ap is found.  Usually, you want to
                    leave this at None, in which case it will assume
                    it's flask.request.base_url, which is probably
                    right.

        """
        for key,val in kwargs.items():
            if not hasattr( cls, key ):
                raise AttributeError( "RKAuthConfig: unknown attribute {key}" )
            setattr( cls, key, val )

        # Gonna interpolate these table names below, so make sure that
        # won't cause problems.
        if not re.search( '^[a-zA-Z0-9_]+$', cls.authuser_table ):
            raise ValueError( f"Invalid authuser table name {cls.authuser_table}" )
        if not re.search( '^[a-zA-Z0-9_]+$', cls.passwordlink_table ):
            raise ValueError( f"Invalid passwordlink table name {cls.passwordlink_table}" )

@contextlib.contextmanager
def _con_and_cursor():
    dbcon = psycopg.connect( host=RKAuthConfig.db_host, port=RKAuthConfig.db_port, dbname=RKAuthConfig.db_name,
                             user=RKAuthConfig.db_user, password=RKAuthConfig.db_password,
                             row_factory=psycopg.rows.dict_row )
    cursor = dbcon.cursor()

    yield dbcon, cursor

    cursor.close()
    dbcon.rollback()
    dbcon.close()


def _get_user( userid=None, username=None, email=None, many_ok=False ):
    if ( ( userid is not None ) + ( username is not None ) + ( email is not None ) ) != 1:
        raise RuntimeError( "Specify exactly one of {userid,username,email}" )

    q = f"SELECT u.*"
    if RKAuthConfig.usegroups:
        q += ",array_agg(g.name) AS groups"
    q += f" FROM {RKAuthConfig.authuser_table} u "
    if RKAuthConfig.usegroups:
        q += ( f"LEFT JOIN {RKAuthConfig.auth_user_group_link_table} aug ON u.id=aug.userid "
               f"LEFT JOIN {RKAuthConfig.authgroup_table} g ON aug.groupid=g.id " )
    subdict = {}
    if userid is not None:
        q += "WHERE u.id=%(uuid)s"
        subdict['uuid'] = userid
    elif username is not None:
        q += "WHERE username=%(username)s"
        subdict['username'] = username
    else:
        q += "WHERE email=%(email)s"
        subdict['email'] = email
    if RKAuthConfig.usegroups:
        q += " GROUP BY (u.id)"

    with _con_and_cursor() as con_and_cursor:
        cursor = con_and_cursor[1]
        cursor.execute( q, subdict )
        rows = cursor.fetchall()
        rows = [ SimpleNamespace( **r ) for r in rows ]
        if RKAuthConfig.usegroups:
            for row in rows:
                if row.groups == [None]:
                    row.groups = []
        if len(rows) > 1:
            if not many_ok:
                raise RuntimeError( "Multiple users found, this shouldn't happen" )
            return list(rows)
        if len(rows) == 0:
            return None
        else:
            return rows[0]

def get_user_by_uuid( userid ):
    return _get_user( userid=userid )

def get_user_by_username( username ):
    return _get_user( username=username )

def get_users_by_email( email ):
    return _get_user( email=email, many_ok=True )

def create_password_link( useruuid ):
    PasswordLink = namedtuple( 'passwordlink', [ 'id', 'userid', 'expires' ] )
    expires = datetime.datetime.now( datetime.timezone.utc ) + datetime.timedelta( hours=1 )
    pwlink = PasswordLink( uuid.uuid4(), useruuid, expires )

    with _con_and_cursor() as con_and_cursor:
        con, cursor = con_and_cursor
        cursor.execute( f"INSERT INTO {RKAuthConfig.passwordlink_table}(id,userid,expires) "
                        f"VALUES (%(uuid)s,%(userid)s,%(expires)s)",
                        { 'uuid': str(pwlink.id), 'userid': str(pwlink.userid), 'expires': pwlink.expires } )
        con.commit()

    return pwlink

def get_password_link( linkid ):
    with _con_and_cursor() as con_and_cursor:
        cursor = con_and_cursor[1]
        cursor.execute( f"SELECT * FROM {RKAuthConfig.passwordlink_table} WHERE id=%(uuid)s", { "uuid": linkid } )
        rows = cursor.fetchall()
        if len( rows ) == 0:
            return None
        elif len( rows ) > 1:
            raise RuntimeError( f"Multiple password links with id {linkdi}, this should never happen" )

        return rows[0]


@bp.route( '/getchallenge', methods=['POST'] )
def getchallenge():
    """Return an encrypted challenge.

    POST data JSON dictionary
    -------------------------
      username : str
        The username of the user trying to log in

    Response
    --------
      200 application/json or 500 text/plain

          { 'username': str  # user's username
            'privkey': str   # user's private key encrypted with user's password
            'salt': str      # salt used in generating the aes key from the user's password
            'iv': str        # init. vector used in decrypting the user's private key with the aes key
            'challenge': str # a uuid encrypted with the user's public key
          }

          In the envet of an error, returns an HTTP 500 with an utf8
          text error message.  Some specific errors returned:
             "No such user {username}"                            # if the user is not found int he database
             "User {username} does not have a password set yet"   # If the pubkey is null

    """
    try:
        flask.session['authenticated'] = False
        if not flask.request.is_json:
            return "Error, /auth/getchallenge was expecting application/json", 500
        data = flask.request.json

        if not 'username' in data:
            return "Error, no username sent to server", 500
        user = get_user_by_username( data['username'] )
        if user is None:
            return f"No such user {data['username']}", 500
        if user.pubkey is None:
            return f"User {data['username']} does not have a password set yet", 500

        tmpuuid = str( uuid.uuid4() )
        pubkey = Crypto.PublicKey.RSA.importKey( user.pubkey )
        cipher = Crypto.Cipher.PKCS1_OAEP.new( pubkey, hashAlgo=Crypto.Hash.SHA256 )
        flask.current_app.logger.debug( f"Sending challenge UUID {tmpuuid}" )
        challenge = binascii.b2a_base64( cipher.encrypt( tmpuuid.encode("UTF-8") ) ).decode( "UTF-8" ).strip()
        flask.session['username'] = user.username
        flask.session['useruuid'] = user.id
        flask.session['userdisplayname'] = user.displayname
        flask.session['useremail'] = user.email
        flask.session['usergroups'] = user.groups if hasattr( user, 'groups' ) else []
        flask.session['authuuid']= tmpuuid
        flask.session['authenticated'] = False
        retdata = { 'username': user.username,
                    'privkey': user.privkey['privkey'],
                    'salt': user.privkey['salt'],
                    'iv': user.privkey['iv'],
                    'challenge': challenge }
        return retdata
    except Exception as e:
        flask.current_app.logger.exception( "Exception in getchallenge" )
        return f"Exception in getchallenge: {str(e)}", 500


@bp.route( '/respondchallenge', methods=['POST'] )
def respondchallenge():
    """Check to see if the client passed the challenge, authenticate user if so.

    POST data JSON dictionary
    -------------------------
      username : str
        User's username

      response : str
        Decrypted challenge sent by getchallenge above

    Response
    --------
      200 application/json or 500 text/plain
         { 'status': 'ok',
           'message': 'User {username} logged in.',
           'useruuid': str,           # The users database uuid primary key
           'useremail': str,          # The user's email
           'userdisplayname': str,    # The user's display name
           'usergroups': list of str  # groups user is a member of (or [] if not using groups)
         }

         or, in the event that the challenge is incorrect:

         { 'status': 'error',
           'message': 'Authentication failure.'
         }

         Other errors return a HTTP 500 with a text/plain error message

    """
    try:
        if not flask.request.is_json:
            return "auth/respondchallenge was expecting application/json", 500
        if ( ( not 'username' in flask.request.json ) or
             ( not 'response' in flask.request.json ) ):
            return ( "Login error: username or challenge response missing "
                     "(you probably can't fix this, contact code maintainer)" ), 500
        if flask.request.json['username'] != flask.session['username']:
            return  ( f"Username {fask.request.json['username']} "
                      f"didn't match session username {flask.session['username']}; "
                      f"try logging out and logging back in." ), 500
        if flask.session["authuuid"] != flask.request.json['response']:
            return { 'error': 'Authentication failure.' }
        flask.session['authenticated'] = True
        return { 'status': 'ok',
                 'message': f'User {flask.session["username"]} logged in.',
                 'username': flask.session["username"],
                 'useruuid': str( flask.session["useruuid"] ),
                 'useremail': flask.session["useremail"],
                 'userdisplayname': flask.session["userdisplayname"],
                 'usergroups': flask.session["usergroups"],
                }
    except Exception as e:
        sys.stderr.write( f'{traceback.format_exc()}\n' )
        # return flask.jsonify( { 'error': f'Exception in RespondAuthChallenge: {str(e)}' } )
        return f"Exception in respondchallenge: {str(e)}", 500


@bp.route( '/getpasswordresetlink', methods=['POST'] )
def getpasswordresetlink():
    """Email a password reset link to the user.

    POST data JSON dict
    -------------------
      username : str (optional)
         The users's username; may be omitted, but one of username or
         email must be present.  If passed, email is ignored.

      email : str (optional)
         The user's email address.  There may be multiple users for each email; if email
         is passed, multiple email messages will be sent with reset links for all usernames.

    Response
    --------
    200 application/json or 500 text/plain

      If successful, returns { 'status': 'Password reset link(s) sent for {usernames}' }

      If failed, returns a 500 with a text error message.

    """
    try:
        if not flask.request.is_json:
            return "/auth/getpasswordresetlink was expecting application/json", 500

        if 'username' in flask.request.json and flask.request.json['username']:
            username = flask.request.json['username']
            them = get_user_by_username( username )
            if them is None:
                return f"username {username} not known", 500
        elif 'email' in flask.request.json and flask.request.json['email']:
            email = flask.request.json['email']
            them = get_users_by_email( email )
            if them is None:
                return f"email {email} not known", 500
        else:
            return "Must include either 'username' or 'email' in POST data", 500

        if not isinstance( them, list ):
            them = [ them ]

        sentto = ""
        for user in them:

            pwlink = create_password_link( user.id )

            if RKAuthConfig.webap_url is None:
                webap_url = flask.request.base_url.replace( '/getpasswordresetlink', '' )
            else:
                webap_url = RKAuthConfig.webap_url

            # HACK ALERT
            # On NERSC Spin, because of the web proxying, the webap_url
            #   was coming out at "http://" instead of "https://".  This
            #   was even if it was originally contacted via https://.
            #   Since this should never be used with http anyway, let's
            #   just replace http with https.  This is a bit ugly, but
            #   it should generally work, and we don't want to go down
            #   the rabbit hole of figuring out actual URLs via web proxies
            #   and so forth.
            webap_url = webap_url.replace( "http://", "https://" )

            if RKAuthConfig.smtp_use_ssl:
                ssl_context = ssl.create_default_context()
                smtp = smtplib.SMTP_SSL( RKAuthConfig.smtp_server, RKAuthConfig.smtp_port, context=ssl_context )
            else:
                smtp = smtplib.SMTP( RKAuthConfig.smtp_server, RKAuthConfig.smtp_port )
            if RKAuthConfig.smtp_username is not None:
                smtp.login( RKAuthConfig.smtp_username, RKAuthConfig.smtp_password )

            policy = EmailPolicy( max_line_length=999, linesep='\n' )
            msg = EmailMessage( policy )
            msg['Subject'] = RKAuthConfig.email_subject
            msg['From'] = RKAuthConfig.email_from
            msg['To'] = user.email
            flask.current_app.logger.debug(
                f"webap_url is {webap_url}; RKAuthConfig.webap_url is {RKAuthConfig.webap_url}; "
                f"flask.request.base_url is {flask.request.base_url}\n" )
            msg.set_content(f"Somebody requested a password reset for {user.username}\n"
                            f"for {RKAuthConfig.email_system_name}.  This link will expire in 1 hour.\n"
                            f"\n"
                            f"If you did not request this, you may ignore this message.\n"
                            f"Here is the link; cut and paste it into your browser:\n"
                            f"\n"
                            f"{webap_url}/resetpassword?uuid={str(pwlink.id)}" )
            try:
                smtp.send_message( msg, RKAuthConfig.email_from, to_addrs=user.email )
            except Exception as ex:
                flask.current_app.logger.exception( f"Exception sending mail from {RKAuthConfig.email_from} "
                                                    f"to {user.email} with message {msg} : {ex}" )
                raise
            smtp.quit()
            if len(sentto) > 0:
                sentto += " "
            sentto += user.username
        return { 'status': f'Password reset link(s) sent for {sentto}.' }
    except Exception as e:
        flask.current_app.logger.exception( "Exception in getpasswordresetlink" )
        return f"Exception in getpasswordresetlink: {str(e)}", 500

@bp.route( '/resetpassword', methods=['GET'] )
def resetpassword():
    """Prompt user to reset password.

    Call it at /resetpassword?<uuid>
    where <uuid> is the uuid of the password reset link.

    Spits out an HTML page.

    """
    response = "<!DOCTYPE html>\n"
    response += "<html>\n<head>\n<meta charset=\"UTF-8\">\n"
    response += f"<title>Password Reset</title>\n"

    webapdirurl = str( pathlib.Path( flask.request.path ).parent.parent )
    if webapdirurl[-1] != '/':
        webapdirurl += "/"
    flask.current_app.logger.debug( f"In ResetPassword, webapdirurl is {webapdirurl}\n" )
    response += "<script src=\"" + webapdirurl + "static/resetpasswd_start.js\" type=\"module\"></script>\n"
    response += "</head>\n<body>\n"
    response += f"<h1>Reset Password</h1>\n<p><b>ROB Todo: make this header better</b></p>\n";

    try:
        if not 'uuid' in flask.request.args:
            response += "<p>Malformed password reset URL.</p>\n</body></html>"
            return flask.make_response( response )

        pwlink = get_password_link( flask.request.args['uuid'] )
        if pwlink is None:
            response += "<p>Invalid password reset URL.</p>\n</body></html>"
            return flask.make_response( response )
        if pwlink['expires'] < datetime.datetime.now(pytz.utc):
            response += "<p>Password reset link has expired.</p>\n</body></html>"
            return flask.make_response( response )
        user = get_user_by_uuid( pwlink['userid'] )

        response += f"<h2>Reset password for {user.username}</h2>\n"
        response += "<div id=\"authdiv\">"
        response += "<table>\n"
        response += "<tr><td>New Password:</td><td>"
        response += ( "<input type=\"password\" name=\"newpassword\" id=\"reset_password\" "
                      "type=\"password\" size=20>" )
        response += "</td></tr>\n"
        response += "<tr><td>Confirm:</td><td>"
        response += ( "<input type=\"password\" name=\"confirmpassword\" id=\"reset_confirm_password\" "
                      "type=\"password\" size=20>" )
        response += "</td></tr>\n"
        response += "<tr><td colspan=\"2\">"
        response += "<button name=\"getnewpassword\" id=\"setnewpassword_button\">Set New Password</button>\n"
        response += "</td></tr>\n</table>\n"
        response += "</div>\n"
        response += ( f"<input type=\"hidden\" name=\"linkuuid\" id=\"resetpasswd_linkid\" "
                      f"value=\"{str(pwlink['id'])}\">" )
        response += "</body>\n</html>\n"
        return flask.make_response( response )
    except Exception as e:
        sys.stderr.write( f'{traceback.format_exc()}\n' )
        return f"Exception in resetpassword: {str(e)}", 500


@bp.route( '/changepassword', methods=['POST'] )
def changepassword():
    """Change the user's authentication information in the database.

    Removes the password link from the database (making it invalid).

    POST data JSON dictionary
    -------------------------
       passwordlinkid : str
          The uuid of a valid password reset link for this user

       publickey : str
          PEM spki encoded RSA public key

       privatekey : str
          base64 encoded encrypted private key in the format that
          rkauth.js wants

       salt : str
          base64 encoded binary salt used in converting the user's
          password to the aes key used to encrypt the user's private
          key.

       iv : str
          base64 encoded binary initialization vector used in
          aes encrypting the users' private key

    Response
    ---------
      200 application/json or 500 text/plain
        If successful, returns { "status": "Password change" }
        If failed, returns an HTTP 500 with a text error message

    """
    try:
        if not flask.request.is_json:
            return "Error, /auth/changepassword was expecting application/json", 500
        for key in [ "passwordlinkid", "publickey", "privatekey", "salt", "iv" ]:
            if not key in flask.request.json:
                return f"Error, call to changepassword without {key}", 500

        pwlink = get_password_link( flask.request.json['passwordlinkid'] )
        if pwlink is None:
            return "Invalid password link {flask.request.json['passwordlinkid']}", 500

        with _con_and_cursor() as con_and_cursor:
            con, cursor = con_and_cursor
            cursor.execute( f"SELECT * FROM {RKAuthConfig.authuser_table} WHERE id=%(uuid)s",
                            {'uuid': pwlink['userid']} )
            rows = cursor.fetchall()
            if len(rows) == 0:
                return f"Unknown user id {pwlink['userid']}; this shouldn't happen", 500
            user = rows[0]

            cursor.execute( f"UPDATE {RKAuthConfig.authuser_table} SET pubkey=%(pubkey)s,privkey=%(privkey)s "
                            f"WHERE id=%(uuid)s",
                            { 'uuid': user['id'],
                              'pubkey': flask.request.json['publickey'],
                              'privkey': psycopg.types.json.Jsonb(
                                  { 'privkey': flask.request.json['privatekey'],
                                    'salt': flask.request.json['salt'],
                                    'iv': flask.request.json['iv'] } ),
                             } )
            cursor.execute( f"DELETE FROM {RKAuthConfig.passwordlink_table} WHERE id=%(uuid)s",
                            { 'uuid': flask.request.json['passwordlinkid'] } )
            con.commit()
            return { "status": "Password changed" }
    except Exception as e:
        flask.current_app.logger.exception( "Exception in changepassword" )
        return f"Exception in changepassword: {str(e)}", 500


@bp.route( '/isauth', methods=['POST'] )
def isauth():
    """Return authentcation information about current session.

    Response
    --------
    200 application/json
      If the user is authenticated in the session, then returns:
        { "status": True,
          "username": str,          # username of authenticated user
          "useruuid": str,          # database primary key of authenticated user
          "useremail": str,         # email of authenticated user
          "userdisplayname": str,   # display name of authenticated user
          "usergroups": list of str # groups user is a member of (or [] if not using groups)
        }

      If the user is not authenticated, returns { "status": False }

    """

    if ( 'authenticated' in flask.session ) and ( flask.session['authenticated'] ):
        return flask.jsonify( { 'status': True,
                                'username': flask.session["username"],
                                'useruuid': str( flask.session["useruuid"] ),
                                'useremail': flask.session["useremail"],
                                'userdisplayname': flask.session["userdisplayname"],
                                'usergroups': flask.session["usergroups"],
                               } )
    else:
        return flask.jsonify( { 'status': False } );


@bp.route( '/logout', methods=['GET','POST'] )
def logout():
    """Removes authentication information from session.

    Response
    --------
    200 applcation/json
        { "status": "Logged out" }

    """
    flask.session['authenticated'] = False
    del flask.session['username']
    del flask.session['useruuid']
    del flask.session['useremail']
    del flask.session['userdisplayname']
    return flask.jsonify( { 'status': 'Logged out' } )
