#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023-2024 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

#### HOW TO USE
#
# This is for a webap built with web.py and a PostgreSQL database
#
# 1. Make sure the expected databsae table exist (see "DATABASE
#    ASSUMPTIONS" in rkauth_flask.py).
#
# 2. Import the module as a submodule to your main webap, with
#    "import rkauth_webpy" or something similar.
#
# 3. Configure the database, and configure email for password link sending.
#    After you've imported this file, call the setdbparams() class method of the
#    RKAuthConfig class:
#      rkauth_webpy.RKAuthConfig.setdbparams(
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
# 4. Add the module as a submodule to your main webap.  Near the bottom of your webap:
#
#    urls = ( ...
#             "/auth", rkauth_webpy.app
#           )
#    ...
#    app = web.application( urls, locals() )
#    ...
#    initializer = { ... }
#    initializer.update( rkauth_webpy.initializer )
#    session = web.session.Session( app, web.session.DiskStore(...), initalizer=initializer )
#    def session_hook(): web.ctx.session = session
#    app.add_processor( web.loadhook( session_hook ) )
#
# In your webap, you can find out if the user has been authenticated by
# accessing the session via web.ctx.session. Variables in the session:
#    authenticated : True or False
#    useruuid
#    username
#    userdisplayname
#    useremail
#    ( there's also authuuid, a temporary throwaway value )
#
# (Won't work with web.py templates, see https://webpy.org/cookbook/sessions_with_subapp )
#
# 3. CLIENT SIDE:
#
# use rkauth.js and resetpasswd_start.js.  It assumes that there are
# css classes "link" and "center" defined.  When you start up the
# javascript of your web application, instantiate a rkAuth, and then
# call checkAuth() on that instance at the end of your initialization;
# use the callbacks you passed to the constructor to do the rest of
# your rendering.
#
# See the example in test/docker_webpy for an example.

import sys
import re
import uuid
import pathlib
import contextlib
from collections import namedtuple
import binascii
import traceback
import json
import datetime

import pytz
import psycopg2
import psycopg2.extras
import psycopg2.extensions
psycopg2.extensions.register_adapter( dict, psycopg2.extras.Json )

import smtplib
import ssl
from email.message import EmailMessage
from email.policy import EmailPolicy

import web
from web import form
import Crypto.PublicKey.RSA
import Crypto.Cipher.PKCS1_OAEP
import Crypto.Hash


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

        email_from : the From line in password reset emails
        email_subject : the subject line in password reset emails
        email_system_name :
        smtp_server : smtp server for sending password reset emails
        smtp_port : port for smtp_server
        smtp_use_ssl : bool, default True
        smtp_username : str or None
        smtp_password : str or None

        webap_url : where the *auth* ap is found.  Usually...

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


# ======================================================================
# Utility functions that are the same as rkauth_flask.py, and so
#  should probably moved to an external thing that's included...

@contextlib.contextmanager
def _con_and_cursor():
    dbcon = psycopg2.connect( host=RKAuthConfig.db_host, port=RKAuthConfig.db_port, dbname=RKAuthConfig.db_name,
                              user=RKAuthConfig.db_user, password=RKAuthConfig.db_password,
                              cursor_factory=psycopg2.extras.NamedTupleCursor )
    cursor = dbcon.cursor()

    yield dbcon, cursor

    cursor.close()
    dbcon.rollback()
    dbcon.close()


def _get_user( userid=None, username=None, email=None, many_ok=False ):
    if ( ( userid is not None ) + ( username is not None ) + ( email is not None ) ) != 1:
        raise RuntimeError( "Specify exactly one of {userid,username,email}" )

    q = f"SELECT * FROM {RKAuthConfig.authuser_table} "
    subdict = {}
    if userid is not None:
        q += "WHERE id=%(uuid)s"
        subdict['uuid'] = userid
    elif username is not None:
        q += "WHERE username=%(username)s"
        subdict['username'] = username
    else:
        q += "WHERE email=%(email)s"
        subdict['email'] = email

    with _con_and_cursor() as con_and_cursor:
        cursor = con_and_cursor[1]
        cursor.execute( q, subdict )
        rows = cursor.fetchall()
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
    expires = datetime.datetime.now( datetime.UTC ) + datetime.timedelta( hours=1 )
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
            raise RuntimeError( f"Multiple password links with id {linkid}, this should never happen" )

        return rows[0]




# ======================================================================

class ErrorResponse(web.HTTPError):
    def __init__( self, text, content_type='text/plain; charset=utf-8' ):
        web.HTTPError.__init__( self, "500 Internal Server Error", { 'Content-Type': content_type }, text )


# ======================================================================

class HandlerBase:
    def GET( self ):
        return self._do_the_things()

    def POST( self ):
        return self._do_the_things()

    def _do_the_things( self ):
        rval = self.do_the_things()
        status = "200 OK"
        if isinstance( rval, tuple ):
            if len(rval) == 2:
                transdict = {
                    500: '500 Internal Server Error',
                }
                if rval[1] not in transdict.keys():
                    raise RuntimeError( f"Unknown status {status}" )
                status = transdict[ rval[1] ]
                rval = rval[0]
            else:
                raise RuntimeError( f"tuples from do_the_things must be length 2, not {len(rval)}" )
        mimetype = "text/plain; charset=utf-8"
        if isinstance( rval, dict ) or isinstance( rval, list ):
            rval = json.dumps( rval )
            mimetype = 'application/json'
        elif isinstance( rval, str ):
            if rval[0:15] == "<!DOCTYPE html>":
                mimetype = 'text/html; charset=utf-8'
            else:
                mimetype = 'text/plain; charset=utf-8'
        else:
            raise RuntimeError( f"Invalid type {type(rval)} returned from do_the_things" )

        if status == "200 OK":
            web.header( 'Content-Type', mimetype )
            return rval
        else:
            raise ErrorResponse( rval, mimetype )


# ======================================================================

class GetAuthChallenge(HandlerBase):
    def __init__( self ):
        super().__init__()

    def do_the_things( self ):
        try:
            web.ctx.session.authenticated = False
            inputdata = json.loads( web.data().decode(encoding="utf-8") )
            if 'username' not in inputdata:
                return 'No username sent to server', 500
            user = get_user_by_username( inputdata['username'] )
            if user is None:
                return f"No such user {inputdata['username']}", 500
            if user.pubkey is None:
                return f"User {inputdata['username']} does not have a password set yet", 500

            tmpuuid = str( uuid.uuid4() )
            pubkey = Crypto.PublicKey.RSA.importKey( user.pubkey )
            cipher = Crypto.Cipher.PKCS1_OAEP.new( pubkey, hashAlgo=Crypto.Hash.SHA256 )
            challenge = binascii.b2a_base64( cipher.encrypt( tmpuuid.encode("UTF-8") ) ).decode( "UTF-8" ).strip()
            # sys.stderr.write( f"Setting session username={user.username}, id={user.id}\n" )
            web.ctx.session.username = user.username
            web.ctx.session.useruuid = user.id
            web.ctx.session.userdisplayname = user.displayname
            web.ctx.session.useremail = user.email
            web.ctx.session.authuuid = tmpuuid
            retdata = { 'username': user.username,
                        'privkey': user.privkey['privkey'],
                        'salt': user.privkey['salt'],
                        'iv': user.privkey['iv'],
                        'challenge': challenge }
            return retdata
        except Exception as e:
            sys.stderr.write( f'{traceback.format_exc()}\n' )
            return f"Exception in getchallenge: {str(e)}", 500


class RespondAuthChallenge(HandlerBase):
    def __init__( self ):
        super().__init__()

    def do_the_things( self ):
        try:
            inputdata = json.loads( web.data().decode(encoding="utf-8") )
            if ( ( 'username' not in inputdata ) or
                 ( 'response' not in inputdata ) ):
                return ( "Login error; username or challenge response missing "
                         "(you probably can't fix this, contact code maintainer)" ), 500
            if inputdata['username'] != web.ctx.session.username:
                return ( f"Username {inputdata['username']} "
                         f"didn't match session username {web.ctx.session.username}; "
                         f"try logging out and logging back in." ), 500
            if web.ctx.session.authuuid != inputdata['response']:
                return { 'error': 'Authentication failure.' }
            web.ctx.session.authenticated = True
            return { 'status': 'ok',
                     'message': f'User {web.ctx.session.username} logged in.',
                     'username': web.ctx.session.username,
                     'useruuid': str( web.ctx.session.useruuid ),
                     'useremail': web.ctx.session.useremail,
                     'userdisplayname': web.ctx.session.userdisplayname,
                    }
        except Exception as e:
            sys.stderr.write( f'{traceback.format_exc()}\n' )
            # return { 'error': f'Exception in RespondAuthChallenge: {str(e)}' }
            return f"Exception in RespondAuthChallenge: {str(e)}", 500


# ======================================================================

class GetPasswordResetLink(HandlerBase):
    def __init__( self ):
        super().__init__()

    def do_the_things( self ):
        try:
            inputdata = json.loads( web.data().decode(encoding="utf-8") )
            if 'username' in inputdata:
                username = inputdata['username']
                them = get_user_by_username( username )
                if them is None:
                    return f"username {username} not known", 500
            elif 'email' in inputdata:
                email = inputdata['email']
                them = get_users_by_email( email )
                if them is None:
                    return f"email {email} not known", 500
            else:
                return "Must include eitehr 'username' or 'email' in POST data", 500

            if not isinstance( them, list ):
                them = [ them ]

            sentto = ""
            for user in them:
                pwlink = create_password_link( user.id )
                if RKAuthConfig.webap_url is None:
                    webap_url = web.ctx.home
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
            sys.stderr.write( f"webap_url is {webap_url}; RKAuthConfig.webap_url is {RKAuthConfig.webap_url}; "
                              f"web.ctx.home is {web.ctx.home}\n" )
            msg.set_content(f"Somebody requested a password reset for {user.username}\n"
                            f"for {RKAuthConfig.email_system_name}.  This link will expire in 1 hour.\n"
                            f"\n"
                            f"If you did not request this, you may ignore this message.\n"
                            f"Here is the link; cut and paste it into your browser:\n"
                            f"\n"
                            f"{webap_url}/resetpassword?uuid={str(pwlink.id)}" )
            smtp.send_message( msg, RKAuthConfig.email_from, to_addrs=user.email )
            smtp.quit()
            if len(sentto) > 0:
                sentto += " "
            sentto += user.username
            return { 'status': f'Password reset link(s) sent for {sentto}.' }
        except Exception as e:
            sys.stderr.write( f'{traceback.format_exc()}\n' )
            return f"Exception in GetPasswordResetLink: {str(e)}", 500


# ======================================================================

class ResetPassword(HandlerBase):
    def __init__( self ):
        super().__init__()

    def do_the_things( self ):
        response = "<!DOCTYPE html>\n"
        response += "<html>\n<head>\n<meta charset=\"UTF-8\">\n"
        response += "<title>Password Reset</title>\n"

        # webapdirurl = str( pathlib.Path( web.ctx.env['SCRIPT_NAME'] ).parent )
        webapdirurl = str( pathlib.Path( web.ctx.homepath ).parent.parent )
        if webapdirurl[-1] != '/':
            webapdirurl += "/"
        # sys.stderr.write( f"In ResetPassword, webapdirurl is {webapdirurl}\n" )
        # response += "<link href=\"" + webapdirurl
        # response += "photodb.css\" rel=\"stylesheet\" type=\"text/css\">\n"
        response += "<script src=\"" + webapdirurl + "resetpasswd_start.js\" type=\"module\"></script>\n"
        response += "</head>\n<body>\n"
        response += "<h1>Reset Password</h1>\n<p><b>ROB Todo: make this header better</b></p>\n"

        try:
            inputdata = web.input()
            if not hasattr( inputdata, "uuid" ):
                response += "<p>Malformed password reset URL.</p>\n</body></html>"
                return response

            pwlink = get_password_link( inputdata.uuid )
            if pwlink is None:
                response += "<p>Invalid password reset URL.</p>\n</body></html>"
                return response
            if pwlink.expires < datetime.datetime.now(pytz.utc):
                response += "<p>Password reset link has expired.</p>\n</body></html>"
                return response
            user = get_user_by_uuid( pwlink.userid )

            response += f"<h2>Reset password for {user.username}</h2>\n"
            response += "<div id=\"authdiv\">"
            response += "<table>\n"
            response += "<tr><td>New Password:</td><td>"
            response += form.Input( name="newpassword", id="reset_password",
                                         type="password", size=20 ).render()
            response += "</td></tr>\n"
            response += "<tr><td>Confirm:</td><td>"
            response += form.Input( name="confirmpassword", id="reset_confirm_password",
                                         type="password", size=20 ).render()
            response += "</td></tr>\n"
            response += "<tr><td colspan=\"2\">"
            response += form.Button( name="getnewpassword", id="setnewpassword_button",
                                          html="Set New Password" ).render()
            response += "</td></tr>\n</table>\n"
            response += "</div>\n"
            response += form.Input( name="linkuuid", id="resetpasswd_linkid", type="hidden",
                                         value=str(pwlink.id) ).render()

            response += "</body>\n</html>\n"
            return response
        except Exception as e:
            sys.stderr.write( f'{traceback.format_exc()}\n' )
            return f"Exception in resetpassword: {str(e)}", 500


# ======================================================================

class ChangePassword(HandlerBase):
    def __init__( self ):
        super().__init__()

    def do_the_things( self ):
        try:
            sys.stderr.write( "In ChangePassword...\n" )
            inputdata = json.loads( web.data().decode(encoding="utf-8") )
            for key in [ "passwordlinkid", "publickey", "privatekey", "salt", "iv" ]:
                if key not in inputdata:
                    return f"Error, call to changepassword without {key}", 500

            pwlink = get_password_link( inputdata['passwordlinkid'] )
            if pwlink is None:
                return "Invalid password link {inputdata['passwordlinkid']}", 500

            with _con_and_cursor() as con_and_cursor:
                con, cursor = con_and_cursor
                cursor.execute( f"SELECT * FROM {RKAuthConfig.authuser_table} WHERE id=%(uuid)s",
                                {'uuid': pwlink.userid} )
                rows = cursor.fetchall()
                if len(rows) == 0:
                    return "Unknown user id {pwlink.userid}; this shouldn't happen", 500
                user = rows[0]

                cursor.execute( f"UPDATE {RKAuthConfig.authuser_table} SET pubkey=%(pubkey)s,privkey=%(privkey)s "
                                f"WHERE id=%(uuid)s",
                                { 'uuid': user.id,
                                  'pubkey': inputdata['publickey'],
                                  'privkey': { 'privkey': inputdata['privatekey'],
                                               'salt': inputdata['salt'],
                                               'iv': inputdata['iv'] } } )
                cursor.execute( f"DELETE FROM {RKAuthConfig.passwordlink_table} WHERE id=%(uuid)s",
                                { 'uuid': inputdata['passwordlinkid'] } )
                con.commit()
                return { "status": "Password changed" }
        except Exception as e:
            sys.stderr.write( f'{traceback.format_exc()}\n' )
            return f"Exception in ChangePassword: {str(e)}", 500


# ======================================================================

class CheckIfAuth(HandlerBase):
    def __init__( self ):
        super().__init__()

    def do_the_things( self ):
        # sys.stderr.write( f'In CheckIfAuth; web.ctx.session.authenticated={web.ctx.session.authenticated}\n' )
        if ( hasattr( web.ctx, 'session' ) and
             hasattr( web.ctx.session, 'authenticated' ) and
             web.ctx.session.authenticated ):
            return { 'status': True,
                     'username': web.ctx.session.username,
                     'useruuid': str( web.ctx.session.useruuid ),
                     'useremail': web.ctx.session.useremail,
                     'userdisplayname': web.ctx.session.userdisplayname,
                    }
        return { 'status': False }


# ======================================================================

class Logout(HandlerBase):
    def __init__( self ):
        super().__init__()

    def do_the_things( self ):
        web.ctx.session.kill()
        return { 'status': 'Logged out' }


# ======================================================================

initializer = { 'username': None,
                'useruuid': None,
                'userdisplayname': None,
                'useremail': None,
                'authenticated': False,
                'authuuid': None }
urls = ( "/getchallenge", "GetAuthChallenge",
         "/respondchallenge", "RespondAuthChallenge",
         "/getpasswordresetlink", "GetPasswordResetLink",
         "/resetpassword", "ResetPassword",
         "/changepassword", "ChangePassword",
         "/isauth", "CheckIfAuth",
         "/logout", "Logout"
)

app = web.application( urls, locals() )
