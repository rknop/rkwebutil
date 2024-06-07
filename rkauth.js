/**
 * This file is part of rkwebutil
 * 
 * rkwebutil is Copyright 2023-2024 by Robert Knop
 * 
 * rkwebutil is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 * 
 * rkwebutil is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
 * for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with rkwebutil. If not, see <https://www.gnu.org/licenses/>.
 * 
 */

import { rkWebUtil } from "./rkwebutil.js"

// ASSUMPTIONS
// * There is a div (passed to the constructor) that rkAuth can do whatever it wants to
// * CSS classes .link and .center are defined

var rkAuth = function( authdiv, webapurl, isauthcallback,
                       finishlogincallback=null, notauthcallback=null, errorhandler=null ) {
    /** Handle authentication with auth.py server side
     *
     * Make one of these.  Pass it a div it can do whatever the hell it
     * wants to, the URL for the webap (doesn't have to be absolute),
     * and a default callback for when the user is authenticated.  It's
     * expecting that the webap has /auth/... as defined by auth.py.
     *
     * Call the object's checkAuth method with a callback to call if authenticated,
     * and one to call if not.  If isauthcallback is null, it'll call the
     * isauthcallback passed to the constructor.  If isnotauthcallback
     * is null, it'll call showLoginUI.
     *
     * The object will have properties:
     *    authenticated (true or false)
     *
     * and if authenticated is true:
     *    username
     *    useruuid
     *    useremail
     *    userdisplayname
     *
     * Also needed: resetpasswd_start.js
     *
     * Parameters:
     *
     * authdiv - the div that rkauth.js can do whatever the hell it wants with
     * webapurl - the URL of the main web application (can be relative to server base)
     * isauthcallback - a function to call if the user is already logged in
     * finishlogincallback - a function to call when the user clicks "Log In" and the username/password
     *    is right.  By default, calls isauthcallback
     * notauthcallback - a function to call if the user is not authenticated.  By default,
     *    shows the login UI (which is usually what you want!)
     * errorhandler - a function to call if there's an error.  By default, shows an alert.
     */

    var self = this;
    
    this.authdiv = authdiv;
    this.webapurl = webapurl;
    this.isauthcallback = isauthcallback;
    if ( finishlogincallback != null )
        this.finishlogincallback = finishlogincallback;
    else
        this.finishlogincallback = this.isauthcallback;
    if ( notauthcallback != null )
        this.notauthcallback = notauthcallback;
    else
        this.notauthcallback = function() { self.showLoginUI() };
    if ( errorhandler != null )
        this.errorhandler = errorhandler;
    else
        this.errorhandler = function( e ) { window.alert( e.error ) };
    this.authenticated = false;
    this.conn = new rkWebUtil.Connector( webapurl );
}

// **********************************************************************

rkAuth.CryptoJSformatter = {
    stringify: function( cipherParams ) {
        var jsonobj = { ct: cipherParams.ciphertext.toString( CryptoJS.enc.Base64 ) };
        if ( cipherParams.iv )
            jsonobj.iv = cipherParams.iv.toString();
        if ( cipherParams.salt )
            jsonobj.salt = cipherParams.salt.toString();
        return JSON.stringify( jsonobj );
    },
    parse: function( jsontext ) {
        var jsonobj = JSON.parse( jsontext );
        var cipherParams = CryptoJS.lib.CipherParams.create(
            { ciphertext: CryptoJS.enc.Base64.parse( jsonobj.ct ) } );
        if ( jsonobj.iv )
            cipherParams.iv = CryptoJS.enc.Hex.parse( jsonobj.iv );
        if ( jsonobj.salt )
            cipherParams.salt = CryptoJS.enc.Hex.parse( jsonobj.salt );
        return cipherParams;
    }
};

// **********************************************************************

rkAuth.prototype.checkAuth = function( isauthcallback=null, isnotauthcallback=null ) {
    let self = this
    this.conn.sendHttpRequest( "/auth/isauth", null,
                               function( statedata ) {
                                   self.processCheckAuth( statedata, isauthcallback, isnotauthcallback ) },
                               self.errorhandler );
}

rkAuth.prototype.processCheckAuth = function( statedata, isauthcallback, isnotauthcallback ) {
    // console.log( "In processCheckAuth, statedata:" );
    // for ( const prop in statedata ) {
    //     console.log( prop + " : " + statedata[prop] );
    // }
    if ( ! statedata.hasOwnProperty( "status" ) ) {
        this.errorhandler( { 'error': 'Unexpected response from server authentication check; things are broken.' } );
        return;
    }
    if ( statedata.status ) {
        this.authenticated = true;
        this.username = statedata.username;
        this.useruuid = statedata.useruuid;
        this.useremail = statedata.useremail;
        this.userdisplayname = statedata.userdisplayname;
        if ( isauthcallback != null )
            isauthcallback();
        else
            this.isauthcallback();
    }
    else {
        this.authenticated = false;
        if ( isnotauthcallback != null )
            isnotauthcallback();
        else
            this.notauthcallback();
    }
}
    

// **********************************************************************

rkAuth.prototype.logout = function( loggedoutcallback=null ) {
    var self=this;
    rkWebUtil.wipeDiv( this.authdiv );
    rkWebUtil.elemaker( "p", this.authdiv, { "text": "...logging out..." } )
    this.conn.sendHttpRequest( "auth/logout", null,
                               function() { self.loggedout( loggedoutcallback ), self.errorhandler } );
}

rkAuth.prototype.loggedout = function( loggedoutcallback ) {
    this.authenticated = false;
    this.username = null;
    this.useruuid = null;
    this.useremail = null;
    this.userdisplayname = null;
    if ( loggedoutcallback != null ) {
        loggedoutcallback()
    } else {
        rkWebUtil.wipeDiv( this.authdiv );
        rkWebUtil.elemaker( "p", this.authdiv, { "text": "Logged out." } );
    }
}

// **********************************************************************

rkAuth.prototype.showLoginUI = function() {
    let table, tr, td, button, p;
    let self = this;
    
    rkWebUtil.wipeDiv( this.authdiv );

    table = rkWebUtil.elemaker( "table", this.authdiv );
    tr = rkWebUtil.elemaker( "tr", table );
    td = rkWebUtil.elemaker( "td", tr, { "text": "Username:" } );
    td = rkWebUtil.elemaker( "td", tr );
    this.username_input = rkWebUtil.elemaker( "input", td,
                                              { "attributes": { "type": "text",
                                                                "size": 20,
                                                                "id": "login_username" } } );
    tr = rkWebUtil.elemaker( "tr", table );
    td = rkWebUtil.elemaker( "td", tr, { "text": "Password:" } );
    td = rkWebUtil.elemaker( "td", tr );
    this.username_input = rkWebUtil.elemaker( "input", td,
                                              { "attributes": { "type": "password",
                                                                "size": 20,
                                                                "id": "login_password" } } );
    tr = rkWebUtil.elemaker( "tr", table );
    td = rkWebUtil.elemaker( "td", tr, { "colspan": 2 } );
    button = rkWebUtil.elemaker( "button", td, { "text": "Log In",
                                                 "click": function() { self.startLogin() } } );

    p = rkWebUtil.elemaker( "p", this.authdiv, { "text": "Request Password Reset",
                                                 "click": function() { self.passwordLinkUI() } } );
    p.classList.add( "link" );
}

// **********************************************************************

rkAuth.prototype.startLogin = function() {
    let self = this;
    let username = document.getElementById( "login_username" ).value;
    let password = document.getElementById( "login_password" ).value;
    let requestdata = { 'username': username };
    this.conn.sendHttpRequest( "/auth/getchallenge", requestdata,
                               function( statedata ) {
                                   self.processChallenge( statedata, password ) },
                               self.errorhandler );
}                                   

// **********************************************************************

rkAuth.prototype.getAESKey = async function( password, salt, iv )
{
    const pwbytes = encoder.encode( password );
    const initialkey = await crypto.subtle.importKey( "raw", pwbytes, "PBKDF2", false, [ "deriveKey" ] );
    const aeskey = await crypto.subtle.deriveKey( { "name": "PBKDF2", "hash": "SHA-256",
                                                    "salt": salt, "iterations": 100000 },
                                                  initialkey,
                                                  { "name": "AES-GCM", length: 256 },
                                                  false,
                                                  [ "encrypt", "decrypt" ] );
    return aeskey;
}

//**********************************************************************

rkAuth.prototype.processChallenge = function( retdata, password ) {
    var self = this;
    var rsadecrypt, privkey, response, requestdata;

    if ( retdata.hasOwnProperty( "error" ) ) {
        this.errorhandler( { 'error': retdata.error } );
        return;
    }
    if ( ( ! retdata.hasOwnProperty( "privkey" ) ) ||
         ( ! retdata.hasOwnProperty( "challenge" ) ) ) {
        this.errorhandler( { 'error': 'Unexpected reseponse from server password challenge; things are broken.' } );
        return;
    }

    var response = "";
    try {
        let deocder = new TextDecoder();
        
        const salt = rkWebUtil.b64decode( retdata.salt );
        const iv = rkWebUtil.b64decode( retdata.iv );
        const aeskey = await this.getAESKey( password, salt, iv );
        const privkeybytes = new Uint8Array(
            await crypto.subtle.decrypt( { "name": "AES-GCM", "iv": iv }, aeskey,
                                         rkWebUtil.b64decode( retdata.privkey ) );
        );
        const privkey = await crypto.subtle.importKey( "pkcs8", privkeybytes,
                                                       { "name": "RSA-OAEP", "hash": "SHA-256" },
                                                       false,
                                                       [ "decrypt" ] );
        const plainbytes = new Uint8Array(
            await crypto.subtle.derypt( { "name": "RSA-OAEP" }, privkey, data.challenge ) );
        response = decoder.decode( plainbytes );
    }
    catch( err )
    {
        this.errorhandler( { 'error': 'Incorrect username or password' } )
        return;
    }

    rsadecrypt = new JSEncrypt();
    rsadecrypt.setPrivateKey( privkey );
    // Experimentally, JSEncrypt.decrypt wants base64 data
    response = rsadecrypt.decrypt( retdata.challenge );

    requestdata = { 'username': retdata.username,
                    'response': plaintext };
    this.conn.sendHttpRequest( "/auth/respondchallenge", requestdata,
                               function( statedata ) { self.processChallengeResponse( statedata ) },
                               self.errorhandler );
}

rkAuth.prototype.processChallengeResponse = function( retdata ) {
    if ( retdata.hasOwnProperty( 'error' ) ) {
        if ( this.errorhandler != null ) {
            this.errorhandler( retdata )
        }
        else {
            window.alert( 'Challenge response returned error: ' + retdata.error );
        }
        return
    }

    if ( ( ! retdata.hasOwnProperty( 'status' ) ) ||
         ( ! retdata.hasOwnProperty( 'message' ) ) ) {
        this.errorhandler( { 'error': 'Unexpected response from server challenge response; things are broken.' } );
        return;
    }

    this.authenticated = true;
    this.username = retdata.username;
    this.useruuid = retdata.useruuid;
    this.useremail = retdata.useremail;
    this.userdisplayname = retdata.userdisplayname;
    this.finishlogincallback( retdata );
}

// **********************************************************************

rkAuth.prototype.passwordLinkUI = function() {
    let table, tr, td, button;
    let self = this;
    
    rkWebUtil.wipeDiv( this.authdiv );

    table = rkWebUtil.elemaker( "table", this.authdiv );
    tr = rkWebUtil.elemaker( "tr", table );
    td = rkWebUtil.elemaker( "td", tr, { "text": "Username:" } );
    td = rkWebUtil.elemaker( "td", tr );
    this.username_input = rkWebUtil.elemaker( "input", td,
                                              { "attributes": { "type": "text",
                                                                "size": 20,
                                                                "id": "login_username" } } );
    tr = rkWebUtil.elemaker( "tr", table );
    td = rkWebUtil.elemaker( "td", tr, { "text": "—or—",
                                         "attributes": { "colspan": 2 } } );
    td.classList.add( "center" );
    tr = rkWebUtil.elemaker( "tr", table );
    td = rkWebUtil.elemaker( "td", tr, { "text": "e-mail:" } );
    td = rkWebUtil.elemaker( "td", tr );
    this.email_input = rkWebUtil.elemaker( "input", td,
                                           { "attributes": { "type": "text",
                                                             "size": 32,
                                                             "id": "login_email" } } );
    tr = rkWebUtil.elemaker( "tr", table );
    td = rkWebUtil.elemaker( "td", tr, { "attributes": { "colspan": 2 } } );
    button = rkWebUtil.elemaker( "button", td, { "text": "Email Password Reset Link",
                                                 "click": function() { self.requestPasswordLink() } } );
}

// **********************************************************************

rkAuth.prototype.requestPasswordLink = function() {
    let self = this;
    let data = { "username": this.username_input.value.trim(),
                 "email": this.email_input.value.trim() };
    let conn = new rkWebUtil.Connector( this.webapurl );
    let p = rkWebUtil.elemaker( "p", this.authdiv, { "text": "Sending password reset link... please wait..." } );
    conn.sendHttpRequest( "/auth/getpasswordresetlink", data,
                          function( res ) { self.passwordLinkSent( res ) },
                          function( res ) { window.alert( 'Error: ' + res.error ) } );
}

// **********************************************************************

rkAuth.prototype.passwordLinkSent = function( res ) {
    var self = this;
    rkWebUtil.wipeDiv( this.authdiv );
    rkWebUtil.elemaker( "p", this.authdiv, { "text": res.status } );
    rkWebUtil.elemaker( "p", this.authdiv, { "text": "Back to login",
                                             "classes": [ "link" ],
                                             "click": function() { self.checkAuth() } } );
}

// **********************************************************************

rkAuth.prototype.setNewPassword = function() {
    let self = this;

    let encoder = new TextEncoder();

    // Make the RSA key
    const keypair = await crypto.subtle.generateKey( { "name": "RSA-OAEP",
                                                       "modulusLength": 4096,
                                                       "publicExponent": new Uint8Array([1,0,1]),
                                                       "hash": "SHA-256" },
                                                     true, [ "encrypt", "decrypt" ] );
    // Export the public key in PEM format
    const pubkey = "-----BEGIN PUBLIC KEY-----\n" +
          rkWebUtil.b64encode(
              new Uint8Array( await crypto.subtle.exportKey( "spki", keypair.publicKey ) )
          ).replace( /(.{64})/g, "$1\n" )
          + "\n-----END PUBLIC KEY-----";

    // Encrypt the private key with an AES key based on the password, and export that
    let password = document.getElementById( "reset_password" ).value;
    const salt = crypto.getRandomValues( new Uint8Array(16) );
    const iv = crypto.getRandomValues( new Uint8Array(12) );
    const aeskey = await this.getAESKey( password, salt, iv );
    const privkey = new Uint8Array( await crypto.subtle.exportKey( "spki", keypair.privateKey ) );
    const encprivkey = rkWebUtil.b64encode(
        new Uint8Array( await crypto.subtle.encrypt( { "name": "AES-GCM", "iv", iv }, aeskey, privkey ) );
    );
    
    this.conn.sendHttpRequest( "/auth/changepassword",
                               { "passwordlinkid": document.getElementById( "resetpasswd_linkid" ).value,
                                 "publickey": pubkey,
                                 "privatekey": encprivkey,
                                 "salt": rkWebUtil.b64encode( salt ),
                                 "iv": rkWebUtil.b64encode( iv ) },
                               function( statedata ) {
                                   self.confirmChangePassword( statedata );
                               },
                               self.errorhandler );
}

// **********************************************************************

rkAuth.prototype.confirmChangePassword = function( statedata ) {
    if ( statedata.hasOwnProperty( "status" ) ) {
        window.alert( statedata.status );
    }
    else {
        window.alert( "Unexpected response." );
        return;
    }

    rkWebUtil.wipeDiv( this.authdiv );
    let p = document.createElement( "p" );
    this.authdiv.appendChild( p );
    p.appendChild( document.createTextNode( "Password change complete." ) );
}    



// **********************************************************************

export { rkAuth }
