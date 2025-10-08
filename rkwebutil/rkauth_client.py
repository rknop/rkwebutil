#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# This file is part of rkwebutil
#
# rkwebutil is Copyright 2024 by Robert Knop
#
# rkwebutil is free software, available under the BSD 3-clause license (see LICENSE)

import requests
import binascii

from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA256
from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA


class rkAuthClient:
    def __init__( self, url, username, password, verify=True ):
        """Create a client to connect to a server that uses rkauth.

        After making an object, use .send() or .send_get_json() to
        communicate.  You can also get the logged-in python requests object
        directly via the .req property after calling .verify_logged_in().

        Parameters
        ----------
          url: str
            The base url of the server's webap.  Should *not* have "/auth" at the end.

          username: str

          password: str

          verify: bool, default True
            Verify SSL certs?  Passed on to requests functions via verify=

        """

        self.url = url
        self.username = username
        self.password = password
        self.verify = verify
        self.clear_user()


    def clear_user( self ):
        self.req = None
        self.useruuid = None
        self.useremail = None
        self.userdisplaynae = None
        self.usergroups = None


    def verify_logged_in( self ):
        """Log into the server if necessary.

        Raises an exception if logging in fails for whatever reason.

        """

        must_log_in = False
        if self.req is None:
            must_log_in = True
        else:
            res = self.req.post( f'{self.url}/auth/isauth', verify=self.verify )
            if res.status_code != 200:
                raise RuntimeError( f"Error talking to server: {res.txt}" )
            data = res.json()
            if not data['status']:
                must_log_in = True
            else:
                if data['username'] != self.username:
                    res = self.req.post( f"{self.url}/auth/logout", verify=self.verify )
                    if res.status_code != 200:
                        raise RuntimeError( f"Error logging out: {res.text}" )
                    data = res.json()
                    if ( 'status' not in data ) or ( data['status'] != 'Logged out' ):
                        raise RuntimeError( f"Unexpected response logging out: {res.text}" )
                    self.clear_user()
                    must_log_in = True

        if must_log_in:
            self.req = requests.session()
            res = self.req.post( f'{self.url}/auth/getchallenge',
                                 json={ 'username': self.username },
                                 verify=self.verify )
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


            res = self.req.post( f'{self.url}/auth/respondchallenge',
                                 json= { 'username': self.username, 'response': decrypted_challenge },
                                 verify=self.verify )
            if res.status_code != 200:
                raise RuntimeError( f"Failed to log in: {res.text}" )
            data = res.json()
            if ( ( data['status'] != 'ok' ) or ( data['username'] != self.username ) ):
                raise RuntimeError( f"Unexpected response logging in: {res.text}" )
            self.useruuid = data['useruuid']
            self.useremail = data['useremail']
            self.userdisplayname = data['userdisplayname']
            self.usergroups = data['usergroups']


    def post( self, url, postjson={} ):
        """Send a POST query to the server.

        Verifies that you're logged in, logs in if necessary.

        If you're expecting a json-encoded response, you may want to use
        send()

        Parameters
        ----------
          url: str
            URL relative to the base webap URL passed to the rkAuthClient constructor.

          postjson: object, default {}
            An object (usually a dictionary) to encode as json and send to the server
            as the body of the request.  Passed via requests' json= parameter.

        Returns
        -------
          A requests Response object

        """

        self.verify_logged_in()
        slash = '/' if ( ( self.url[-1] != '/' ) and ( url[0] != '/' ) ) else ''
        res = self.req.post( f'{self.url}{slash}{url}', json=postjson, verify=self.verify )
        if res.status_code != 200:
            raise RuntimeError( f"Got response {res.status_code}: {res.text}" )
        return res


    def send( self, url, postjson={} ):
        """Send a POST query to the server, parse the json response to a python object.

        Raises an exception if the server doesn't send back application/json

        Parameters
        ----------
          url: str
            URL relative to the base webap URL passed to the rkAuthClient constructor.

          postjson: object, default {}
            An object (usually a dictionary) to encode as json and send to the server
            as the body of the request.  Passed via requests' json= parameter.

        Returns
        -------
          Whatever python object was parsed from the JSON returned by the server.

        """

        res = self.post( url, postjson=postjson )
        if res.headers.get('Content-Type')[:16] != 'application/json':
            raise RuntimeError( f"Expected json back from conductor but got "
                                f"{res.headers.get('Content_Type')}" )
        return res.json()
