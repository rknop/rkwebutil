#!/usr/bin/python3
# -*- coding: utf-8 -*-

# This file is part of rkwebutil
#
# rkwebutil is Copyright 2023-2024 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

import sys
import pathlib
import web

_dir = pathlib.Path(__file__).parent
if str(_dir) not in sys.path:
    sys.path.append( str(_dir) )

import rkauth_webpy

# In reality, you don't want to hardcode passwords, and you want to read this
#   from some kind of config.  This is here for the automated tests.
rkauth_webpy.RKAuthConfig.setdbparams(
    db_host = "postgres",
    db_port = 5432,
    db_user = "postgres",
    db_password = "fragile",
    db_name = "test_rkwebutil",
        email_from = 'rkwebutil test <nobody@nowhere.org>',
        email_subject = 'rkwebutil test password reset',
        email_system_name = 'the rkwebutil test webserver',
        smtp_server = 'mailhog',
        smtp_port = 1025,
        smtp_use_ssl = False,
        smtp_username = None,
        smtp_password = None,
        # webap_url = 'https://flask:8080/auth'
    )

# ======================================================================

class HandlerBase(object):
    def __init__( self ):
        self.response = ""

    def GET( self, *args, **kwargs ):
        return self.do_the_things( *args, **kwargs )

    def POST( self, *args, **kwags ):
        return self.do_the_things( *args, **kwargs )

    def isauthenticated( self ):
        return hasattr( web.ctx.session, "authenticated" ) and web.ctx.session.authenticated

    def verifyauth( self ):
        if not self.isauthenticated():
            raise RuntimeError( "User not authenticated" )

    def jsontop( self ):
        web.header( 'Content-Type', 'application/json' )
        
    def htmltop( self ):
        web.header( 'Content-Type', 'text/html; charset="UTF-8"' )
        webapdirurl = str( pathlib.Path( web.ctx.homepath ).parent )
        # This is annoying
        webapdirurl += "/" if webapdirurl[-1] != "/" else ""
        self.response = "<!DOCTYPE html>\n"
        self.response += "<html>\n<head>\n<meta charset=\"UTF-8\">\n"
        self.response += "<title>RKWebutil Test</title>"
        self.response += f"<link rel=\"stylesheet\" href=\"{webapdirurl}ap.css\">\n"
        self.response += f"<script src=\"{webapdirurl}ap.js\" type=\"module\"></script>\n"
        self.response += f"<script src=\"{webapdirurl}ap_start.js\" type=\"module\"></script>\n"
        self.response += "</head>\n"
        self.response += "<h1>RKWebUtil Auth Test</h1>\n"
        self.response += "<div id=\"status-div\" name=\"status-div\"></div>\n"
        
    def htmlbottom( self ):
        self.response += "</body>\n</html>\n"

# ======================================================================
# web.py handler classes

class FrontPage(HandlerBase):
    def do_the_things( self ):
        self.htmltop()
        if self.isauthenticated():
            self.response += "<h2>Logged in</h2>\n"
            self.response += f"<p>You are logged in as {web.ctx.session.username} ({web.ctx.session.userdisplayname})</p>\n"
        else:
            self.response += "<h2>Not Logged In</h2>\n"
            self.response += "<p>Log in to continue.</p>\n"
        self.response += "<div id=\"main-div\">\n"
        self.response += "</div>\n"
        self.htmlbottom()
        return self.response

# ======================================================================
# Define the web ap

urls = (
    '/',     "FrontPage",
    '/auth', rkauth_webpy.app
)

app = web.application( urls, locals() )
web.config.session_parameters[ "samesite" ] = "lax"

initializer = {}
initializer.update( rkauth_webpy.initializer )
# Use something better than /tmp for sessions
session = web.session.Session( app, web.session.DiskStore( "/tmp" ), initializer=initializer )

def session_hook():
    global session
    web.ctx.session = session

app.add_processor( web.loadhook( session_hook ) )

application = app.wsgifunc()

# ======================================================================
# smoke test

def main():
    global app
    sys.stderr.write( "Running webapp.\n" )
    sys.stderr.flush()
    app.run()

if __name__ == "__main__":
    main()
