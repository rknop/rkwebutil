#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023-2024 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

#### HOW TO USE
# This is for a webap built with flask and a database built with SQLAlchemy.
#
# An example may be found in test/docker_flaskserver
#
# 1. Create the db module (see "DATABASE ASSUMPTIONS" below).  It must
#    be able to fully initialze the database.  (This could include a
#    call to a function inside it from your main webap code, for
#    instance.)  An example is in test/docker_flaskserver/ap/db.py
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
#         SESSION_FILE_THRESHOLD=1000,
#      )
#
#    replace '/sessions' with the directory where the web server can store session files.
#
# 4. Configure email for password link sending.  After you've imported this file,
#    do the following:
#      rkauth.RKAuthConfig.email_from = 'your webap <nobody@nowhere.org>'
#      rkauth.RKAuthConfig.email_subject = 'reset password email subject'
#      rkauth.RKAuthConfig.email_system_name = 'your webapp system name'
#      rkauth.RKAuthConfig.smtp_server = 'your smtp server'
#      rkauth.RKAuthConfig.smtp_port = 465
#      rkauth.RKAuthConfig.smtp_use_ssl = True
#      rkauth.RKAuthConfig.smtp_username = 'your smtp username'
#      rkauth.RKAuthConfig.smtp_password = 'your smtp passwrd'
#      rkauth.RKAuthConfig.webap_url = '<url>/auth'
#
#    Make all of the variables the right things so that you can send
#    email, and so that the email headers and body look like what you'd
#    want.  In particular, <url> must be the base url of your web
#    application.
#
# 5. Add the following code:
#      app.register_blueprint( rkauth.bp )
#
#    That will hook up a subapplication /auth under your main webap that
#    handles all of the authentication stuff.
#
# TODO ROB WRITE THE REST
## OLD
## In your webap, you can find out if the user has been authenticated by
## accessing the session; 
##    authenticated : True or False
##    useruuid
##    username
##    userdisplayname
##    useremail
##    ( there's also authuuid, a temporary throwaway value )
##
## CLIENT SIDE:
##
## use rkauth.js and resetpasswd_start.js.  It assumes that there are
## css classes "link" and "center" defined.  When you start up the
## javascript of your web application, instantiate a rkAuth, and then
## call checkAuth() on that instance at the end of your initialization;
## use the callbacks you passed to the constructor to do the rest of
## your rendering.  See the example in tests/docker_flaskwebserver for an
## example.


# ======================================================================
# DATABASE ASSUMPTIONS
#
# This file imports a module db which must include the following SQLAlchemy models:
#
# db.AuthUser
#   columns:
#     id (postgres UUID, primary key, unique)
#     username (text, unique)
#     displayname (text)
#     email (text)
#     pubkey (text)
#     privkey (postgres JSONB)
#
#   methods:
#      @classmethod
#      def get( cls, id, session=None ):
#         Takes a string or uuid as id, optionally an SQLAlchmey session (or equivalent),
#         returns a db.AuthUser or None
#
#      @classmethod
#      def get( cls, name, session=None ):
#
#      @classmethod
#      def getbyemail( cls, name, session=None ):
#
# db.PasswordLink
#   columns:
#     id (postgres UUID, primary key, unique)
#     userid (postgres UUID, foreignkey to db.AuthUser.id)
#     expires (DateTime(timezone=True))
#
#   methods:
#     @classmethod
#     def new( cls, userid, expires=None, session=None ):
#        Given a userid, create a new password link.  If expires is None,
#        will be 1 hour from right now.  session is optinally
#        an SQLAlchemy session (or equivalent)
#
#     @classmethod
#     def get( cls, uuid, session=None ):
#        Given a string or uuid, and optionally an SQLAlchemy session or
#        equivalent, return a PaswordLink or None
# web.smtp also needs to be fully configured
#

import sys
import pathlib
import binascii
import uuid
import datetime
import pytz
import traceback
import smtplib
import ssl
from email.message import EmailMessage
from email.policy import EmailPolicy
import flask
import Crypto.PublicKey.RSA
import Crypto.Cipher.PKCS1_OAEP
import Crypto.Hash

_dir = pathlib.Path(__file__).parent
if str(_dir) not in sys.path:
    sys.path.append( str(_dir) )

import db

bp = flask.Blueprint( 'auth', __name__, url_prefix='/auth' )

class RKAuthConfig:
    """Global rkauth config.

    After importing auth, reset these two variables to what you want to
    see in the header of the "reset password" emails.

    """
    email_from = 'RKAuth <nobody@nowhere.org>'
    email_subject = 'RKAuth password reset'
    email_system_name = 'a webserver using the RKAuth system'
    smtp_server = 'some_smtp_server'
    smtp_port = 465
    smtp_use_ssl = True
    smtp_username = None
    smtp_password = None
    webap_url = None

    def setdbparams( *args ):
        """....weird

        I don't understand why this is necessary, but see
        docker_flaskserver/ap/__init__.py and search for
        RKAuthConfig.setdbparams.

        """
        db.setdbparams( *args )

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
        users = db.AuthUser.getbyusername( data['username'] )
        if len(users) > 1:
            return f"Error, {data['username']} is multiply defined, database is corrupted", 500
        if len(users) == 0:
            return f"No such user {data['username']}", 500
        user = users[0]
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
           'useruuid': str,        # The users database uuid primary key
           'useremail': str,       # The user's email
           'userdisplayname': str  # The user's display name
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
            return ( "Login error: username or challenge response missing"
                     "(you probably can't fix this, contact code maintainer)" ), 500
        if flask.request.json['username'] != flask.session['username']:
            return  ( f"Username {username} didn't match session username {flask.session['username']}; "
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
                }
    except Exception as e:
        sys.stderr.write( f'{traceback.format_exc()}\n' )
        return flask.jsonify( { 'error': f'Exception in RespondAuthChallenge: {str(e)}' } )


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
        if 'username' in flask.request.json:
            username = flask.request.json['username']
            them = db.AuthUser.getbyusername( username );
            if len( them ) == 0:
                return f"username {username} not known", 500
            if len( them ) > 1:
                return f"Error, {username} is multiply defined, database is corrupted", 500
        elif 'email' in flask.request.json:
            email = flask.request.json['email']
            them = db.AuthUser.getbyemail( email )
            if len( them ) == 0:
                return f"email {email} not known", 500
        else:
            return "Must include either 'username' or 'email' in POST data", 500

        sentto = ""
        for user in them:
            link = db.PasswordLink.new( user.id )
            if RKAuthConfig.webap_url is None:
                webap_url = flask.request.base_url
            else:
                webap_url = RKAuthConfig.webap_url

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
                            f"{webap_url}/resetpassword?uuid={str(link.id)}" )
            smtp.send_message( msg, RKAuthConfig.email_from, to_addrs=user.email )
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
        pwlink = db.PasswordLink.get( flask.request.args['uuid'] )
        if pwlink is None:
            response += "<p>Invalid password reset URL.</p>\n</body></html>"
            return flask.make_response( response )
        if pwlink.expires < datetime.datetime.now(pytz.utc):
            response += "<p>Password reset link has expired.</p>\n</body></html>"
            return flask.make_response( response )
        user = db.AuthUser.get( pwlink.userid )

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
                      f"value=\"{str(pwlink.id)}\">" )
        response += "</body>\n</html>\n"
        return flask.make_response( response )
    except Exception as e:
        sys.stderr.write( f'{traceback.format_exc()}\n' )
        response += f'Exception in ResetPassword: {str(e)}'
        return flask.make_response( response )


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
                return f"Error, call to changepassword without {key}"

        with db.DBSession() as dbsess:
            pwlink = db.PasswordLink.get( flask.request.json['passwordlinkid'], session=dbsess )
            user = db.AuthUser.get( pwlink.userid, session=dbsess )
            user.pubkey = flask.request.json['publickey']
            user.privkey = { 'privkey': flask.request.json['privatekey'],
                             'salt': flask.request.json['salt'],
                             'iv': flask.request.json['iv'] }
            dbsess.delete( pwlink )
            dbsess.commit()
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
          "userdisplayname": str    # display name of authenticated user
        }

      If the user is not authenticated, returns { "status": False }

    """

    if ( 'authenticated' in flask.session ) and ( flask.session['authenticated'] ):
        return flask.jsonify( { 'status': True,
                                'username': flask.session["username"],
                                'useruuid': str( flask.session["useruuid"] ),
                                'useremail': flask.session["useremail"],
                                'userdisplayname': flask.session["userdisplayname"],
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
