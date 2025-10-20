import argparse
import secrets
import base64
import hashlib
import uuid
import json

import Crypto
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA256
from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA

def main():
    id = uuid.uuid4()
    
    parser = argparse.ArgumentParser( "make_password.py",
                                      description="Manually make a password for inserting into a rkauth database" )
    parser.add_argument( "-u", "--username", required=True )
    parser.add_argument( "-e", "--email", required=True )
    parser.add_argument( "-d", "--displayname", required=True )
    parser.add_argument( "-p", "--password", required=True )
    args = parser.parse_args()

    salt = secrets.token_bytes( 16 )
    iv = secrets.token_bytes( 12 )

    keypair = RSA.generate( 4096, Crypto.Random.get_random_bytes )
    pubkey = keypair.publickey().export_key( "PEM" ).decode( 'utf-8' )
    privkey = keypair.export_key( "PEM" ).decode( 'utf-8' )
    privkey.replace( "-----BEGIN RSA PRIVATE KEY-----", "" )
    privkey.replace( "-----END RSA PRIVATE KEY-----", "" )
    privkey.replace( "\n", "" )
    
    initialkey = PBKDF2( args.password.encode('utf-8'), salt, 32, count=100000, hmac_hash_module=SHA256 )
    aeskey = AES.new( initialkey, AES.MODE_GCM, iv )
    encprivkey, tag = aeskey.encrypt_and_digest( privkey.encode('utf-8') )
    encprivkey = encprivkey + tag
    encprivkey = base64.b64encode( encprivkey ).decode( 'utf-8' )
    
    privkeyjson = json.dumps( { 'privkey': encprivkey,
                                'salt': base64.b64encode( salt ).decode( 'utf-8' ),
                                'iv': base64.b64encode( iv ).decode( 'utf-8' )
                               } )
    
    print( f"INSERT INTO authuser(id,username,displayname,email,pubkey,privkey) "
           f"VALUES('{id}','{args.username}','{args.displayname}','{args.email}','{pubkey}','{privkeyjson}'::JSONB)" )

# ======================================================================
if __name__ == "__main__":
    main()
