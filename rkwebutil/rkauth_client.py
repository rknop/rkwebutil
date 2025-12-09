#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# This file is part of rkwebutil
#
# rkwebutil is Copyright 2025 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

import sys
import time
import requests
import binascii
import random
import logging

from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA256
from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA


class rkAuthClient:
    def __init__( self, url, username, password,
                  retries=5, maxtimeout=30., retrysleep=0.3, sleepfac=2, sleepfuzz=True,
                  verify=True, logger=None ):
        """Create a client to connect to a server that uses rkauth.

        After making an object, use .post() or .send() to communicate.
        You can also get the logged-in python requests object directly
        via the .req property after calling .verify_logged_in().

        Parameters
        ----------
          url: str
            The base url of the server's webap.  Should *not* have "/auth" at the end.

          username: str

          password: str

          retries : int, default 5
            When calling send or post, if the request to the server
            doesn't return a HTTP 200, try again at most this many
            times.

          maxtimeout : float, default 30.
            If retries are taking a very long time, don't keep retrying
            if this much time has passed.

          retrysleep : float, default 0.2
            After the first failed attempt to contact the server, sleep this many seconds
            before retrying.

          sleepfac : float, default 2
            Multiply the sleep time by this much after each retry.

          sleepfuzz : bool, default True
            Randomly adjust the sleep time by 10% of itself (Gaussian, sort of) so that if
            lots of processes are running, they will (hopefully) dsync.

          verify: bool, default True
            Verify SSL certs?  Passed on to requests functions via verify=

          logger : logging.Logger, default None
            Logger to use for error messages.  If None, will make one.

        """

        self.logger = logger
        if self.logger is None:
            self.logger = logging.getLogger( "rkAuthClient" )
            self.logger.propagate = False
            if not self.logger.hasHandlers():
                logout = logging.StreamHandler( sys.stderr )
                self.logger.addHandler( logout )
                formatter = logging.Formatter( '[%(asctime)s - %(levelname)s] - %(message)s',
                                               datefmt='%Y-%m-%d %H:%M:%S' )
                logout.setFormatter( formatter )
                logout.setLevel( logging.INFO )

        self.url = url
        self.username = username
        self.password = password
        self.verify_ssl = verify
        self.retries = retries
        self.maxtimeout = maxtimeout
        self.retrysleep = retrysleep
        self.sleepfac = sleepfac
        self.sleepfuzz = sleepfuzz

        self.clear_user()


    def clear_user( self ):
        self.req = None
        self.useruuid = None
        self.useremail = None
        self.userdisplaynae = None
        self.usergroups = None


    def logout( self, always_verify=False, **kwargs ):
        if always_verify or ( self.req is None ):
            self.verify_logged_in( **kwargs )

        if self.req is not None:
            res = self.post( "auth/logout", **kwargs )
            data = res.json()
            if ( 'status' not in data ) or ( data['status'] != 'Logged out' ):
                raise RuntimeError( f"Unexpected response logging out: {res.text}" )
            self.clear_user()


    def verify_logged_in( self, always_verify=False, **kwargs ):
        """Log into the server if necessary.

        Raises an exception if logging in fails for whatever reason.

        Will try to log in if you aren't logged in yet.

        Parameters
        ----------
          always_verify : bool, default False
            Normally, if you've verified logging in before and have a
            session, just quickly return.  Set always_verify to True to
            contact the server and confirm that you're logged in.

          **kwargs : Additional arguments are sent on to self.send and self.post

        Returns
        -------
          True if logged in, False otherwise.

          Really will likely raise an exception if not logged in and can't log in.

        """

        if self.req is not None:
            if not always_verify:
                return True
            res = self.post( 'auth/isauth' )
            data = res.json()
            if data['status']:
                if data['username'] == self.username:
                    return True
                self.logout()

        self.req = requests.session()
        res = self.post( 'auth/getchallenge', { 'username': self.username }, **kwargs )
        if res.status_code != 200:
            raise RuntimeError( f"Error logging in: {res.text}" )
        try:
            data = res.json()
            challenge = binascii.a2b_base64( data['challenge'] )
            enc_privkey = binascii.a2b_base64( data['privkey'] )
            salt = binascii.a2b_base64( data['salt'] )
            iv = binascii.a2b_base64( data['iv'] )
            aeskey = PBKDF2( self.password.encode('utf-8'), salt, 32, count=100000, hmac_hash_module=SHA256 )
            aescipher = AES.new( aeskey, AES.MODE_GCM, nonce=iv )
            # When javascript created the encrypted AES key, it appended
            #   a 16-byte auth tag to the end of the ciphertext. (Python's
            #   Crypto AES-GCM handling treates this as a separate thing.)
            privkeybytes = aescipher.decrypt_and_verify( enc_privkey[:-16], enc_privkey[-16:] )
            privkey = RSA.import_key( privkeybytes )
            rsacipher = PKCS1_OAEP.new( privkey, hashAlgo=SHA256 )
            decrypted_challenge = rsacipher.decrypt( challenge ).decode( 'utf-8' )
        except Exception:
            raise RuntimeError( "Failed to log in, probably incorrect password" )

        data = self.send( 'auth/respondchallenge',
                          { 'username': self.username, 'response': decrypted_challenge },
                          **kwargs )
        if ( not isinstance( data, dict ) ) or ( 'status' not in data ):
            raise RuntimeError( f"Unexpected response logging in: {data}" )
        if data['status'] != 'ok':
            raise RuntimeError( "Authentication failure." )
        if data['username'] != self.username:
            raise ValueError( f"WEIRD: logged in as user {data['username']}, but expected {self.username}" )
        self.useruuid = data['useruuid']
        self.useremail = data['useremail']
        self.userdisplayname = data['userdisplayname']
        self.usergroups = data['usergroups']


    def post( self, url, json=None, data=None,
              retries=None, maxtimeout=None, retrysleep=None, sleepfac=None, sleepfuzz=None,
              verifylogin=False,
              **kwargs ):
        """Send a POST query to the server.

        Logs on if necessary.

        If the HTTP return status is 200, returns the response.

        If the HTTP return status is 409 ("Conflict") or 422
        ("Unprocessable Content"), raises an exception with the body of
        the response (assuming it's text) as the text of the exception.

        Otherwise, retries several times if there is an error, in an
        attempt to work around temporary internet connectivity glithces.


        If you're expecting a json-encoded response, you may want to use
        send().

        Parameters
        ----------
          url: str
            URL relative to the base webap URL passed to the rkAuthClient constructor.

          json: object, default None
            An object (usually a dictionary) to encode as json and send to the server
            as the body of the request.  Passed via requests' json= parameter.

          data: bytes or string or something
            Data to send on to requests as the POST body.  Do not use boht this and postjson.

          retries, maxtimeout, retrysleep, sleepfac, sleepfuzz : mixed
            For this one call, override the values set during client constructoin.

          maxtimeout : float, default 600.
            If retries are taking a very long time, don't keep retrying
            if this much time has passed.

          retrysleep : float, default 0.2
            After the first failed attempt to contact the server, sleep this many seconds
            before retrying.

          sleepfac : float, default 2
            Multiply the sleep time by this much after each retry.

          sleepfuzz : bool, default True
            Randomly adjust the sleep time by 10% of itself (Gaussian, sort of) so that if
            lots of processes are running, they will (hopefully) dsync.

          verifylogin : bool, default False
            If True, then before sending the actual request, will send a
            request to the server verifying that you're logged in.  If
            False, then just sent the query, unless we don't have an
            active connection, in which case, try to log in.

          **kwargs : remaining arguments are sent on to requests.post

        Returns
        -------
          A requests Response object

        """

        retries = self.retries if retries is None else retries
        maxtimeout = self.maxtimeout if maxtimeout is None else maxtimeout
        retrysleep = self.retrysleep if retrysleep is None else retrysleep
        sleepfac = self.sleepfac if sleepfac is None else sleepfac
        sleepfuzz = self.sleepfuzz if sleepfuzz is None else sleepfuzz

        if ( self.req is None ) or verifylogin:
            self.verify_logged_in( retries=retries, maxtimeout=maxtimeout, retrysleep=retrysleep,
                                   sleepfac=sleepfac, sleepfuzz=sleepfuzz )

        slash = '/' if ( ( self.url[-1] != '/' ) and ( url[0] != '/' ) ) else ''
        url = f'{self.url}{slash}{url}'

        t0 = time.perf_counter()
        meansleep = retrysleep
        curtry = 0
        retries = max( retries, 1 )
        while curtry < retries:
            try:
                res = self.req.post( url, data=data, json=json, verify=self.verify_ssl, **kwargs )
                if res.status_code != 200:
                    raise RuntimeError( f"Got response {res.status_code}: {res.text}" )
                return res
            except Exception as ex:
                if res.status_code in ( 409, 422 ):
                    # This is what the server should return to indicate an actual error in the
                    #   query.  In that case, we don't want to retry.  TODO: are there
                    #   other 4xx's that we should immediately thrown an exception on?
                    raise RuntimeError( f"Error response from server: {res.text}" )
                curtry += 1
                t = time.perf_counter()
                msg = ( f"Failed to connect to {url} after {curtry} {'tries' if curtry!=1 else 'try'} "
                        f"over {t-t0:.1f} seconds" )
                if ( curtry == retries ) or ( t-t0 >= maxtimeout ):
                    self.logger.error( f"{msg}; giving up.  Last error was {ex}" )
                    raise RuntimeError( f"{msg}; giving up.  Last error was {ex}" )

                tosleep = random.gauss( meansleep, 0.1 * meansleep ) if sleepfuzz else meansleep
                tosleep = max( tosleep, 0.7 * meansleep )
                _perchance_to_dream = True
                self.logger.warning( f"{msg}; sleeping {tosleep:.1f}s and trying again." )
                self.logger.debug( f"Last error: {ex}" )
                time.sleep( tosleep )
                meansleep *= sleepfac

        raise RuntimeError( "This should never happen.")


    def send( self, url, *args, **kwargs ):
        """Send a POST query to the server, parse the json response to a python object.

        Raises an exception if the server doesn't send back application/json

        Takes all the same arguments as post().

        Returns
        -------
          Whatever python object was parsed from the JSON returned by the server.

        """

        res = self.post( url, *args, **kwargs )
        mtype = res.headers.get('Content-Type')
        if ( len( mtype ) < 16 ) or ( mtype[:16] != 'application/json' ):
            msg = f"Expected json, but got {mtype} from {url}"
            if ( len( mtype ) > 10 ) and ( mtype[:10] == 'text/plain' ):
                self.logger.error( f"{msg} ; content of response: {res.text}" )
            else:
                self.logger.error( msg )
            raise RuntimeError( msg )
        return res.json()
