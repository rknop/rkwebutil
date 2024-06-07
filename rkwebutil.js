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
    var props = { text: null, dblclick: null, click: null, change:null, classes: null, attributes: null, svg:false };
    Object.assign( props, inprops );
    var text = props.text
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
    if ( datestr.value.trim() == "" ) {
        datestr.value = ""
        return;
    }
    let num = Date.parse( datestr.value.trim() );
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

