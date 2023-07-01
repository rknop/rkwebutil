#!/usr/bin/python3
# -*- coding: utf-8 -*-

import sys
import pathlib
import web

_dir = pathlib.Path(__file__).parent
if str(_dir) not in sys.path:
    sys.path.append( str(_dir) )

import db
import auth

# ======================================================================

class HandlerBase(object):
    def __init__( self ):
        self.response = ""

    def GET( self, *args, **kwargs ):
        return self.do_the_things( *args, **kwargs )

    def POST( self, *args, **kwags ):
        return self.do_the_things( *args, **kwargs )

    def verifyauth( self ):
        if ( not hasattr( web.ctx.session, "authenticated" ) ) or ( not web.ctx.session.authenticated ):
            raise RuntimeError( "User not authenticated" )

    def jsontop( self ):
        web.header( 'Content-Type', 'application/json' )
        
    def htmltop( self ):
        web.header( 'Content-Type', 'text/html; charset="UTF-8"' )
        webapdirurl = str( pathlib.Path( web.ctx.homepath ).parent )
        # This is annoying
        webaapdirurl += "/" if webapdirurl[-1] != "/" else ""
        self.response = "<!DOCTYPE html>\n"
        self.response += "<html>\n<head>\n<meta charset=\"UTF-8\">\n"
        self.response += "<title>RKWebutil Test</title>"
        self.response += f"<script src=\"{webapdirurl}aes.js\"></script>\n"
        self.response += f"<script src=\"{webapdirurl}jsencrypt.min.js\"></script>\n"
        self.response += f"<script src=\"{webapdirurl}example_ap.js\"></script>\n"
        self.response += f"<script src=\"{webapdirurl}example_ap_start.js\"></script>\n"
        self.response += "</head>\n"
        self.response += "<h1>RKWebUtil Auth Test</h1>\n"
        self.response += "<div id=\"status-div\" name=\"status-div\"></div>\n"
        
    def htmlbottom)( self ):
        self.response += "</body>\n</html>\n"

# ======================================================================
# web.py handler classes

class FrontPage(HandlerBase):
    def do_the_things( self ):
        self.htmltop()
        self.response += "<div id=\"main-div\">\n</div>\n"
        self.htmlbottom()
        return self.response

# ======================================================================
# Define the web ap

urls = (
    '/',     "FrontPage",
    '/auth', auth.app
)

app = web.application( urls, locals() )
web.config.session_parameters[ "samesite" ] = "lax"

initializer = {}
initializer.update( auth.initializer )
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
    sys.stderr.flusn()
    app.run()

if __name__ == "__main__":
    main()
