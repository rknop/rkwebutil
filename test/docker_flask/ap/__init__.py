import pathlib
import flask
import flask_session
import logging

from . import rkauth_flask

def create_app():
    app = flask.Flask(  __name__ )
    # app.logger.setLevel( logging.INFO )
    app.logger.setLevel( logging.DEBUG )
    app.config.from_mapping(
        SECRET_KEY='blah',
        SESSION_COOKIE_PATH='/',
        SESSION_TYPE='filesystem',
        SESSION_PERMANENT=True,
        SESSION_USE_SIGNER=True,
        SESSION_FILE_DIR='/sessions',
        SESSION_FILE_THRESHOLD=1000,
    )

    server_session = flask_session.Session( app )

    rkauth_flask.RKAuthConfig.setdbparams(
        db_host='postgres',
        db_port=5432,
        db_name='test_rkwebutil',
        db_user='postgres',
        db_password='fragile',
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

    app.register_blueprint( rkauth_flask.bp )

    @app.route('/')
    def hello_world():
        username = flask.session['username'] if 'username' in flask.session else '(None)'
        userdisplayname = flask.session['userdisplayname'] if 'userdisplayname' in flask.session else '(None)'
        authenticated = ( 'authenticated' in flask.session ) and flask.session['authenticated']
        return flask.render_template( 'ap.html', username=username, userdisplayname=userdisplayname,
                                      authenticated=authenticated )

    @app.route('/tconv')
    def tconv():
        return flask.render_template( 'tconv.html' )

    return app
