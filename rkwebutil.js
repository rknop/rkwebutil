/**
 * This file is part of rkwebutil
 *
 * rkwebutil is Copyright 2023-2024 by Robert Knop
 *
 * rkwebutil is free software under the BSD 3-clause license (see LICENSE)
 */

var rkWebUtil = {}

// **********************************************************************
// **********************************************************************
// **********************************************************************
// Utility functions

rkWebUtil.wipeDiv = function( div )
{
    if ( div != null )
        while ( div.firstChild )
            div.removeChild( div.firstChild );
}

// **********************************************************************

rkWebUtil.elemaker = function( elemtype, parent, inprops )
{
    var props = { id: null,
                  text: null,
                  dblclick: null,
                  click: null,
                  change:null,
                  classes: null,
                  attributes: null,
                  svg:false };
    Object.assign( props, inprops );
    var id = props.id;
    var text = props.text;
    var click = props.click;
    var dblclick = props.dblclick;
    var change = props.change;
    var classes = props.classes;
    var attributes = props.attributes;

    var attr;

    var elem;

    if ( elemtype == "text" ) {
        if ( props.text == null )
            throw "Must pass text in props to make a text node.";
        if ( props.svg )
            throw "Can't make text nodes with svg.";
        if ( classes != null )
            throw "Can't assign classes to text nodes (use a span).";
        if ( click != null || change != null )
            throw "Can't add events to text nodes (use a span)."
        if ( attributes != null )
            throw "Can't set attributes of text nodes (use a span).";

        elem = document.createTextNode( props.text );
        if ( parent != null ) parent.appendChild( elem );
        return elem;
    }

    if ( props.svg )
        elem = document.createElementNS( "http://www.w3.org/2000/svg", elemtype );
    else
        elem = document.createElement( elemtype );

    if ( parent != null) parent.appendChild( elem );
    if ( props.text != null ) elem.appendChild( document.createTextNode( props.text ) );

    if ( click != null )
        elem.addEventListener( "click", click );
    if ( dblclick != null )
        elem.addEventListener( "dblclick", dblclick );
    if ( change != null )
        elem.addEventListener( "change", change );
    if ( classes != null ) {
        for ( let classname of classes ) {
            elem.classList.add( classname )
        }
    }
    if ( id != null ) elem.setAttribute( 'id', id );
    if ( attributes != null ) {
        for ( attr in attributes ) {
            if ( attributes.hasOwnProperty( attr ) ) {
                elem.setAttribute( attr, attributes[attr] );
            }
        }
    }
    return elem;
}

// **********************************************************************

rkWebUtil.button = function( parent, title, callback )
{
    var button = document.createElement( "input" );
    button.setAttribute( "type", "button" );
    button.setAttribute( "value", title );
    button.addEventListener( "click", callback );
    if ( parent != null ) parent.appendChild( button );
    return button;
}

// **********************************************************************
// items is a list of names; put in "-" for a HR.
// callbacks is a dict of functions that map names to callback functions.
// classes is a list of css classes for the div

rkWebUtil.popupMenu = function( items, callbacks, classes, title=null, titleclasses=[], hrclasses=[] ) {
    var menu = rkWebUtil.elemaker( "div", document.body, { "classes": classes } );
    if ( title != null ) {
        rkWebUtil.elemaker( "div", menu, { "text": title, "classes": titleclasses } );
    }
    for ( let item of items ) {
        if ( item == "-" ) {
            rkWebUtil.elemaker( "hr", menu, { "classes": hrclasses } );
        }
        else {
            if ( callbacks.hasOwnProperty( item ) ) {
                rkWebUtil.button( menu, item,
                                  function( e ) {
                                      callbacks[item]( e );
                                      menu.style.visibility = "hidden";
                                      e.stopPropagation();
                                  } );
            } else {
                rkWebUtil.button( menu, item,
                                  function( e ) {
                                      menu.style.visibility = "hidden";
                                      e.stopPropagation();
                                  } );
            }
        }
    }
    menu.addEventListener( "mouseleave", function() { menu.style.visibility = "hidden"; } );

    return menu;
}


// **********************************************************************
// If I ever get a date that doesn't start "2020-07-15 07:42:00" (with
// any old character in place of the space), I'm in trouble.  Alas,
// I haven't found a reliable library routine to do this, because
// Javascript insists on dates being local.

rkWebUtil.parseStandardDateString = function( datestring )
{
    // console.log( "Trying to parse date string " + datestring );
    var year = Number( datestring.substring(0, 4) );
    var month = Number( datestring.substring(5, 7) );
    var day = Number( datestring.substring( 8, 10) );
    var hour = Number( datestring.substring( 11, 13) );
    var minute = Number( datestring.substring( 14, 16) );
    var second = Number( datestring.substring( 17, 19) );
    var date;
    date = new Date( Date.UTC( year, month-1, day, hour, minute, second ) );
    // console.log( "y=" + year + " m=" + month + " d=" + day +
    //              "h=" + hour + " m=" + minute + " s=" + second );
    // console.log( "Date parsed: " + date.toString() );
    return date;
}

// **********************************************************************
// This one is a bit hacky.  I'm assming that javascript is able to
// parse ISO dates, and that it will parse something with a "Z" at the
// end as a UTC date.  This function assumes that the string is coming
// in exactly as YYYY-MM-DD HH:MM:SS (with possibly a T in place of the
// middle space).
//
// It returns a Date object, which is in the *local* time zone
// (always... because JavaScript irritatingly seems to assume you'd
// never want to do anything else), but if you later do something like
// .getUTCHours() or call my MJD function, it should do the right thing.

rkWebUtil.parseDateAsUTC = function( datestring )
{
    datestring = datestring.trim();
    let utcdex = datestring.search( / *UTC$/ );
    if ( utcdex >= 0 ) datestring = datestring.substring( 0, utcdex );
    let zdex = datestring.search( / *Z$/ );
    if ( zdex >= 0 ) datestring = datestring.substring( 0, zdex );
    let pmdex = datestring.search ( / *[\+\-][0-9]+$/ );
    const pmre = / *[\+\-]([0-9]+)$/;
    let match = pmre.exec( datestring );
    if ( match != null ) {
        if ( parseFloat( match[1] ) != 0 )
            throw "Error, enter UTC times";
        datestring = datestring.substring( 0, match.index );
    }

    let timestamp = Date.parse( datestring + "Z" );
    if ( isNaN( timestamp ) ) {
        throw "Error parsing date/time " + datestring;
    }
    return new Date( timestamp );
}

// **********************************************************************

rkWebUtil.dateFormat = function(date)
{
    // console.log(" Trying to format date " + date );
    var result = "";
    result += ("0000" + date.getFullYear().toString()).substr(-4, 4);
    result += "-";
    result += ("00" + (date.getMonth()+1).toString()).substr(-2, 2);
    result += "-";
    result += ("00" + date.getDate().toString()).substr(-2, 2);
    result += " ";
    result += ("00" + date.getHours().toString()).substr(-2, 2);
    result += ":";
    result += ("00" + date.getMinutes().toString()).substr(-2, 2);
    result += ":";
    result += ("00" + date.getSeconds().toString()).substr(-2, 2);
    return result;
}

rkWebUtil.dateUTCFormat = function(date)
{
    var result = "";
    result += ("0000" + date.getUTCFullYear().toString()).substr(-4, 4);
    result += "-";
    result += ("00" + (date.getUTCMonth()+1).toString()).substr(-2, 2);
    result += "-";
    result += ("00" + date.getUTCDate().toString()).substr(-2, 2);
    result += " ";
    result += ("00" + date.getUTCHours().toString()).substr(-2, 2);
    result += ":";
    result += ("00" + date.getUTCMinutes().toString()).substr(-2, 2);
    result += ":";
    result += ("00" + date.getUTCSeconds().toString()).substr(-2, 2);
    return result;
}

rkWebUtil.validateWidgetDate = function( datestr ) {
    return rkWebUtil._actually_validateWigetDate( datestr, false );
}

rkWebUtil.validateWidgetDateUTC = function( datestr ) {
    return rkWebUtil._actually_validateWidgetDate( datestr, true );
}


rkWebUtil._actually_validateWidgetDate = function( datestr, assumeutc ) {
    if ( datestr.value.trim() == "" ) {
        datestr.value = ""
        return;
    }
    let munged = datestr.value.trim()
    if ( assumeutc ) {
        if ( ( munged.substring( munged.length-1 ) != 'Z' ) &&
             ( munged.substring( munged.length-3 ) != 'UTC' )
           ) {
            munged += " UTC";
        }
    }

    let num = Date.parse( munged );
    if ( isNaN(num) ) {
        window.alert( "Error parsing date " + datestr.value
                      + "\nNote that Javascript's Date.parse() doesn't seem to like AM or PM at the end; "
                      + "use 24-hour time." );
        return;
    }
    let date = new Date();
    date.setTime( num );
    // TODO : verify that both Firefox and Chrome (at least) parse this right
    // (I don't just use toISOString because the T at the middle and all the precision is ugly for the user)
    datestr.value = date.getUTCFullYear() + "-"
        + String(date.getUTCMonth()+1).padStart( 2, '0') + "-"
        + String(date.getUTCDate()).padStart( 2, '0' ) + " "
        + String(date.getUTCHours()).padStart( 2, '0') + ":"
        + String(date.getUTCMinutes()).padStart(2, '0') + ":"
        + String(date.getUTCSeconds()).padStart( 2, '0') + "+00";
}

rkWebUtil.mjdOfDate = function( date ) {
    let y = date.getUTCFullYear();
    let m = date.getUTCMonth() + 1;
    let d = date.getUTCDate();
    let h = date.getUTCHours();
    let minute = date.getUTCMinutes();
    let s = date.getUTCSeconds();
    let ms = date.getUTCMilliseconds();

    // Trusting wikipedia, which says with integer division (meaning -2.5/2 = -1, not -2)
    // JDN = (1461 × (Y + 4800 + (M − 14)/12))/4 +(367 × (M − 2 − 12 × ((M − 14)/12)))/12 − (3 × ((Y + 4900 + (M - 14)/12)/100))/4 + D − 32075
    // and (with float division):
    // JD = JDN + (hour-12)/24. + minute/1440. + second/86400.

    // Eric Weisstein's World of Astronomy says, for AD Gregorian dates:
    // JD = 367Y - INT(7(Y + INT((M+9)/12))/4)
    //      -INT(3(INT((Y + (M-9)/7)/100) + 1)/4)
    //      +INT(275M/9) + D + 1721028.5 + UT/24.
    // (https://scienceworld.wolfram.com/astronomy/JulianDate.html)

    // if ( h < 12 ) d -= 1;
    let jd = ( Math.trunc( 1461 * ( y + 4800 + Math.trunc( (m - 14) / 12 ) ) / 4 ) +
               + Math.trunc( (367 * (m - 2 - 12 * Math.trunc( (m - 14) / 12 ) ) ) / 12 )
               - Math.trunc( (3 * Math.trunc( (y + 4900 + Math.trunc( (m - 14) / 12) ) / 100 ) ) / 4 )  + d - 32075 )
    jd += ( (h-12) + ( minute + ( s + ms/1000. ) / 60. ) / 60. ) / 24.;
    // if (h < 12) jd += 1.;
    return jd - 2400000.5;
}

rkWebUtil.ymdOfMjd = function( mjd ) {
    // Again trusting Wikipeida...
    // That algorithm gives the Y-M-D for the *afternoon* at the beginning
    //  of the Julian day; since JD flips over at noon, that makes it
    //  complicated.  I *think* what Wikipedia means is that when
    //  JD = <something>.0, we get the date that will be right from
    //  noon until 23:59.  What I really want, though, is the
    //  date that will be right for the given mjd, which *does* flip
    //  over at a sane 00:00.
    //
    // Examples:
    // at jd=2,400,000.0:
    //   mjd = -0.5
    //   datetime = 1858-11-16 12:00:00
    // at jd=2,400,000.5:
    //   mjd = 0
    //   datetime = 1858-11-17 00:00:00
    //
    // If I understand what wikipedia is saying correctly, this
    //   algorithm will return 1858-11-16 for both of these dates,
    //   but what I wanted was 1858-11-17 for the second one.
    // What this means is that I want to add 0.5 to the jd
    //   to get the y-m-d that I really want... but then
    //   the algorithm wants an integer jd, so I think that
    //   no matter what I do, I'm going to be succeptible
    //   to floating-point roundoff when I'm right near
    //   the edge.

    // This is my weak attempt to mitigate the problems with roundoff
    // In mjdtodatetimebelow, I have something that should be more
    // reliable.
    let intmjd = Math.floor( mjd );
    let jd = Math.floor( intmjd + 2400000.5 + 0.5 );
    let y = 4716;
    let j = 1401;
    let m = 2;
    let n = 12;
    let r = 4;
    let p = 1461;
    let v = 3;
    let u = 5;
    let s = 153;
    let w = 2;
    let B = 274277;
    let C = -38;

    let f = jd + j + Math.floor( ( Math.floor( ( 4 * jd + B ) / 146097 ) * 3 ) / 4 ) + C;
    let e = r * f + v;
    let g = Math.floor( ( e % p ) / r );
    let h = u * g + w;
    let D = Math.floor( ( h % s ) / u ) + 1;
    let M = ( ( Math.floor( h / s ) + m ) % n ) + 1;
    let Y = ( Math.floor( e / p) ) - y + Math.floor( (n + m - M) / n );
    return [ Math.floor(Y), Math.floor(M), Math.floor(D) ];
}

rkWebUtil.dateOfMjd = function( mjd ) {
    let YMD = rkWebUtil.ymdOfMjd( mjd );
    let Y = YMD[0];
    let M = YMD[1];
    let D = YMD[2];
    // Try to handle floating point roundoff
    // Javascript's insistance that Dates are local time, with no way of
    // specifying time zone, is VERY ANNOYING.
    // let intmjd = rkWebUtil.mjdOfDate( new Date( Y, M-1, D, 0, 0, 0, 0 ) );
    let javascript_is_stupid = new Date();
    javascript_is_stupid.setUTCFullYear( Y );
    javascript_is_stupid.setUTCMonth( M-1 );
    javascript_is_stupid.setUTCDate( D );
    javascript_is_stupid.setUTCHours( 0 );
    javascript_is_stupid.setUTCMinutes( 0 );
    javascript_is_stupid.setUTCSeconds( 0 );
    javascript_is_stupid.setUTCMilliseconds( 0 );
    let intmjd = rkWebUtil.mjdOfDate( javascript_is_stupid );
    //This next thing will only happen with a floating-point
    //roundoff from 0.999999999.  In this case, just round up
    // to the next integer mjd
    if ( ( mjd - intmjd ) < 0 ) {
        intmjd -= 1;
    }
    let secs = ( mjd - intmjd ) * 24 * 3600;
    let h = Math.floor( secs / 3600 );
    let m = Math.floor( ( secs - 3600*h ) / 60 );
    let s = Math.floor( secs - 3600*h - 60*m );
    let mus = Math.floor( 1e6 * ( secs - 3600*h - 60*m - s ) + 0.5 )
    // Another floating point roundoff issue
    let soff = 0
    if ( mus >= 1000000 ) {
        mus -= 1000000;
        soff = 1;
    }
    let mssinceepoch = Date.UTC( Y, M-1, D, h, m, s, mus/1000. );
    if ( soff != 0 ) {
        mssinceepoch += 1000 * soff;
    }
    return new Date( mssinceepoch );
}




// **********************************************************************

rkWebUtil.hideOrShow = function( widget, parameter, hideparams, showparams, displaytype="block" ) {
    if ( showparams.includes( parameter ) ) {
        widget.style.display = displaytype;
    }
    else if ( hideparams.includes( parameter ) ) {
        widget.style.display = "none";
    }
    else {
        window.alert( "Programmer error: rkWebUtil.hideOrShow unknown parameter " + parameter );
    }
}

// **********************************************************************
// Javascript's atob and btoa functions are disasters.  They don't
//   actually properly convert binary, they do weird things with and to
//   strings.  They certainly don't produce things you could send
//   somewhere else and use with base64 libraries anywhere else.  Also,
//   btoa can't eat an ArrayBuffer, even though that's what you read
//   files to.
//
// So I really know what I'm doing, I'm writing my own to actually
//   implement the standard, converting binary arryas to strings and back.
//   Of course, I *think* that javascript represents strings as UTF-16
//   internally, so you have to really treat the strings as encoded text,
//   and then decode them (manually) as ASCII to use them.
//
// These routines will be slow, so probably don't use them on big data.

rkWebUtil._b64letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
rkWebUtil._invb64letters = null;

rkWebUtil.b64encode = function( bytes )
{
    let i = 0;
    let encstr = '';

    while ( i+3 <= bytes.length ) {
        encstr += rkWebUtil._b64letters[ ( ( bytes[i]   & 0b11111100 ) >> 2 ) ];
        encstr += rkWebUtil._b64letters[ ( ( bytes[i]   & 0b00000011 ) << 4 ) +
                                         ( ( bytes[i+1] & 0b11110000 ) >> 4 ) ];
        encstr += rkWebUtil._b64letters[ ( ( bytes[i+1] & 0b00001111 ) << 2 ) +
                                         ( ( bytes[i+2] & 0b11000000 ) >> 6 ) ];
        encstr += rkWebUtil._b64letters[ ( ( bytes[i+2] & 0b00111111 ) ) ];
        i += 3;
    }

    let penultimatebyte = null;
    let ultimatebyte = null;
    if ( i < bytes.length ) {
        encstr += rkWebUtil._b64letters[ ( bytes[i] & 0b11111100 ) >> 2 ];
        penultimatebyte += ( bytes[i] & 0b00000011 ) << 4;
        if ( i+1 < bytes.length ) {
            penultimatebyte += ( bytes[i+1] & 0b11110000 ) >> 4;
            ultimatebyte = ( bytes[i+1] & 0b00001111 ) << 2;
        }
        encstr += rkWebUtil._b64letters[ penultimatebyte ];
        if ( ultimatebyte == null ) encstr += "==";
        else encstr += rkWebUtil._b64letters[ ultimatebyte ] + "=";
    }

    return encstr;
}


rkWebUtil.b64decode = function( text )
{
    if ( ( text.length % 4 ) != 0 ) {
        console.log( "ERROR : got b64 string of length " + text.length + ", which isn't a factor of 4" );
        return null;
    }

    // Making no assumptions about character encoding here
    // I could probably make this more efficient if I did
    if ( rkWebUtil._invb64letters == null ) {
        rkWebUtil._invb64letters = {};
        for ( let i in rkWebUtil._b64letters ) {
            rkWebUtil._invb64letters[ rkWebUtil._b64letters[i] ] = i;
        }
    }

    let len = text.length / 4 * 3;
    if ( text.substring( text.length-1, text.length ) == '=' ) {
        len -= 1;
        if ( text.substring( text.length-2, text.length-1 ) == '=' ) {
            len -= 1;
        }
    }
    let bytes = new Uint8Array( len );   // Initializes to zeros, I hope!

    let chardex = 0;
    let bytedex = 0;
    // There must be a cleverer way to do this
    while ( chardex < text.length ) {
        let encbyte0 = rkWebUtil._invb64letters[ text[chardex] ];
        let encbyte1 = rkWebUtil._invb64letters[ text[chardex+1] ];
        let encbyte2 = ( text[chardex+2] == "=" ) ? 0 : rkWebUtil._invb64letters[ text[chardex+2] ];
        let encbyte3 = ( text[chardex+3] == "=" ) ? 0 : rkWebUtil._invb64letters[ text[chardex+3] ];
        bytes[ bytedex ] = ( encbyte0 << 2 ) | ( ( encbyte1 & 0b110000 ) >> 4 );
        if ( bytedex+1 < len )
            bytes[ bytedex+1 ] = ( ( encbyte1 & 0b001111 ) << 4 ) | ( ( encbyte2 & 0b111100 ) >> 2 );
        if ( bytedex+2 < len ) {
            // Sigh.  Langauges that aren't strongly typed but still let you do bit operations.
            //   The "& 0b111111" on encbyte3 below should be wholly gratuitous, and yet without
            //   it there javascript was not doing the right things (it seemed to be wiping out
            //   any bits shifted over from encbyte2).  It would be better if I could explicitly
            //   declare these things as unit8.  (Or, maybe this is just javascript being
            //   mysterious and confusing, which is also a thing.)
            bytes[ bytedex+2 ] = ( ( encbyte2 & 0b000011 ) << 6 ) | ( encbyte3 & 0b111111 );
        }
        chardex += 4;
        bytedex += 3;
    }

    return bytes;
}


// For backwards compatibility with earlier versions of rkWebUtil:
// It's possible that this can replace b64encode above....
rkWebUtil.arrayBufferToB64 = function( buffer )
{
    // This will be wasteful if it's already a Uint8Array,
    //   but we want to be able to take either that or
    //   an ArrayBuffer
    let bytebuffer = new Uint8Array( buffer )
    let nbytes = bytebuffer.byteLength;
    let blob = '';
    for ( let i = 0 ; i < nbytes ; i += 1 ) {
        blob += String.fromCharCode( bytebuffer[i] );
    }
    let b64data = btoa( blob )
    return b64data;
}

// **********************************************************************

rkWebUtil.colorIntToCSSColor = function( colint ) {
    let r = Math.floor( colint / (65536) );
    let g = Math.floor( ( colint - r * 65536 ) / 256 );
    let b = colint - r * 65536 - g * 256;
    return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
}

// **********************************************************************
// **********************************************************************
// **********************************************************************
// A table that lets you sort by columns.
//
// To use:
//   * Instantiate the object, passing the stuff desribed in "to create".
//   * Access the created table with the table property of the object.
//     This is the thing you stick in your document.
//   * (Possibly, this may be a bad idea.)  Access the sorted rows with
//     the tablerows property of the object.
//
// To create:
//   * data : A data array that is in one of two formats:
//       * A list of dicts.  Each dict has one entry that is the value for each
//             column in one row.  All dicts in the list must have the same fields.
//             (...may not actually need to be a list of dicts?  Rows will be accessed
//              via "for ( let row of data )", so whatever works with that.)
//       * A dict of lists.  The keys of the dict correspond to the columns of the table.
//             All lists must have the same length.  Must set the "dictoflists" field
//             of props to true in this case.
//
//   * rowrenderer : A function that, given data and either a row dict (in the case where
//     data is a list of dicts) or an index (in the case where data is a dict of lists),
//     returns a tr document element that has that row of the table.
//
//     This rowrenderer will be called exactly once during objection creation for each row.
//     As such, it's safe for you to do things like cache the rows created yourself inside
//     this function, if for some reason you want to poke into the table and edit the rows
//     later.
//
//   * fields : An array of strings, the things to show in the columns of the header row.
//     For the table to make sense, rowrenderer must render each row with the same number
//     of columns as there are elements in fields, and the columns of each row must be
//     in the order given by fields.
//
//   * props : optional additional arugments in a structure, can include:
//       * dictoflists: True if data is a dict of lists; otherwise, the code
//         will assume that data is a list of dicts.
//       * fieldmap : a map of column header -> field name.  Field name is either
//         a key of data (if data is a dict of lists), or a key of each element.
//         of data (if data is a list of dicts).
//       * initsort : list of strings.  A description of how the data is initially sorted.
//            this is *only* used to render the table headers, the rows
//            is not sorted by this class when the table is first displayed.
//            This is a list of fields; each element of the list is a string
//            that should also be an element of fields, only starting with '+'
//            or '-' for incrementing or decrementing respectively.
//       * nosortfields : a list of fields (column header strings) that
//         the user should *not* be able to sort by.  By default, the
//         user can sort by all fields.
//       * tableclasses : list: CSS class names to assign to the table as a whole
//       * colorclasses : a list of CSS class names, which are intended to hold
//         background color styling.
//       * colorlength : The first colorlength rows will be given the first class
//         in colorlcasses.  The second colorlength rows the second, the third etc.,
//         wrapping back to the first once the list is exhausted.  Used for
//         things like alternating grey and white backgrounds every three rows.
//
// Depends on there being a "link" css class

rkWebUtil.SortableTable = class
{
    constructor( data, rowrenderer=null, fields=null, inprops )
    {
        let self = this;

        var props = { 'fieldmap': null,
                      'dictoflists': true,
                      'nosortfields': [],
                      'initsort': [],
                      'tableclasses': [],
                      'colorclasses': [],
                      'colorlength': 3 };
        Object.assign( props, inprops )

        if ( data == null ) {
            alert( "data cannot be null" );
            return
        }
        if ( rowrenderer == null ) {
            alert( "rowrenderer cannot be null" );
            return;
        }
        if ( fields == null ) {
            alert( "fields cannot be null" );
            return
        }
        this.fields = [...fields];
        if ( props.fieldmap == null ) {
            props.fieldmap = {};
            for ( let f of fields ) {
                props.fieldmap[f] = f;
            }
        }
        this.data = data;
        this.fieldmap = props.fieldmap;
        this.dictoflists = props.dictoflists;
        this.nosortfields = props.nosortfields;
        this.sortfields = [...props.initsort];
        this.tableclasses = [...props.tableclasses];
        this.colorclasses = [...props.colorclasses];
        this.colorlength = props.colorlength;

        this.table = rkWebUtil.elemaker( "table", null, { "classes": this.tableclasses } );
        this.addtableheader();

        this.tablerows = [];
        let colordex = 0;
        let countdown = this.colorlength;

        let dorow = (i) => {
            if ( countdown == 0 ) {
                colordex += 1;
                if ( colordex >= self.colorclasses.length ) colordex = 0;
                countdown = self.colorlength;
            }
            countdown -= 1;

            let tr;
            if ( self.dictoflists ) {
                tr = rowrenderer( self.data, i );
            } else {
                tr = rowrenderer( i );
            }
            if ( colordex < self.colorclasses.length ) {
                tr.classList.add( self.colorclasses[colordex] );
            }
            self.table.appendChild( tr );
            self.tablerows.push( tr );
        }

        if ( this.dictoflists ) {
            for ( let i in data[this.fieldmap[fields[0]]] ) {
                dorow( i );
            }
        }
        else {
            for ( let i of data ) {
                dorow( i );
            }
        }
    }

    addtableheader()
    {
        let self = this;
        let subscripts = [ '₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉' ];

        let tr = rkWebUtil.elemaker( "tr", this.table );
        for ( let field of this.fields ) {
            let th = rkWebUtil.elemaker( "th", tr );
            if ( this.nosortfields.indexOf( field ) >= 0 ) {
                th.appendChild( document.createTextNode( field ) )
            } else {
                let clickfunc = (e) => {
                    if ( self.sortfields.indexOf( '+' + field ) >= 0 )
                        self.resort_rows( field, false )
                    else
                        self.resort_rows( field, true );
                };
                let span = rkWebUtil.elemaker( "span", th, { "text": field,
                                                             "classes": [ "link" ],
                                                             "click": clickfunc } );
                let sortdex = self.sortfields.indexOf( '+' + field );
                if ( sortdex == 0 ) {
                    th.appendChild( document.createTextNode( '▲' ) );
                }
                else if ( ( sortdex > 0 ) && ( sortdex <= 9 ) ) {
                    th.appendChild( document.createTextNode( '▵' + subscripts[sortdex] ) );
                }
                sortdex = self.sortfields.indexOf( '-' + field );
                if ( sortdex == 0 ) {
                    th.appendChild( document.createTextNode( '▼' ) );
                }
                else if ( ( sortdex > 0 )  && ( sortdex <= 9 ) ) {
                    th.appendChild( document.createTextNode( '▿' + subscripts[sortdex] ) )
                }
            }
        }
    }

    resort_rows( field, increasing )
    {
        let self = this;

        let sorter = (a, b) => {
            for ( let field of self.sortfields ) {
                let incr = ( field[0] == '+' );
                let f = field.substring(1);
                let aval, bval;
                if ( self.dictoflists ) {
                    aval = self.data[ self.fieldmap[f] ][a];
                    bval = self.data[ self.fieldmap[f] ][b];
                }
                else {
                    aval = self.data[a][ self.fieldmap[f] ];
                    bval = self.data[b][ self.fieldmap[f] ];
                }

                if ( aval  > bval ) {
                    if ( incr )
                        return 1;
                    else
                        return -1;
                }
                else if ( aval < bval ) {
                    if ( incr )
                        return -1;
                    else
                        return 1;
                }
            }
            return 0;
        };

        // Remove field from the sort order if it's there
        let i = 0;
        while ( i < this.sortfields.length ) {
            if ( this.sortfields[i].substring( 1 ) == field )
                this.sortfields.splice( i, 1 );
            else
                i += 1;
        }
        // Add field to beginning of sort order
        if ( increasing )
            this.sortfields.splice( 0, 0, '+' + field );
        else
            this.sortfields.splice( 0, 0, '-' + field );

        let dexen = null;
        if ( self.dictoflists ) {
            dexen = Array.from( Array( this.data[ this.fieldmap[ this.fields[0] ] ].length ).keys() );
        }
        else {
            dexen = Array.from( Object.keys( this.data ) );
        }
        dexen.sort( sorter );

        rkWebUtil.wipeDiv( this.table );
        this.addtableheader();

        let colordex = 0;
        let countdown = this.colorlength;
        for ( let dex of dexen ) {
            if ( countdown == 0 ) {
                colordex += 1;
                if ( colordex >= this.colorclasses.length ) colordex = 0;
                countdown = this.colorlength;
            }
            countdown -= 1;

            this.tablerows[ dex ].classList.remove( ...this.colorclasses )
            if ( colordex < this.colorclasses.length )
                this.tablerows[ dex ].classList.add( this.colorclasses[colordex] );
            this.table.appendChild( this.tablerows[ dex ] );
        }
    }
};


// **********************************************************************
// **********************************************************************
// **********************************************************************
// Class for connecting to a given web server

rkWebUtil.Connector = class
{
    constructor( app )
    {
        this.app = app;
    }

    // **********************************************************************
    // Utility function used in HTTP request callbacks to make
    //  sure the data is in.  Returns false if the data is not in,
    //  returns true if it is.  Returns null if there
    //  was an error (including non-JSON response).
    //
    // errorhandler is a function that takes a single argument
    // that argument will have property "error" which is a string message

    waitForJSONResponse( request, errorhandler=null )
    {
        var type;

        // console.log( "request.readyState = " + request.readyState +
        //              ", request.stauts = " + request.status );
        if (request.readyState === 4 && request.status === 200) {
            type = request.getResponseHeader("Content-Type");
            if (type === "application/json")
            {
                return true;
            }
            else
            {
                if ( errorhandler != null ) {
                    errorhandler( { "error": "Request didn't return JSON, instead returned " + type }  );
                }
                else {
                    window.alert("Request didn't return JSON.  Everything is broken.  Panic.");
                }
                return null;
            }
        }
        else if (request.readyState == 4) {
            if ( errorhandler != null ) {
                errorhandler( { "error": "HTTP status " + request.status + " : " + request.responseText } );
            }
            else {
                window.alert("Error, got back HTTP status " + request.status + " : " + request.responseText );
            }
            return null;
        }
        else {
            return false;
        }
    }

    // **********************************************************************
    // Utility funciton to create and send an XMLHttpRequest, and wait
    // for it to be fully finished before calling the handler.
    //   appcommand -- the thing after the webapp, e.g. "/getquestionset"
    //   data -- an object to be converted with JSON.stringify and sent
    //   handler -- a function to be called when the request has fully returned
    //              it will have one argument, the data from the request
    //   errorhandler -- a function that takes a single argument that will
    //                   have property "error" which is a string message
    //
    //   finalcall --  function that has takes no arguments that will always
    //                 be called (think "finally" from a try/catch/finally block).


    sendHttpRequest( appcommand, data, handler, errorhandler=null, finalcall=null )
    {
        let self = this;
        let req = new XMLHttpRequest();
        // Try to work around a common usage issue.  A double slash at
        //   the beginning will be interpreted by the browser as
        //   https:// rather than just as / -- that is, if this.app is
        //   "/" and appcommand is "/status", it will try to load
        //   "https://status" rather than "/status", which will break
        //   (due to cross-site scripting restrinctions, never mind
        //   "status" not existing as a server).
        if ( ( this.app.substring( this.app.length -1 ) == '/' ) && ( appcommand.substring( 0 , 1 ) == '/' ) )
            appcommand = appcommand.substring( 1 )
        req.open( "POST", this.app + appcommand );
        req.onreadystatechange = function() { self.catchHttpResponse( req, handler, errorhandler=errorhandler,
                                                                      finalcall=finalcall ) };
        req.setRequestHeader( "Content-Type", "application/json" );
        req.send( JSON.stringify( data ) );
    }


    sendHttpRequestMultipartForm( appcommand, formdata, handler, errorhandler=null, finalcall=null )
    {
        let self = this;
        let req = new XMLHttpRequest();
        req.open( "POST", this.app + appcommand );
        req.onreadystatechange = function() { self.catchHttpResponse( req, handler, errorhandler, finalcall ) };
        req.send( formdata );
    }

    catchHttpResponse( req, handler, errorhandler=null, finalcall=null )
    {
        let jsonstate = this.waitForJSONResponse( req, errorhandler, finalcall );
        if ( ( jsonstate == null ) && ( finalcall != null) ) {
            finalcall();
            return;
        }
        if ( !jsonstate ) return;

        try {
            var statedata = JSON.parse( req.responseText );
        } catch (err) {
            window.alert( "Error parsing JSON! (" + err + ")" );
            console.trace();
            console.log( req.responseText );
            if ( finalcall != null ) finalcall();
            return;
        }
        if ( statedata.hasOwnProperty( "error" ) ) {
            if ( errorhandler != null ) {
                errorhandler( statedata );
            }
            else {
                window.alert( 'Error return: ' + statedata.error );
            }
            if ( finalcall != null ) finalcall();
            return;
        }
        handler( statedata );
        if ( finalcall != null ) finalcall();
    }
}

// **********************************************************************
// I'm honestly not sure how I want to format text, but I THINK I
// want to have paragraphs separated by \n\n.  This strips all the <p>
// and </p> tags from the text to move to that convention.

rkWebUtil.stripparagraphtags = function(text)
{
    var verystartpar = new RegExp("^\s*<p>", "g");
    var startpar = new RegExp("\n\s*<p>", "g");
    var endpar = new RegExp("</p>\s*\n", "g");
    var veryendpar = new RegExp("</p>\s*$", "g");

    var newtext = text.replace(verystartpar, "");
    newtext = newtext.replace(startpar, "\n");
    newtext = newtext.replace(endpar, "\n");
    newtext = newtext.replace(veryendpar, "");

    return newtext;
}

// **********************************************************************
// **********************************************************************
// **********************************************************************
// Class for creating a tabbed div.  To work, the css must have defined
// the following classes (overridable in params):
//    div.hbox          (horiziontal flex box)
//    button.tabsel     (selected tab)
//    button.tabunsel   (unselected tab)
//    div.tabdiv        (the overall div of the element with button and contents)
//    div.buttonboxdiv  (the div holding the buttons)
//    div.tabcontentdiv (the div holding the tab contents)
//
// Properties:
//   div : the overall div of the elemnt

rkWebUtil.Tabbed = function( parentdiv, params ) {
    this.hbox = 'hbox';
    this.tabselcss = 'tabsel';
    this.tabunselcss = 'tabunsel';
    this.tabdivcss = 'tabdiv';
    this.tabcontentdivcss = 'tabcontentdiv';
    this.buttonboxdivcss = 'buttonboxdiv';
    this.buttonelem = 'h3';
    Object.assign( this, params );

    this.selltab = null;
    this.tabs = [];
    this.buttons = {};
    this.divs = {};
    this.focuscallbacks = {};
    this.blurcallbacks = {};

    this.div = rkWebUtil.elemaker( "div", parentdiv, { "classes": [ this.tabdivcss ] } );
    this.buttonbox = rkWebUtil.elemaker( "div", this.div, { "classes": [ this.buttonboxdivcss ] } );
    this.tabcontentdiv = rkWebUtil.elemaker( "div", this.div, { "classes": [ this.tabcontentdivcss ] } );
}

rkWebUtil.Tabbed.prototype.addTab = function( tab, buttontext, div, sel=false,
                                              focuscallback=null, blurcallback=null )
{
    let self = this;

    this.tabs.push( tab );
    this.buttons[tab] = rkWebUtil.elemaker( "button", this.buttonbox,
                                            { "classes": [ this.tabunselcss ],
                                              "text": buttontext,
                                              "click": function() { self.selectTab( tab ) } } );
    this.divs[tab] = div;
    this.focuscallbacks[tab] = focuscallback;
    this.blurcallbacks[tab] = blurcallback;

    if ( sel ) this.selectTab( tab );
}

rkWebUtil.Tabbed.prototype.selectTab = function( tab )
{
    if ( this.seltab == tab ) return;

    if ( ( this.seltab != null ) && ( this.blurcallbacks[this.seltab] != null ) )
        this.blurcallbacks[this.seltab]();

    rkWebUtil.wipeDiv( this.tabcontentdiv );
    this.tabcontentdiv.appendChild( this.divs[ tab ] );

    for ( let buttab of this.tabs ) {
        if ( buttab == tab ) {
            this.buttons[buttab].classList.remove( this.tabunselcss );
            this.buttons[buttab].classList.add( this.tabselcss );
        }
        else {
            this.buttons[buttab].classList.remove( this.tabselcss );
            this.buttons[buttab].classList.add( this.tabunselcss );
        }
    }

    this.seltab = tab;
    if ( this.focuscallbacks[tab] != null )
        this.focuscallbacks[tab]();
}

// **********************************************************************

export { rkWebUtil }

