/**
 * This file is part of rkwebutil
 *
 * rkwebutil is Copyright 2023-2024 by Robert Knop
 *
 * rkwebutil is free software under the BSD 3-clause license (see LICENSE)
 */

import { rkAuth } from "./rkauth.js"
import { rkWebUtil } from "./rkwebutil.js"

var webapurl = "";

var exampleap = function() {}

exampleap.prototype.init = function() {
    var self = this;

    this.statusdiv = document.getElementById( "status-div" );
    this.maindiv = document.getElementById( "main-div" );
    if ( this.statusdiv == null ) {
        window.alert( "Couldn't find status div!  This should never happen." );
        return;
    }
    this.auth = new rkAuth( this.statusdiv, webapurl,
                            function() { self.render(); },
                            function() { window.location.reload(); } );
    this.auth.checkAuth();
}

// **********************************************************************


exampleap.prototype.render = function()
{
    let self = this;

    this.show_or_prompt_login();
    rkWebUtil.wipeDiv( this.maindiv );
    if ( ! this.auth.authenticated ) {
        rkWebUtil.elemaker( "p", this.maindiv, { "text": "Not logged in." } );
    }
    else {
        rkWebUtil.elemaker( "p", this.maindiv, { "text": "Hello world." } );
    }

    this.mjdwid = document.getElementById( "mjd" );
    this.datewid = document.getElementById( "date" );
    if ( ( this.mjdwid != null ) && ( this.datewid != null ) &&
         ( this.mjdwid != undefined ) && ( this.datewid != undefined ) ) {
        let mjdbut = document.getElementById( "convmjd" );
        mjdbut.addEventListener( "click", () => { self.mjdtodate(); } );
        let datebut = document.getElementById( "convdate" );
        datebut.addEventListener( "click", () => { self.datetomjd(); } );
    }
}

// **********************************************************************

exampleap.prototype.show_or_prompt_login = function() {
    var self = this;
    rkWebUtil.wipeDiv( this.statusdiv );
    if ( this.auth.authenticated ) {
        let p = rkWebUtil.elemaker( "p", this.statusdiv, { "classes": [ "smaller", "italic" ] } );
        p.appendChild( document.createTextNode( "Logged in as " + this.auth.username +
                                                " (" + this.auth.userdisplayname + ") — " ) );
        rkWebUtil.elemaker( "span", p,
                            { "classes": [ "link" ],
                              "text": "Log Out",
                              "click": function() {
                                  self.auth.logout( function() { window.location.reload(); } )
                              }
                            }
                          );
    }
    else {
        this.auth.showLoginUI();
    }
}

// **********************************************************************

exampleap.prototype.mjdtodate = function()
{
    let mjd = parseFloat( this.mjdwid.value );
    let date = rkWebUtil.dateOfMjd( mjd );
    this.datewid.value = date.toISOString( date );
}

exampleap.prototype.datetomjd = function()
{
    let date = Date.parse( this.datewid.value );
    let mjd = rkWebUtil.mjdOfDate( date );
    this.mjdwid.value = mjd.toString();
}

// **********************************************************************

export { exampleap, webapurl }
