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


    this.datestrwid = document.getElementById( "datestr" );
    this.datestr_nospace_z = document.getElementById( "datestr_nospace_z" );
    this.datestr_space_z = document.getElementById( "datestr_space_z" );
    this.datestr_nospace_noz = document.getElementById( "datestr_nospace_noz" );
    this.datestr_space_noz = document.getElementById( "datestr_space_noz" );
    this.datestr_nospace_z_date = document.getElementById( "datestr_nospace_z_date" );
    this.datestr_space_z_date = document.getElementById( "datestr_space_z_date" );
    this.datestr_nospace_noz_date = document.getElementById( "datestr_nospace_noz_date" );
    this.datestr_space_noz_date = document.getElementById( "datestr_space_noz_date" );
    this.datestr_nospace_z_str = document.getElementById( "datestr_nospace_z_str" );
    this.datestr_space_z_str = document.getElementById( "datestr_space_z_str" );
    this.datestr_nospace_noz_str = document.getElementById( "datestr_nospace_noz_str" );
    this.datestr_space_noz_str = document.getElementById( "datestr_space_noz_str" );
    let datestrbut = document.getElementById( "parsedatestr" )
    datestrbut.addEventListener( "click", () => { self.parsedatestr(); } );
}

tconv.prototype.parsedatestr = function()
{
    let datestr = this.datestrwid.value;
    let instant = rkWebUtil.dateToInstant( datestr, true );
    let date = rkWebUtil.dateToDate( datestr, true );

    this.datestr_nospace_z.value = rkWebUtil.dateFormat( instant, false, false, true );
    this.datestr_space_z.value = rkWebUtil.dateFormat( instant, true, false, true );
    this.datestr_nospace_noz.value = rkWebUtil.dateFormat( instant, false, true, true );
    this.datestr_space_noz.value = rkWebUtil.dateFormat( instant, true, true, true );

    this.datestr_nospace_z_date.value = rkWebUtil.dateFormat( date, false, false, true );
    this.datestr_space_z_date.value = rkWebUtil.dateFormat( date, true, false, true );
    this.datestr_nospace_noz_date.value = rkWebUtil.dateFormat( date, false, true, true );
    this.datestr_space_noz_date.value = rkWebUtil.dateFormat( date, true, true, true );

    this.datestr_nospace_z_str.value = rkWebUtil.dateFormat( datestr, false, false, true );
    this.datestr_space_z_str.value = rkWebUtil.dateFormat( datestr, true, false, true );
    this.datestr_nospace_noz_str.value = rkWebUtil.dateFormat( datestr, false, true, true );
    this.datestr_space_noz_str.value = rkWebUtil.dateFormat( datestr, true, true, true );
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
