/**
 * This file is part of rkwebutil
 *
 * rkwebutil is Copyright 2023-2024 by Robert Knop
 *
 * rkwebutil is free software under the BSD 3-clause license (see LICENSE)
 */

import { rkWebUtil } from "./rkwebutil.js"

var webapurl = "";

var tconv = function() {}

tconv.prototype.init = function() {
    var self = this;
    this.mjdwid = document.getElementById( "mjd" );
    this.datewid = document.getElementById( "date" );
    let mjdbut = document.getElementById( "convmjd" );
    let datebut = document.getElementById( "convdate" );
    mjdbut.addEventListener( "click", () => { self.mjdtodate(); } );
    datebut.addEventListener( "click", () => { self.datetomjd(); } );
}

tconv.prototype.mjdtodate = function()
{
    let mjd = parseFloat( this.mjdwid.value );
    let date = rkWebUtil.dateOfMjd( mjd );
    this.datewid.value = date.toISOString( date );
}

tconv.prototype.datetomjd = function()
{
    let date = new Date( Date.parse( this.datewid.value ) );
    let mjd = rkWebUtil.mjdOfDate( date );
    this.mjdwid.value = mjd.toString();
}

export { tconv, webapurl }
